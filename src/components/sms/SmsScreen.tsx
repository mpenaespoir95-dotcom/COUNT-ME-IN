import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  MessageSquare,
  Send,
  Copy,
  Check,
  Users,
  UserCheck,
  Search,
  CheckSquare,
  Square,
  QrCode,
  Wifi,
  WifiOff,
  Loader2,
  LogOut,
  AlertCircle,
  CheckCircle2,
  Clock,
  Save,
  PauseCircle,
  PlayCircle,
  Zap,
  Sliders,
  Coins,
  FileText,
  History,
  X,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { useAppStore } from '../../context/AppContext';
import { AppPanel, PageHeading, SectionHeading } from '../common/UIComponents';
import { Contact } from '../../types';
import {
  WhatsAppDirectService,
  WhatsAppDirectStatus,
} from '../../services/whatsappDirectService';
import { FirebaseSyncService } from '../../services/firebaseSyncService';
import {
  CategoryScheduleRule,
  CurrencyRateInventoryEntry,
  GoldPriceQuoteEntry,
  WEEKDAY_LABELS_FR,
  WHATSAPP_CATEGORY_META,
  WhatsAppAutomationSettings,
  WhatsAppAutomationState,
  WhatsAppBusinessCategory,
  WhatsAppCampaignRecord,
  WhatsAppCampaignType,
  WhatsAppMessageLog,
  WhatsAppMessageTemplate,
} from '../../types/whatsappAutomation';
import { WhatsAppCrmTab } from './WhatsAppCrmTab';
import { WhatsAppPricesStockTab } from './WhatsAppPricesStockTab';
import { WhatsAppTemplatesPreviewTab } from './WhatsAppTemplatesPreviewTab';
import { WhatsAppHistoryAuditTab } from './WhatsAppHistoryAuditTab';

type SmsWorkspaceTab = 'automation' | 'crm' | 'prices' | 'templates' | 'history';

type AudienceFilter =
  | 'ALL'
  | 'CLIENTS'
  | 'SUPPLIERS'
  | 'PARTNERS'
  | 'CURRENCY'
  | 'GOLD'
  | 'CUSTOM';

type SendScope = 'GROUP' | 'SINGLE';

const AUDIENCE_OPTIONS: Array<{ id: AudienceFilter; label: string }> = [
  { id: 'ALL', label: 'Tous' },
  { id: 'CLIENTS', label: 'Clients uniquement' },
  { id: 'SUPPLIERS', label: 'Fournisseurs uniquement' },
  { id: 'PARTNERS', label: 'Partenaires' },
  { id: 'CURRENCY', label: 'Devises (Change)' },
  { id: 'GOLD', label: 'Or & Bijoux' },
  { id: 'CUSTOM', label: 'Sélection manuelle' },
];

function matchesAudience(contact: Contact, filter: AudienceFilter): boolean {
  const rolesLower = (contact.roles || []).map((r) => r.toLowerCase());
  switch (filter) {
    case 'CLIENTS':
      return rolesLower.some((r) => r.includes('client'));
    case 'SUPPLIERS':
      return rolesLower.some((r) => r.includes('fournisseur'));
    case 'PARTNERS':
      return rolesLower.some((r) => r.includes('partenaire'));
    case 'CURRENCY':
      return rolesLower.some((r) => r.includes('devise') || r.includes('change'));
    case 'GOLD':
      return rolesLower.some((r) => r.includes('or') || r.includes('bijou'));
    case 'ALL':
    case 'CUSTOM':
    default:
      return true;
  }
}

export const SmsScreen: React.FC = () => {
  const store = useAppStore();
  const canSendSms = store.canAccessService(8, 'sms.send');
  const canValidate = store.canAccessService(8, 'sms.validate');
  const canManageContacts = store.canAccessService(8, 'sms.contacts');

  const [activeTab, setActiveTab] = useState<SmsWorkspaceTab>('automation');

  // --- Passerelle WhatsApp Direct ---
  const [waStatus, setWaStatus] = useState<WhatsAppDirectStatus | null>(null);
  const [waLoadingAction, setWaLoadingAction] = useState(false);

  // --- Moteur d'automatisation 09h00 (Cahier des charges) ---
  const [automationState, setAutomationState] = useState<WhatsAppAutomationState | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<WhatsAppAutomationSettings | null>(null);
  const [schedulesDraft, setSchedulesDraft] = useState<CategoryScheduleRule[]>([]);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [runningExceptional, setRunningExceptional] = useState(false);

  // --- Envoi manuel rapide (préservé) ---
  const contactsWithPhone = useMemo(
    () =>
      store.contacts.filter(
        (c) => !c.archived && !c.unsubscribed && Boolean(c.phone && c.phone.trim())
      ),
    [store.contacts]
  );

  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>('ALL');
  const [sendScope, setSendScope] = useState<SendScope>('GROUP');
  const [contactSearch, setContactSearch] = useState('');
  const [customSelectedRefs, setCustomSelectedRefs] = useState<string[]>([]);
  const [selectedContactRef, setSelectedContactRef] = useState(
    contactsWithPhone[0]?.reference || ''
  );
  const [messageText, setMessageText] = useState('');
  const [copied, setCopied] = useState(false);
  const [sentMessages, setSentMessages] = useState<
    Array<{
      to: string;
      phone: string;
      category: string;
      text: string;
      time: string;
      via?: 'direct' | 'wa_me';
    }>
  >([]);
  const [dispatchedRefs, setDispatchedRefs] = useState<Record<string, boolean>>({});
  const [isSendingDirect, setIsSendingDirect] = useState(false);
  const [directProgress, setDirectProgress] = useState<string | null>(null);
  const [sendFeedback, setSendFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const syncStateToFirestore = useCallback(
    async (
      nextState: WhatsAppAutomationState,
      opts?: { campaign?: WhatsAppCampaignRecord; logs?: WhatsAppMessageLog[] }
    ) => {
      if (!store.isSignedIn) return;
      try {
        if (opts?.campaign) {
          await FirebaseSyncService.saveWhatsAppCampaign(opts.campaign);
        }
        if (opts?.logs && opts.logs.length > 0) {
          await Promise.all(
            opts.logs.slice(0, 60).map((log) => FirebaseSyncService.saveWhatsAppMessageLog(log))
          );
        }
        if (nextState.auditLogs.length > 0) {
          await FirebaseSyncService.saveWhatsAppAuditLog(nextState.auditLogs[0]);
        }
      } catch {
        // best effort Firestore sync
      }
    },
    [store.isSignedIn]
  );

  const fetchWaStatus = useCallback(async () => {
    try {
      const next = await WhatsAppDirectService.getStatus();
      setWaStatus(next);
    } catch {
      // ignore polling error when server restarts
    }
  }, []);

  const fetchAutomationState = useCallback(
    async (forceSyncForm = false) => {
      try {
        const next = await WhatsAppDirectService.getAutomationState();
        setAutomationState(next);
        if (forceSyncForm || !settingsDirty) {
          setSettingsDraft(next.settings);
          setSchedulesDraft(next.categorySchedules);
        }
      } catch {
        // ignore polling error when server restarts
      }
    },
    [settingsDirty]
  );

  useEffect(() => {
    void fetchWaStatus();
    void fetchAutomationState(true);
  }, [fetchWaStatus, fetchAutomationState]);

  useEffect(() => {
    const intervalMs =
      waStatus?.status === 'connecting' || waStatus?.status === 'qr_ready' ? 2000 : 8000;
    const id = setInterval(() => {
      void fetchWaStatus();
    }, intervalMs);
    return () => clearInterval(id);
  }, [waStatus?.status, fetchWaStatus]);

  useEffect(() => {
    const id = setInterval(() => {
      void fetchAutomationState(false);
    }, 15000);
    return () => clearInterval(id);
  }, [fetchAutomationState]);

  const isDirectConnected = Boolean(
    waStatus?.apiConfigured || waStatus?.status === 'connected'
  );

  const handleConnectWhatsAppDirect = async (reset = false) => {
    setWaLoadingAction(true);
    setSendFeedback(null);
    try {
      const next = await WhatsAppDirectService.connect(reset);
      setWaStatus(next);
    } catch (err) {
      setSendFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Impossible de démarrer la session WhatsApp.',
      });
    } finally {
      setWaLoadingAction(false);
    }
  };

  const handleDisconnectWhatsAppDirect = async () => {
    setWaLoadingAction(true);
    try {
      const next = await WhatsAppDirectService.disconnect();
      setWaStatus(next);
      setSendFeedback({
        type: 'info',
        message: 'Session WhatsApp directe déconnectée.',
      });
    } catch (err) {
      setSendFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erreur lors de la déconnexion.',
      });
    } finally {
      setWaLoadingAction(false);
    }
  };

  // --- Actions moteur automatisation ---
  const handleSaveAutomationSettings = async (overrideSettings?: Partial<WhatsAppAutomationSettings>) => {
    if (!canValidate || !settingsDraft) return;
    setSavingSettings(true);
    setSendFeedback(null);
    try {
      const next = await WhatsAppDirectService.saveAutomationSettings({
        settings: { ...settingsDraft, ...overrideSettings },
        categorySchedules: schedulesDraft,
        actorName: store.userName,
        actorRole: store.currentRole,
      });
      setAutomationState(next);
      setSettingsDraft(next.settings);
      setSchedulesDraft(next.categorySchedules);
      setSettingsDirty(false);
      await syncStateToFirestore(next);
      setSendFeedback({
        type: 'success',
        message: `Configuration d’automatisation enregistrée (${next.nextRunLabel}).`,
      });
    } catch (err) {
      setSendFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Impossible d’enregistrer la configuration.',
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleToggleAutomationPaused = async () => {
    if (!canValidate || !settingsDraft) return;
    const nextPaused = !settingsDraft.paused;
    await handleSaveAutomationSettings({ paused: nextPaused });
  };

  const handleToggleAutomationEnabled = async () => {
    if (!canValidate || !settingsDraft) return;
    const nextEnabled = !settingsDraft.enabled;
    await handleSaveAutomationSettings({ enabled: nextEnabled });
  };

  const handleDismissAdminAlert = async () => {
    try {
      const next = await WhatsAppDirectService.clearAdminAlert();
      setAutomationState(next);
    } catch {
      // ignore
    }
  };

  const handleSaveGoldPrice = async (
    quote: Partial<GoldPriceQuoteEntry> & { category: 'OR_BRUT' | 'OR_FONDU' | 'BIJOUX' }
  ) => {
    const next = await WhatsAppDirectService.saveGoldPriceQuote({
      quote,
      actorName: store.userName,
      actorRole: store.currentRole,
    });
    setAutomationState(next);
    await syncStateToFirestore(next);
  };

  const handleSaveCurrencyRates = async (
    rates: CurrencyRateInventoryEntry[],
    summaryNote?: string
  ) => {
    const next = await WhatsAppDirectService.saveCurrencyRates({
      rates,
      actorName: store.userName,
      actorRole: store.currentRole,
      summaryNote,
    });
    setAutomationState(next);
    await syncStateToFirestore(next);
  };

  const handleSaveTemplate = async (template: WhatsAppMessageTemplate) => {
    const next = await WhatsAppDirectService.saveTemplate({
      template,
      actorName: store.userName,
      actorRole: store.currentRole,
    });
    setAutomationState(next);
    await syncStateToFirestore(next);
  };

  const handleRunCampaign = async (opts: {
    type: WhatsAppCampaignType;
    categories?: WhatsAppBusinessCategory[];
    ignoreDailyDedupe?: boolean;
    notes?: string;
  }) => {
    const res = await WhatsAppDirectService.runAutomationCampaign({
      ...opts,
      actorName: store.userName,
      actorRole: store.currentRole,
    });
    setAutomationState(res.state);
    await syncStateToFirestore(res.state, {
      campaign: res.campaign,
      logs: res.createdLogs,
    });
  };

  const handleQuickExceptionalBroadcast = async () => {
    if (!canValidate || runningExceptional) return;
    setRunningExceptional(true);
    setSendFeedback(null);
    try {
      await handleRunCampaign({
        type: 'exceptional',
        ignoreDailyDedupe: true,
        notes: 'Diffusion exceptionnelle déclenchée depuis le tableau 09h00',
      });
      setSendFeedback({
        type: 'success',
        message: 'Diffusion exceptionnelle exécutée selon les règles de validation et de stock.',
      });
      setActiveTab('history');
    } catch (err) {
      setSendFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Échec de la diffusion exceptionnelle.',
      });
    } finally {
      setRunningExceptional(false);
    }
  };

  const handleToggleCampaignPause = async (campaignId: string, paused: boolean) => {
    const next = await WhatsAppDirectService.toggleCampaignPause({
      campaignId,
      paused,
      actorName: store.userName,
      actorRole: store.currentRole,
    });
    setAutomationState(next);
    const updatedCampaign = next.campaigns.find((c) => c.id === campaignId);
    await syncStateToFirestore(next, { campaign: updatedCampaign });
  };

  const handleCancelCampaign = async (campaignId: string) => {
    const next = await WhatsAppDirectService.cancelCampaign({
      campaignId,
      actorName: store.userName,
      actorRole: store.currentRole,
    });
    setAutomationState(next);
    const updatedCampaign = next.campaigns.find((c) => c.id === campaignId);
    await syncStateToFirestore(next, { campaign: updatedCampaign });
  };

  const handleRetryQueue = async (opts?: { campaignId?: string; logId?: string }) => {
    const res = await WhatsAppDirectService.retryQueue(opts);
    setAutomationState(res.state);
    await syncStateToFirestore(res.state, {
      logs: res.state.logs.slice(0, 20),
    });
    return res.retriedCount;
  };

  const handleCrmAudit = useCallback(
    (action: string, summary: string) => {
      if (!store.isSignedIn) return;
      void FirebaseSyncService.saveWhatsAppAuditLog({
        id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        actorName: store.userName,
        actorRole: store.currentRole,
        action,
        entityType: 'contact',
        summary,
      });
    },
    [store.isSignedIn, store.userName, store.currentRole]
  );

  const updateScheduleRow = (
    cat: WhatsAppBusinessCategory,
    patch: Partial<CategoryScheduleRule>
  ) => {
    setSchedulesDraft((prev) =>
      prev.map((row) => (row.category === cat ? { ...row, ...patch } : row))
    );
    setSettingsDirty(true);
  };

  // --- Logique envoi manuel rapide ---
  const audienceCounts = useMemo(() => {
    const counts: Record<AudienceFilter, number> = {
      ALL: contactsWithPhone.length,
      CLIENTS: 0,
      SUPPLIERS: 0,
      PARTNERS: 0,
      CURRENCY: 0,
      GOLD: 0,
      CUSTOM: customSelectedRefs.length,
    };
    for (const c of contactsWithPhone) {
      if (matchesAudience(c, 'CLIENTS')) counts.CLIENTS += 1;
      if (matchesAudience(c, 'SUPPLIERS')) counts.SUPPLIERS += 1;
      if (matchesAudience(c, 'PARTNERS')) counts.PARTNERS += 1;
      if (matchesAudience(c, 'CURRENCY')) counts.CURRENCY += 1;
      if (matchesAudience(c, 'GOLD')) counts.GOLD += 1;
    }
    return counts;
  }, [contactsWithPhone, customSelectedRefs.length]);

  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    return contactsWithPhone.filter((c) => {
      if (audienceFilter !== 'CUSTOM' && !matchesAudience(c, audienceFilter)) {
        return false;
      }
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        (c.city || '').toLowerCase().includes(q) ||
        c.roles.some((r) => r.toLowerCase().includes(q))
      );
    });
  }, [contactsWithPhone, audienceFilter, contactSearch]);

  const targetGroupContacts = useMemo(() => {
    if (audienceFilter === 'CUSTOM') {
      const selectedSet = new Set(customSelectedRefs);
      return contactsWithPhone.filter((c) => selectedSet.has(c.reference));
    }
    return filteredContacts;
  }, [audienceFilter, customSelectedRefs, contactsWithPhone, filteredContacts]);

  useEffect(() => {
    if (filteredContacts.length === 0) {
      if (selectedContactRef) setSelectedContactRef('');
      return;
    }
    if (!filteredContacts.some((c) => c.reference === selectedContactRef)) {
      setSelectedContactRef(filteredContacts[0].reference);
    }
  }, [filteredContacts, selectedContactRef]);

  const selectedContact =
    filteredContacts.find((c) => c.reference === selectedContactRef) || filteredContacts[0];

  const currentAudienceLabel =
    AUDIENCE_OPTIONS.find((opt) => opt.id === audienceFilter)?.label || 'Tous';

  const handleCopy = () => {
    navigator.clipboard.writeText(messageText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatPersonalizedMessage = (rawTemplate: string, contact: Contact) => {
    const base =
      rawTemplate.trim() ||
      'Bonjour {nom}, CAMS GOLD vous souhaite une excellente journée. Contactez-nous pour vos opérations Or et Devises.';
    return base.replace(/\{nom\}/gi, contact.name);
  };

  const toggleCustomContact = (ref: string) => {
    setCustomSelectedRefs((prev) =>
      prev.includes(ref) ? prev.filter((item) => item !== ref) : [...prev, ref]
    );
  };

  const selectAllFilteredForCustom = () => {
    const filteredRefs = filteredContacts.map((c) => c.reference);
    setCustomSelectedRefs((prev) => Array.from(new Set([...prev, ...filteredRefs])));
  };

  const clearCustomSelection = () => {
    setCustomSelectedRefs([]);
  };

  const openWhatsAppForContact = (contact: Contact, body: string) => {
    const cleanPhone = contact.phone.replace(/[^\d]/g, '');
    if (!cleanPhone) return;
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(body)}`;
    const link = document.createElement('a');
    link.href = whatsappUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const broadcastToTargetGroup = async () => {
    if (!canSendSms || targetGroupContacts.length === 0) return;
    setSendFeedback(null);

    if (isDirectConnected) {
      setIsSendingDirect(true);
      let okCount = 0;
      const failedNames: string[] = [];

      for (let i = 0; i < targetGroupContacts.length; i += 1) {
        const c = targetGroupContacts[i];
        const body = formatPersonalizedMessage(messageText, c);
        setDirectProgress(`Envoi direct ${i + 1}/${targetGroupContacts.length} (${c.name})…`);
        try {
          await WhatsAppDirectService.sendText(c.phone, body);
          okCount += 1;
          setDispatchedRefs((prev) => ({ ...prev, [c.reference]: true }));
          setSentMessages((prev) => [
            {
              to: c.name,
              phone: c.phone,
              category: c.roles[0] || currentAudienceLabel,
              text: body,
              time: 'À l’instant',
              via: 'direct',
            },
            ...prev,
          ]);
        } catch (err) {
          failedNames.push(`${c.name} (${err instanceof Error ? err.message : 'échec'})`);
        }
        if (i < targetGroupContacts.length - 1) {
          await new Promise((r) => setTimeout(r, 650));
        }
      }

      setDirectProgress(null);
      setIsSendingDirect(false);
      if (failedNames.length === 0) {
        setSendFeedback({
          type: 'success',
          message: `${okCount} message(s) envoyé(s) directement sur WhatsApp.`,
        });
      } else {
        setSendFeedback({
          type: 'error',
          message: `${okCount} envoyé(s), ${failedNames.length} échec(s) : ${failedNames.slice(0, 2).join(' · ')}`,
        });
      }
      return;
    }

    const newEntries = targetGroupContacts.map((c) => ({
      to: c.name,
      phone: c.phone,
      category: currentAudienceLabel,
      text: formatPersonalizedMessage(messageText, c),
      time: 'À l’instant',
      via: 'wa_me' as const,
    }));
    setSentMessages((prev) => [...newEntries, ...prev]);

    const first = targetGroupContacts[0];
    setDispatchedRefs({ [first.reference]: true });
    openWhatsAppForContact(first, formatPersonalizedMessage(messageText, first));
    setSendFeedback({
      type: 'info',
      message:
        'Session directe non connectée : WhatsApp ouvert via lien wa.me. Connectez la passerelle API ou le QR Code pour envoyer automatiquement.',
    });
  };

  const handleSendSingle = async () => {
    if (!canSendSms || !selectedContact || !messageText.trim()) return;
    const body = formatPersonalizedMessage(messageText, selectedContact);
    setSendFeedback(null);

    if (isDirectConnected) {
      setIsSendingDirect(true);
      setDirectProgress(`Envoi direct à ${selectedContact.name}…`);
      try {
        await WhatsAppDirectService.sendText(selectedContact.phone, body);
        setSentMessages((prev) => [
          {
            to: selectedContact.name,
            phone: selectedContact.phone,
            category: selectedContact.roles[0] || currentAudienceLabel,
            text: body,
            time: 'À l’instant',
            via: 'direct',
          },
          ...prev,
        ]);
        setDispatchedRefs((prev) => ({ ...prev, [selectedContact.reference]: true }));
        setSendFeedback({
          type: 'success',
          message: `Message envoyé directement à ${selectedContact.name} (${selectedContact.phone}).`,
        });
      } catch (err) {
        setSendFeedback({
          type: 'error',
          message: err instanceof Error ? err.message : 'Échec de l’envoi direct WhatsApp.',
        });
      } finally {
        setDirectProgress(null);
        setIsSendingDirect(false);
      }
      return;
    }

    setSentMessages((prev) => [
      {
        to: selectedContact.name,
        phone: selectedContact.phone,
        category: selectedContact.roles[0] || currentAudienceLabel,
        text: body,
        time: 'À l’instant',
        via: 'wa_me',
      },
      ...prev,
    ]);
    setDispatchedRefs((prev) => ({ ...prev, [selectedContact.reference]: true }));
    openWhatsAppForContact(selectedContact, body);
  };

  const handleSendOneFromQueue = async (contact: Contact) => {
    if (!canSendSms) return;
    const body = formatPersonalizedMessage(messageText, contact);
    setSendFeedback(null);

    if (isDirectConnected) {
      setIsSendingDirect(true);
      setDirectProgress(`Envoi direct à ${contact.name}…`);
      try {
        await WhatsAppDirectService.sendText(contact.phone, body);
        setDispatchedRefs((prev) => ({ ...prev, [contact.reference]: true }));
        setSentMessages((prev) => [
          {
            to: contact.name,
            phone: contact.phone,
            category: contact.roles[0] || currentAudienceLabel,
            text: body,
            time: 'À l’instant',
            via: 'direct',
          },
          ...prev,
        ]);
      } catch (err) {
        setSendFeedback({
          type: 'error',
          message: err instanceof Error ? err.message : `Échec d’envoi à ${contact.name}.`,
        });
      } finally {
        setDirectProgress(null);
        setIsSendingDirect(false);
      }
      return;
    }

    setDispatchedRefs((prev) => ({ ...prev, [contact.reference]: true }));
    setSentMessages((prev) => [
      {
        to: contact.name,
        phone: contact.phone,
        category: contact.roles[0] || currentAudienceLabel,
        text: body,
        time: 'À l’instant',
        via: 'wa_me',
      },
      ...prev,
    ]);
    openWhatsAppForContact(contact, body);
  };

  if (!canSendSms) {
    return (
      <div className="p-4 sm:p-7 max-w-7xl mx-auto space-y-6">
        <PageHeading
          eyebrow="Communication · Module WhatsApp"
          title="Diffusion automatique des prix & disponibilités"
        />
        <AppPanel className="p-8 text-center text-xs text-gray-500">
          Votre compte n’est pas autorisé à accéder au module WhatsApp / SMS. Contactez l’administrateur.
        </AppPanel>
      </div>
    );
  }

  const autoStatusLabel = !settingsDraft?.enabled
    ? 'INACTIF'
    : settingsDraft.paused
      ? 'EN PAUSE'
      : `ACTIF · ${String(settingsDraft.hour).padStart(2, '0')}h${String(settingsDraft.minute).padStart(2, '0')}`;

  return (
    <div className="p-4 sm:p-7 max-w-7xl mx-auto space-y-6">
      <PageHeading
        eyebrow="CAMS GOLD · Module WhatsApp (Cahier des charges v1.0)"
        title="Diffusion automatique des prix & disponibilités"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {automationState && (
              <span className="px-3 py-2 rounded-xl bg-white border border-[#E8D8BE] text-xs font-bold text-[#192A24]">
                {automationState.settings.timezone || 'Africa/Brazzaville'} : {automationState.localTime}
              </span>
            )}
            <button
              type="button"
              disabled={!canValidate || savingSettings || !settingsDraft}
              onClick={() => void handleToggleAutomationPaused()}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border cursor-pointer disabled:opacity-50 ${
                settingsDraft?.paused
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : settingsDraft?.enabled
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                    : 'bg-white border-gray-200 text-gray-600'
              }`}
            >
              {settingsDraft?.paused ? <PlayCircle size={14} /> : <PauseCircle size={14} />}
              <span>{autoStatusLabel}</span>
            </button>
            <button
              type="button"
              disabled={!canValidate || runningExceptional}
              onClick={() => void handleQuickExceptionalBroadcast()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#D39725] hover:bg-[#BA841E] disabled:opacity-50 text-white text-xs font-extrabold cursor-pointer"
            >
              {runningExceptional ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Zap size={14} />
              )}
              <span>Diffusion exceptionnelle</span>
            </button>
          </div>
        }
      />

      {/* Alerte Administrateur en cas d'indisponibilité WhatsApp à 09h00 */}
      {automationState?.settings.adminAlertMessage && (
        <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-xs font-bold text-red-900 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0 text-red-700" />
            <span>{automationState.settings.adminAlertMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => void handleDismissAdminAlert()}
            className="p-1 rounded-lg hover:bg-red-100 text-red-700 cursor-pointer"
            title="Fermer l’alerte"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Passerelle WhatsApp Business (Meta Cloud API / UltraMsg / D7 / QR Trial) */}
      <AppPanel className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`p-2.5 rounded-xl shrink-0 ${
                isDirectConnected
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-[#FFF4D6] text-[#9E731B]'
              }`}
            >
              {isDirectConnected ? <Wifi size={20} /> : <QrCode size={20} />}
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-black text-[#192A24]">
                  Passerelle WhatsApp Business & Envoi Direct
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                    waStatus?.apiConfigured
                      ? 'bg-emerald-100 text-emerald-800'
                      : waStatus?.status === 'connected'
                        ? 'bg-emerald-100 text-emerald-800'
                        : waStatus?.status === 'qr_ready'
                          ? 'bg-amber-100 text-amber-900'
                          : waStatus?.status === 'connecting'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {waStatus?.apiConfigured
                    ? `${waStatus.providerName || 'API WhatsApp'}${
                        waStatus.connectedPhone ? ` · ${waStatus.connectedPhone}` : ' actif'
                      }`
                    : waStatus?.status === 'connected'
                      ? `Connecté (${waStatus.connectedPhone || 'WhatsApp lié'})`
                      : waStatus?.status === 'qr_ready'
                        ? 'QR Code prêt à scanner'
                        : waStatus?.status === 'connecting'
                          ? 'Connexion en cours…'
                          : 'Non connecté'}
                </span>
              </div>
              <p className="text-xs text-[#7D8176]">
                {waStatus?.apiConfigured
                  ? `Passerelle officielle ${waStatus.providerName} active (${
                      waStatus.connectedPhone || waStatus.d7Originator || 'API'
                    }). Les webhooks de livraison (accepté/livré/lu/échec) et le désabonnement automatique STOP sont gérés côté serveur.`
                  : waStatus?.status === 'connected'
                    ? `Session WhatsApp (${waStatus.connectedPhone || waStatus.connectedName}) connectée : les campagnes 09h00 et messages manuels partent automatiquement.`
                    : 'Connectez Meta WhatsApp Cloud API (.env), UltraMsg, D7 Networks ou scannez le QR Code d’essai pour l’envoi automatique à 09h00.'}
              </p>
            </div>
          </div>

          {!waStatus?.apiConfigured && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {waStatus?.status === 'connected' ? (
                <button
                  type="button"
                  disabled={waLoadingAction}
                  onClick={() => void handleDisconnectWhatsAppDirect()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  <LogOut size={14} />
                  <span>Déconnecter</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={waLoadingAction}
                    onClick={() => void handleConnectWhatsAppDirect(false)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#192A24] hover:bg-[#253D34] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                  >
                    {waLoadingAction || waStatus?.status === 'connecting' ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <QrCode size={14} />
                    )}
                    <span>
                      {waStatus?.status === 'qr_ready'
                        ? 'Actualiser le QR Code'
                        : 'Connecter WhatsApp (QR Code)'}
                    </span>
                  </button>
                  {waStatus?.status === 'qr_ready' && (
                    <button
                      type="button"
                      disabled={waLoadingAction}
                      onClick={() => void handleConnectWhatsAppDirect(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E8D8BE] bg-white hover:bg-[#FAF8F3] text-[#192A24] text-xs font-bold cursor-pointer"
                    >
                      <WifiOff size={14} />
                      <span>Réinitialiser</span>
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {waStatus?.lastError && (
          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900 flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>{waStatus.lastError}</span>
          </div>
        )}

        {waStatus?.status === 'qr_ready' && waStatus.qrDataUrl && (
          <div className="p-4 rounded-2xl bg-[#FAF8F3] border border-[#E8D8BE] flex flex-col sm:flex-row items-center gap-5">
            <div className="p-2.5 bg-white rounded-xl border border-[#E8D8BE] shadow-xs shrink-0">
              <img
                src={waStatus.qrDataUrl}
                alt="QR Code connexion directe WhatsApp"
                className="w-44 h-44 object-contain"
              />
            </div>
            <div className="space-y-2 text-xs text-[#192A24]">
              <div className="font-black text-sm">
                Scannez ce QR Code avec votre téléphone :
              </div>
              <ol className="list-decimal list-inside space-y-1 text-[#555B54]">
                <li>Ouvrez <strong>WhatsApp</strong> sur votre téléphone.</li>
                <li>Allez dans <strong>Menu / Réglages → Appareils connectés</strong>.</li>
                <li>Appuyez sur <strong>Connecter un appareil</strong> et scannez ce code.</li>
              </ol>
            </div>
          </div>
        )}

        {sendFeedback && (
          <div
            className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 ${
              sendFeedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : sendFeedback.type === 'error'
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            <div className="flex items-center gap-2">
              {sendFeedback.type === 'success' ? (
                <CheckCircle2 size={15} className="shrink-0" />
              ) : (
                <AlertCircle size={15} className="shrink-0" />
              )}
              <span>{sendFeedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setSendFeedback(null)}
              className="cursor-pointer opacity-70 hover:opacity-100"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </AppPanel>

      {/* Barre de navigation des 5 onglets du Cahier des charges */}
      <div className="flex flex-wrap gap-2 p-1.5 rounded-2xl bg-white border border-[#E8D8BE]">
        {[
          { id: 'automation' as const, label: 'Automatisation 09h00 & Rapide', icon: <Sliders size={14} /> },
          { id: 'crm' as const, label: `CRM Contacts (${store.contacts.filter((c) => !c.archived).length})`, icon: <Users size={14} /> },
          { id: 'prices' as const, label: 'Prix Or & Stocks Devises', icon: <Coins size={14} /> },
          { id: 'templates' as const, label: 'Modèles & Prévisualisation', icon: <FileText size={14} /> },
          {
            id: 'history' as const,
            label: `Historique & Audit (${automationState?.logs.length ?? 0})`,
            icon: <History size={14} />,
          },
        ].map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold transition-colors cursor-pointer ${
                active
                  ? 'bg-[#192A24] text-white'
                  : 'text-[#555B54] hover:bg-[#FAF8F3] hover:text-[#192A24]'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ONGLET 1 : Automatisation 09h00 & Envoi rapide */}
      {activeTab === 'automation' && (
        <div className="space-y-6">
          <AppPanel className="space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <SectionHeading
                  title="Planification automatique 09h00 (Africa/Brazzaville)"
                  icon={<Clock size={18} />}
                />
                <p className="text-xs text-[#7D8176] mt-1">
                  {automationState
                    ? `${automationState.nextRunLabel} · File d’attente en reprise : ${automationState.pendingQueueCount} message(s)`
                    : 'Chargement de la configuration serveur…'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!canValidate || savingSettings || !settingsDraft}
                  onClick={() => void handleToggleAutomationEnabled()}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold border cursor-pointer disabled:opacity-50 ${
                    settingsDraft?.enabled
                      ? 'bg-white border-red-200 text-red-700 hover:bg-red-50'
                      : 'bg-[#008B62] border-[#008B62] text-white hover:bg-[#007452]'
                  }`}
                >
                  {settingsDraft?.enabled ? 'Désactiver le moteur' : 'Activer l’automatisation'}
                </button>
                <button
                  type="button"
                  disabled={!canValidate || savingSettings || !settingsDraft}
                  onClick={() => void handleSaveAutomationSettings()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#192A24] hover:bg-[#253D34] disabled:opacity-50 text-white text-xs font-extrabold cursor-pointer"
                >
                  {savingSettings ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Save size={14} />
                  )}
                  <span>Enregistrer la configuration</span>
                </button>
              </div>
            </div>

            {!canValidate && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900 flex items-center gap-2">
                <ShieldCheck size={15} />
                <span>
                  Droits requis (<code>sms.validate</code>) pour modifier la planification, suspendre ou déclencher les campagnes automatiques.
                </span>
              </div>
            )}

            {settingsDraft && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-[#FAF8F3] border border-[#E8D8BE]">
                    <label className="block text-[11px] font-bold text-[#7D8176] mb-1">
                      Heure de diffusion (UTC+1)
                    </label>
                    <input
                      type="time"
                      disabled={!canValidate}
                      value={`${String(settingsDraft.hour).padStart(2, '0')}:${String(settingsDraft.minute).padStart(2, '0')}`}
                      onChange={(e) => {
                        const [hStr, mStr] = e.target.value.split(':');
                        const h = Number(hStr);
                        const m = Number(mStr);
                        if (Number.isFinite(h) && Number.isFinite(m)) {
                          setSettingsDraft((prev) =>
                            prev ? { ...prev, hour: h, minute: m } : prev
                          );
                          setSettingsDirty(true);
                        }
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-[#E8D8BE] bg-white font-bold text-[#192A24]"
                    />
                  </div>

                  <div className="p-3 rounded-xl bg-[#FAF8F3] border border-[#E8D8BE]">
                    <label className="block text-[11px] font-bold text-[#7D8176] mb-1">
                      Mode Clients Devises (Section 15)
                    </label>
                    <select
                      disabled={!canValidate}
                      value={settingsDraft.currencyClientMode}
                      onChange={(e) => {
                        setSettingsDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                currencyClientMode: e.target.value as 'grouped' | 'per_currency',
                              }
                            : prev
                        );
                        setSettingsDirty(true);
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-[#E8D8BE] bg-white font-bold text-[#192A24]"
                    >
                      <option value="per_currency">1 message par devise disponible</option>
                      <option value="grouped">1 message groupé multi-devises</option>
                    </select>
                  </div>

                  <div className="p-3 rounded-xl bg-[#FAF8F3] border border-[#E8D8BE]">
                    <label className="block text-[11px] font-bold text-[#7D8176] mb-1">
                      Reprise sur échec (Max / Délai)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        disabled={!canValidate}
                        checked={settingsDraft.autoRetryEnabled}
                        onChange={(e) => {
                          setSettingsDraft((prev) =>
                            prev ? { ...prev, autoRetryEnabled: e.target.checked } : prev
                          );
                          setSettingsDirty(true);
                        }}
                      />
                      <input
                        type="number"
                        min={1}
                        max={10}
                        disabled={!canValidate}
                        value={settingsDraft.maxRetries}
                        onChange={(e) => {
                          setSettingsDraft((prev) =>
                            prev ? { ...prev, maxRetries: Number(e.target.value) || 3 } : prev
                          );
                          setSettingsDirty(true);
                        }}
                        className="w-16 px-2 py-1.5 rounded-lg border border-[#E8D8BE] bg-white font-bold"
                        title="Max tentatives"
                      />
                      <span className="text-[11px] text-[#7D8176]">×</span>
                      <input
                        type="number"
                        min={1}
                        max={120}
                        disabled={!canValidate}
                        value={settingsDraft.retryDelayMinutes}
                        onChange={(e) => {
                          setSettingsDraft((prev) =>
                            prev
                              ? { ...prev, retryDelayMinutes: Number(e.target.value) || 5 }
                              : prev
                          );
                          setSettingsDirty(true);
                        }}
                        className="w-16 px-2 py-1.5 rounded-lg border border-[#E8D8BE] bg-white font-bold"
                        title="Délai en minutes"
                      />
                      <span className="text-[11px] text-[#7D8176]">min</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-[#FAF8F3] border border-[#E8D8BE] flex flex-col justify-between">
                    <div className="text-[11px] font-bold text-[#7D8176]">Dernière exécution</div>
                    <div className="font-black text-[#192A24]">
                      {automationState?.lastRunDate || 'Aucune'} ({automationState?.lastStatus || 'idle'})
                    </div>
                    {automationState?.lastError && (
                      <div className="text-[10px] text-red-700 font-semibold truncate">
                        {automationState.lastError}
                      </div>
                    )}
                  </div>
                </div>

                {/* Fréquence par catégorie métier */}
                <div className="overflow-x-auto rounded-xl border border-[#E8D8BE]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#FAF8F3] text-[#7D8176] border-b border-[#E8D8BE] text-[11px]">
                        <th className="p-2.5">Actif</th>
                        <th className="p-2.5">Catégorie de contact</th>
                        <th className="p-2.5">Fréquence</th>
                        <th className="p-2.5">Jour (si hebdomadaire)</th>
                        <th className="p-2.5">Source du prix & contrôle</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F3EBDC] bg-white">
                      {schedulesDraft.map((rule) => {
                        const meta = WHATSAPP_CATEGORY_META[rule.category];
                        return (
                          <tr key={rule.category}>
                            <td className="p-2.5">
                              <input
                                type="checkbox"
                                disabled={!canValidate}
                                checked={rule.enabled}
                                onChange={(e) =>
                                  updateScheduleRow(rule.category, { enabled: e.target.checked })
                                }
                              />
                            </td>
                            <td className="p-2.5 font-bold text-[#192A24]">{meta.label}</td>
                            <td className="p-2.5">
                              <select
                                disabled={!canValidate}
                                value={rule.frequency}
                                onChange={(e) =>
                                  updateScheduleRow(rule.category, {
                                    frequency: e.target.value as 'daily' | 'weekly',
                                  })
                                }
                                className="px-2.5 py-1.5 rounded-lg border border-[#E8D8BE] bg-[#FAF8F3] font-bold"
                              >
                                <option value="daily">Quotidienne (09h00)</option>
                                <option value="weekly">Hebdomadaire (09h00)</option>
                              </select>
                            </td>
                            <td className="p-2.5">
                              {rule.frequency === 'weekly' ? (
                                <select
                                  disabled={!canValidate}
                                  value={rule.weekday}
                                  onChange={(e) =>
                                    updateScheduleRow(rule.category, {
                                      weekday: Number(e.target.value),
                                    })
                                  }
                                  className="px-2.5 py-1.5 rounded-lg border border-[#E8D8BE] bg-[#FAF8F3] font-bold"
                                >
                                  {WEEKDAY_LABELS_FR.map((d) => (
                                    <option key={d.value} value={d.value}>
                                      {d.label}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-[#7D8176]">Tous les jours</span>
                              )}
                            </td>
                            <td className="p-2.5 text-[#555B54]">{meta.priceSourceDescription}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {automationState && automationState.pendingQueueCount > 0 && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-amber-900">
                      {automationState.pendingQueueCount} message(s) en attente / file de reprise.
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleRetryQueue()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#D39725] text-white font-bold cursor-pointer"
                    >
                      <RefreshCw size={13} />
                      <span>Relancer maintenant sans doublon</span>
                    </button>
                  </div>
                )}
              </>
            )}
          </AppPanel>

          {/* Envoi manuel rapide (préservé) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <AppPanel className="lg:col-span-2 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SectionHeading
                  title="Envoi rapide & Messages personnalisés"
                  icon={<MessageSquare size={18} />}
                />
                <div className="inline-flex rounded-xl p-1 bg-[#FAF8F3] border border-[#E8D8BE] text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setSendScope('GROUP')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                      sendScope === 'GROUP'
                        ? 'bg-[#192A24] text-white'
                        : 'text-[#7D8176] hover:text-[#192A24]'
                    }`}
                  >
                    <Users size={13} />
                    <span>Par catégorie / Groupe</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSendScope('SINGLE')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                      sendScope === 'SINGLE'
                        ? 'bg-[#192A24] text-white'
                        : 'text-[#7D8176] hover:text-[#192A24]'
                    }`}
                  >
                    <UserCheck size={13} />
                    <span>Un seul contact</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2.5 p-3.5 rounded-xl bg-[#FAF8F3] border border-[#E8D8BE]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-[#192A24]">
                    Cibler les destinataires actifs
                  </label>
                  <span className="text-[11px] font-semibold text-[#7D8176]">
                    {targetGroupContacts.length} destinataire(s) sélectionné(s)
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {AUDIENCE_OPTIONS.map((opt) => {
                    const isActive = audienceFilter === opt.id;
                    const count = audienceCounts[opt.id];
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setAudienceFilter(opt.id);
                          setDispatchedRefs({});
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-[#192A24] text-white border-[#192A24]'
                            : 'bg-white text-[#192A24] border-[#E8D8BE] hover:bg-[#F3EBDC]'
                        }`}
                      >
                        {opt.label} ({count})
                      </button>
                    );
                  })}
                </div>

                <div className="relative">
                  <Search size={14} className="absolute left-3 top-2.5 text-[#7D8176]" />
                  <input
                    type="text"
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    placeholder="Filtrer par nom, numéro, ville ou rôle..."
                    className="w-full pl-8 pr-3 py-2 bg-white rounded-xl border border-[#E8D8BE] text-xs text-[#192A24] focus:outline-hidden focus:border-[#D39725]"
                  />
                </div>

                {audienceFilter === 'CUSTOM' && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-[#7D8176]">
                        Cochez les destinataires :
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={selectAllFilteredForCustom}
                          className="font-bold text-[#008B62] hover:underline cursor-pointer"
                        >
                          Tout cocher ({filteredContacts.length})
                        </button>
                        <button
                          type="button"
                          onClick={clearCustomSelection}
                          className="font-bold text-red-600 hover:underline cursor-pointer"
                        >
                          Tout décocher
                        </button>
                      </div>
                    </div>
                    <div className="max-h-44 overflow-y-auto divide-y divide-[#EFE6D5] bg-white rounded-xl border border-[#E8D8BE]">
                      {filteredContacts.map((c) => {
                        const checked = customSelectedRefs.includes(c.reference);
                        return (
                          <button
                            key={c.reference}
                            type="button"
                            onClick={() => toggleCustomContact(c.reference)}
                            className={`w-full px-3 py-2 flex items-center justify-between text-left text-xs cursor-pointer ${
                              checked ? 'bg-emerald-50/70' : 'hover:bg-[#FAF8F3]'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {checked ? (
                                <CheckSquare size={15} className="text-[#008B62] shrink-0" />
                              ) : (
                                <Square size={15} className="text-[#7D8176] shrink-0" />
                              )}
                              <div className="min-w-0">
                                <div className="font-bold text-[#192A24] truncate">{c.name}</div>
                                <div className="text-[11px] text-[#7D8176] truncate">
                                  {c.roles.join(', ') || 'Contact'}
                                </div>
                              </div>
                            </div>
                            <span className="font-mono text-[11px] text-[#7D8176] shrink-0 ml-2">
                              {c.phone}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {sendScope === 'SINGLE' && audienceFilter !== 'CUSTOM' && (
                  <div>
                    <label className="block text-[11px] font-bold text-[#7D8176] mb-1">
                      Destinataire ({currentAudienceLabel})
                    </label>
                    <select
                      value={selectedContact?.reference || ''}
                      onChange={(e) => setSelectedContactRef(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white rounded-xl border border-[#E8D8BE] text-xs font-bold text-[#192A24]"
                    >
                      {filteredContacts.map((c) => (
                        <option key={c.reference} value={c.reference}>
                          {c.name} · {c.phone}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-bold text-[#192A24] mb-1.5">
                  <label>Message personnalisé rapide</label>
                  <button
                    type="button"
                    onClick={() =>
                      setMessageText((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}{nom}`)
                    }
                    className="px-2 py-0.5 rounded bg-amber-50 border border-[#E8D8BE] text-[11px] font-bold cursor-pointer"
                  >
                    + Insérer {'{nom}'}
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Saisissez un message ad-hoc pour vos contacts..."
                  className="w-full p-3.5 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs leading-relaxed focus:outline-hidden focus:border-[#D39725]"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E8D8BE] text-xs font-bold text-[#7D8176] hover:bg-gray-50 cursor-pointer"
                >
                  {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                  <span>{copied ? 'Copié !' : 'Copier texte'}</span>
                </button>

                {sendScope === 'SINGLE' && audienceFilter !== 'CUSTOM' ? (
                  <button
                    type="button"
                    onClick={() => void handleSendSingle()}
                    disabled={!messageText.trim() || !selectedContact || isSendingDirect}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#008B62] hover:bg-[#007452] text-white text-xs font-extrabold cursor-pointer disabled:opacity-50"
                  >
                    {isSendingDirect ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Send size={15} />
                    )}
                    <span>
                      {isDirectConnected
                        ? `Envoyer direct à ${selectedContact?.name || 'ce contact'}`
                        : `Ouvrir WhatsApp (${selectedContact?.name || 'contact'})`}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void broadcastToTargetGroup()}
                    disabled={
                      !messageText.trim() || targetGroupContacts.length === 0 || isSendingDirect
                    }
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#008B62] hover:bg-[#007452] text-white text-xs font-extrabold cursor-pointer disabled:opacity-50"
                  >
                    {isSendingDirect ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Send size={15} />
                    )}
                    <span>
                      {directProgress ||
                        `Envoyer à : ${currentAudienceLabel} (${targetGroupContacts.length})`}
                    </span>
                  </button>
                )}
              </div>

              {(sendScope === 'GROUP' || audienceFilter === 'CUSTOM') &&
                targetGroupContacts.length > 0 && (
                  <div className="border-t border-[#E8D8BE] pt-3 max-h-48 overflow-y-auto divide-y divide-[#F3EBDC] rounded-xl border border-[#E8D8BE]">
                    {targetGroupContacts.map((c) => {
                      const isSent = Boolean(dispatchedRefs[c.reference]);
                      return (
                        <div
                          key={c.reference}
                          className="px-3 py-2 flex items-center justify-between gap-2 bg-white text-xs"
                        >
                          <div className="truncate">
                            <span className="font-bold text-[#192A24]">{c.name}</span>{' '}
                            <span className="font-mono text-[11px] text-[#7D8176]">{c.phone}</span>
                          </div>
                          <button
                            type="button"
                            disabled={!messageText.trim() || isSendingDirect}
                            onClick={() => void handleSendOneFromQueue(c)}
                            className={`px-3 py-1 rounded-lg text-[11px] font-bold shrink-0 cursor-pointer disabled:opacity-50 ${
                              isSent
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-[#192A24] text-white'
                            }`}
                          >
                            {isSent ? 'Envoyé ✓' : 'Envoyer'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
            </AppPanel>

            <AppPanel className="space-y-4">
              <SectionHeading title="Envois rapides de la session" />
              {sentMessages.length === 0 ? (
                <p className="text-xs text-[#7D8176]">
                  Aucun envoi manuel rapide dans cette session. Pour les campagnes 09h00 et les historiques auditables, consultez l’onglet « Historique & Audit ».
                </p>
              ) : (
                <div className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
                  {sentMessages.map((m, idx) => (
                    <div key={idx} className="py-2.5 text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-[#192A24] truncate">{m.to}</span>
                        <span className="text-[10px] text-gray-400">{m.time}</span>
                      </div>
                      <div className="text-[11px] font-mono text-[#7D8176]">{m.phone}</div>
                      <p className="p-2 rounded-lg bg-gray-50 text-gray-700 text-[11px]">{m.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </AppPanel>
          </div>
        </div>
      )}

      {/* ONGLET 2 : CRM Contacts & Consentements */}
      {activeTab === 'crm' && (
        <WhatsAppCrmTab
          contacts={store.contacts}
          canManageContacts={canManageContacts}
          onAddContact={store.addContact}
          onUpdateContact={store.updateContact}
          onImportContacts={store.importContacts}
          onAudit={handleCrmAudit}
        />
      )}

      {/* ONGLET 3 : Prix Or & Stocks Devises */}
      {activeTab === 'prices' && (
        automationState ? (
          <WhatsAppPricesStockTab
            automationState={automationState}
            canValidate={canValidate}
            purchaseFormulaConfig={store.purchaseFormulaConfig}
            currencyBalances={store.currencyBalances}
            actorName={store.userName}
            actorRole={store.currentRole}
            onSaveGoldPrice={handleSaveGoldPrice}
            onSaveCurrencyRates={handleSaveCurrencyRates}
          />
        ) : (
          <AppPanel className="p-8 text-center text-xs text-[#7D8176]">
            Chargement des prix et stocks depuis le serveur WhatsApp…
          </AppPanel>
        )
      )}

      {/* ONGLET 4 : Modèles & Prévisualisation avant envoi */}
      {activeTab === 'templates' && (
        automationState ? (
          <WhatsAppTemplatesPreviewTab
            automationState={automationState}
            canValidate={canValidate}
            isGatewayConnected={isDirectConnected}
            onSaveTemplate={handleSaveTemplate}
            onPreview={(opts) => WhatsAppDirectService.previewAutomation(opts)}
            onRunCampaign={handleRunCampaign}
          />
        ) : (
          <AppPanel className="p-8 text-center text-xs text-[#7D8176]">
            Chargement des modèles WhatsApp…
          </AppPanel>
        )
      )}

      {/* ONGLET 5 : Historique, Campagnes, Reprise & Audit */}
      {activeTab === 'history' && (
        automationState ? (
          <WhatsAppHistoryAuditTab
            automationState={automationState}
            canValidate={canValidate}
            onToggleCampaignPause={handleToggleCampaignPause}
            onCancelCampaign={handleCancelCampaign}
            onRetryQueue={handleRetryQueue}
          />
        ) : (
          <AppPanel className="p-8 text-center text-xs text-[#7D8176]">
            Chargement de l’historique et du journal d’audit…
          </AppPanel>
        )
      )}
    </div>
  );
};
