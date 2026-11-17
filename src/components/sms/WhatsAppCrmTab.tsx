import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Archive,
  Ban,
  CheckCircle2,
  CheckSquare,
  Edit3,
  FileSpreadsheet,
  Filter,
  Plus,
  Search,
  ShieldCheck,
  Square,
  Upload,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import { AppPanel, Modal, SectionHeading } from '../common/UIComponents';
import { Contact } from '../../types';
import {
  ALL_WHATSAPP_CATEGORIES,
  inferCategoriesFromRoles,
  WHATSAPP_CATEGORY_META,
  WhatsAppBusinessCategory,
} from '../../types/whatsappAutomation';

interface WhatsAppCrmTabProps {
  contacts: Contact[];
  canManageContacts: boolean;
  onAddContact: (contact: Omit<Contact, 'reference'>) => void;
  onUpdateContact: (ref: string, updates: Partial<Omit<Contact, 'reference'>>) => void;
  onImportContacts: (list: Array<Omit<Contact, 'reference'>>) => number;
  onAudit: (action: string, summary: string) => void;
}

type CategoryFilter = 'ALL' | WhatsAppBusinessCategory | 'UNSUBSCRIBED' | 'ARCHIVED';

interface ParsedImportRow {
  name: string;
  phone: string;
  city: string;
  contactType: 'Fournisseur' | 'Client' | 'Partenaire';
  whatsappCategories: WhatsAppBusinessCategory[];
  preferredCurrency: string;
  language: 'fr' | 'en';
  consentGranted: boolean;
  consentProof: string;
  isDuplicate: boolean;
  duplicateReason?: string;
}

const normalizeDigits = (raw: string): string => {
  let digits = (raw || '').replace(/[^\d]/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 9 && digits.startsWith('0')) digits = `242${digits}`;
  return digits;
};

const categoryToLegacyRoles = (
  cats: WhatsAppBusinessCategory[],
  contactType: 'Fournisseur' | 'Client' | 'Partenaire'
): string[] => {
  const roles: string[] = [];
  if (cats.includes('OR_BRUT')) roles.push('Fournisseur d’or brut');
  if (cats.includes('OR_FONDU')) roles.push('Fournisseur d’or fondu');
  if (cats.includes('BIJOUX')) roles.push('Fournisseur de bijoux');
  if (cats.includes('FOURNISSEUR_DEVISES')) roles.push('Fournisseur de devises (Change)');
  if (cats.includes('CLIENT_DEVISES')) roles.push('Client de devises (Change)');
  if (roles.length === 0) {
    roles.push(contactType === 'Client' ? 'Client de passage' : contactType);
  }
  return roles;
};

const parseCategoriesFromString = (raw: string): WhatsAppBusinessCategory[] => {
  const txt = (raw || '').toLowerCase();
  const cats = new Set<WhatsAppBusinessCategory>();
  if (txt.includes('brut')) cats.add('OR_BRUT');
  if (txt.includes('fondu')) cats.add('OR_FONDU');
  if (txt.includes('bijou')) cats.add('BIJOUX');
  if ((txt.includes('fourn') || txt.includes('achat')) && txt.includes('devise')) {
    cats.add('FOURNISSEUR_DEVISES');
  }
  if (txt.includes('client') && txt.includes('devise')) {
    cats.add('CLIENT_DEVISES');
  }
  if (cats.size === 0 && txt.includes('devise')) {
    cats.add('CLIENT_DEVISES');
  }
  return Array.from(cats);
};

export const WhatsAppCrmTab: React.FC<WhatsAppCrmTabProps> = ({
  contacts,
  canManageContacts,
  onAddContact,
  onUpdateContact,
  onImportContacts,
  onAudit,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [catFilter, setCatFilter] = useState<CategoryFilter>('ALL');
  const [search, setSearch] = useState('');
  const [selectedRefs, setSelectedRefs] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Add/Edit Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRef, setEditingRef] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formCity, setFormCity] = useState('');
  const [formType, setFormType] = useState<'Fournisseur' | 'Client' | 'Partenaire'>('Fournisseur');
  const [formCategories, setFormCategories] = useState<WhatsAppBusinessCategory[]>(['OR_BRUT']);
  const [formCurrency, setFormCurrency] = useState('USD');
  const [formLang, setFormLang] = useState<'fr' | 'en'>('fr');
  const [formStatus, setFormStatus] = useState<'active' | 'suspended'>('active');
  const [formConsent, setFormConsent] = useState(true);
  const [formConsentDate, setFormConsentDate] = useState(new Date().toISOString().slice(0, 10));
  const [formConsentProof, setFormConsentProof] = useState('Accord WhatsApp signé / oral');
  const [formBroadcast, setFormBroadcast] = useState(true);
  const [formUnsubscribed, setFormUnsubscribed] = useState(false);

  // Excel import preview modal
  const [importRows, setImportRows] = useState<ParsedImportRow[] | null>(null);

  const enrichedContacts = useMemo(
    () =>
      contacts.map((c) => {
        const inferred =
          c.whatsappCategories && c.whatsappCategories.length > 0
            ? c.whatsappCategories
            : inferCategoriesFromRoles(c.roles || []);
        const contactType =
          c.contactType ||
          ((c.roles || []).some((r) => r.toLowerCase().includes('fournisseur'))
            ? 'Fournisseur'
            : (c.roles || []).some((r) => r.toLowerCase().includes('partenaire'))
              ? 'Partenaire'
              : 'Client');
        return {
          ...c,
          resolvedCategories: inferred,
          resolvedType: contactType,
          resolvedStatus: c.whatsappStatus || 'active',
          resolvedConsent: c.consentGranted ?? false,
          resolvedBroadcast: c.unsubscribed ? false : (c.broadcastEnabled ?? true),
        };
      }),
    [contacts]
  );

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enrichedContacts.filter((c) => {
      if (catFilter === 'ARCHIVED') {
        if (!c.archived) return false;
      } else {
        if (c.archived) return false;
        if (catFilter === 'UNSUBSCRIBED') {
          if (!c.unsubscribed) return false;
        } else if (catFilter !== 'ALL') {
          if (!c.resolvedCategories.includes(catFilter)) return false;
        }
      }
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.city || '').toLowerCase().includes(q) ||
        c.reference.toLowerCase().includes(q) ||
        (c.preferredCurrency || '').toLowerCase().includes(q)
      );
    });
  }, [enrichedContacts, catFilter, search]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: 0,
      UNSUBSCRIBED: 0,
      ARCHIVED: 0,
    };
    ALL_WHATSAPP_CATEGORIES.forEach((cat) => {
      counts[cat] = 0;
    });
    for (const c of enrichedContacts) {
      if (c.archived) {
        counts.ARCHIVED += 1;
        continue;
      }
      counts.ALL += 1;
      if (c.unsubscribed) counts.UNSUBSCRIBED += 1;
      for (const cat of c.resolvedCategories) {
        counts[cat] = (counts[cat] || 0) + 1;
      }
    }
    return counts;
  }, [enrichedContacts]);

  const openNewModal = () => {
    setEditingRef(null);
    setFormName('');
    setFormPhone('+242 ');
    setFormCity('');
    setFormType('Fournisseur');
    setFormCategories(['OR_BRUT']);
    setFormCurrency('USD');
    setFormLang('fr');
    setFormStatus('active');
    setFormConsent(true);
    setFormConsentDate(new Date().toISOString().slice(0, 10));
    setFormConsentProof('Accord écrit / WhatsApp');
    setFormBroadcast(true);
    setFormUnsubscribed(false);
    setModalOpen(true);
  };

  const openEditModal = (c: (typeof enrichedContacts)[number]) => {
    setEditingRef(c.reference);
    setFormName(c.name);
    setFormPhone(c.phone || '');
    setFormCity(c.city || '');
    setFormType(c.resolvedType);
    setFormCategories(c.resolvedCategories.length ? c.resolvedCategories : ['OR_BRUT']);
    setFormCurrency(c.preferredCurrency || 'USD');
    setFormLang(c.language || 'fr');
    setFormStatus(c.resolvedStatus);
    setFormConsent(c.resolvedConsent);
    setFormConsentDate(c.consentDate || new Date().toISOString().slice(0, 10));
    setFormConsentProof(c.consentProof || '');
    setFormBroadcast(c.resolvedBroadcast);
    setFormUnsubscribed(Boolean(c.unsubscribed));
    setModalOpen(true);
  };

  const toggleFormCategory = (cat: WhatsAppBusinessCategory) => {
    setFormCategories((prev) =>
      prev.includes(cat) ? prev.filter((item) => item !== cat) : [...prev, cat]
    );
  };

  const handleSaveContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageContacts) return;
    if (!formName.trim() || normalizeDigits(formPhone).length < 8) {
      setFeedback({
        type: 'error',
        text: 'Nom complet et numéro WhatsApp international valide (avec indicatif) requis.',
      });
      return;
    }

    const cats: WhatsAppBusinessCategory[] = formCategories.length ? formCategories : ['OR_BRUT'];
    const payload: Omit<Contact, 'reference'> = {
      name: formName.trim(),
      phone: formPhone.trim(),
      city: formCity.trim() || 'Brazzaville',
      contactType: formType,
      whatsappCategories: cats,
      roles: categoryToLegacyRoles(cats, formType),
      preferredCurrency: formCurrency.trim().toUpperCase(),
      language: formLang,
      whatsappStatus: formStatus,
      consentGranted: formConsent,
      consentDate: formConsent ? formConsentDate : '',
      consentProof: formConsent ? formConsentProof.trim() : '',
      broadcastEnabled: formUnsubscribed ? false : formBroadcast,
      unsubscribed: formUnsubscribed,
      unsubscribedAt: formUnsubscribed ? new Date().toISOString() : '',
    };

    if (editingRef) {
      onUpdateContact(editingRef, payload);
      onAudit('Mise à jour contact CRM WhatsApp', `${payload.name} (${editingRef})`);
      setFeedback({ type: 'success', text: `Contact ${payload.name} mis à jour.` });
    } else {
      onAddContact(payload);
      onAudit('Ajout contact CRM WhatsApp', `${payload.name} (${payload.phone})`);
      setFeedback({ type: 'success', text: `Contact ${payload.name} ajouté au CRM.` });
    }
    setModalOpen(false);
  };

  const toggleSelectRow = (ref: string) => {
    setSelectedRefs((prev) =>
      prev.includes(ref) ? prev.filter((r) => r !== ref) : [...prev, ref]
    );
  };

  const handleBulkUpdate = (
    label: string,
    updates: Partial<Omit<Contact, 'reference'>>
  ) => {
    if (!canManageContacts || selectedRefs.length === 0) return;
    selectedRefs.forEach((ref) => onUpdateContact(ref, updates));
    onAudit(`Action groupée CRM (${label})`, `${selectedRefs.length} contact(s) modifié(s).`);
    setFeedback({
      type: 'success',
      text: `${label} appliqué à ${selectedRefs.length} contact(s).`,
    });
    setSelectedRefs([]);
  };

  const handleExcelFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      const existingDigits = new Set(
        contacts.map((c) => normalizeDigits(c.phone || '')).filter(Boolean)
      );
      const existingNames = new Set(contacts.map((c) => c.name.trim().toLowerCase()));
      const seenInFile = new Set<string>();

      const parsed: ParsedImportRow[] = rawRows
        .map((row): ParsedImportRow => {
          const pick = (...keys: string[]) => {
            for (const k of Object.keys(row)) {
              const lower = k.trim().toLowerCase();
              if (keys.some((target) => lower.includes(target))) {
                return String(row[k] ?? '').trim();
              }
            }
            return '';
          };

          const name = pick('nom', 'name', 'client', 'fournisseur');
          const phone = pick('tel', 'tél', 'phone', 'whatsapp', 'numero', 'numéro');
          const city = pick('ville', 'city') || 'Brazzaville';
          const catStr = pick('cat', 'groupe', 'segment', 'role', 'rôle');
          const typeStr = pick('type');
          const currency = (pick('devise', 'currency') || 'USD').toUpperCase();
          const langRaw = pick('lang').toLowerCase();
          const consentRaw = pick('consent', 'accord', 'opt').toLowerCase();
          const proof = pick('preuve', 'proof') || 'Import Excel';

          const digits = normalizeDigits(phone);
          const cats = parseCategoriesFromString(catStr);
          const resolvedCategories: WhatsAppBusinessCategory[] =
            cats.length > 0 ? cats : ['OR_BRUT'];
          const contactType: 'Fournisseur' | 'Client' | 'Partenaire' = typeStr
            .toLowerCase()
            .includes('client')
            ? 'Client'
            : resolvedCategories.includes('CLIENT_DEVISES')
              ? 'Client'
              : 'Fournisseur';

          let isDuplicate = false;
          let duplicateReason: string | undefined;
          if (!digits || digits.length < 8) {
            isDuplicate = true;
            duplicateReason = 'Numéro WhatsApp invalide';
          } else if (existingDigits.has(digits)) {
            isDuplicate = true;
            duplicateReason = 'Doublon numéro existant';
          } else if (seenInFile.has(digits)) {
            isDuplicate = true;
            duplicateReason = 'Doublon dans le fichier Excel';
          } else if (name && existingNames.has(name.toLowerCase())) {
            isDuplicate = true;
            duplicateReason = 'Nom déjà présent';
          }
          if (digits) seenInFile.add(digits);

          const consentGranted =
            consentRaw === 'oui' ||
            consentRaw === 'yes' ||
            consentRaw === 'true' ||
            consentRaw === '1';

          return {
            name,
            phone,
            city,
            contactType,
            whatsappCategories: resolvedCategories,
            preferredCurrency: currency,
            language: langRaw.startsWith('en') ? 'en' : 'fr',
            consentGranted,
            consentProof: consentGranted ? proof : '',
            isDuplicate,
            duplicateReason,
          };
        })
        .filter((r) => r.name || r.phone);

      if (parsed.length === 0) {
        setFeedback({
          type: 'error',
          text: 'Aucune ligne valide détectée. Colonnes attendues : Nom, WhatsApp, Type, Catégorie, Devise, Consentement.',
        });
        return;
      }
      setImportRows(parsed);
    } catch {
      setFeedback({
        type: 'error',
        text: 'Impossible de lire le fichier Excel. Vérifiez le format (.xlsx, .xls ou .csv).',
      });
    }
  };

  const handleConfirmImport = () => {
    if (!importRows || !canManageContacts) return;
    const valid = importRows.filter((r) => !r.isDuplicate && r.name.trim());
    if (valid.length === 0) {
      setImportRows(null);
      return;
    }
    const toCreate: Array<Omit<Contact, 'reference'>> = valid.map((r) => ({
      name: r.name,
      phone: r.phone,
      city: r.city,
      contactType: r.contactType,
      whatsappCategories: r.whatsappCategories,
      roles: categoryToLegacyRoles(r.whatsappCategories, r.contactType),
      preferredCurrency: r.preferredCurrency,
      language: r.language,
      whatsappStatus: 'active',
      consentGranted: r.consentGranted,
      consentDate: r.consentGranted ? new Date().toISOString().slice(0, 10) : '',
      consentProof: r.consentProof,
      broadcastEnabled: true,
      unsubscribed: false,
    }));
    const added = onImportContacts(toCreate);
    onAudit('Import Excel contacts WhatsApp', `${added} contact(s) importé(s) sans doublon.`);
    setFeedback({
      type: 'success',
      text: `${added} contact(s) importé(s) (les doublons ont été automatiquement ignorés).`,
    });
    setImportRows(null);
  };

  const handleDownloadSampleExcel = () => {
    const ws = XLSX.utils.json_to_sheet([
      {
        Nom: 'Amadou Diallo',
        WhatsApp: '+242 06 800 11 22',
        Type: 'Fournisseur',
        Categorie: 'Or brut',
        Devise: 'FCFA',
        Langue: 'fr',
        Consentement: 'Oui',
        Preuve: 'Fiche client signée 2026',
        Ville: 'Brazzaville',
      },
      {
        Nom: 'Bureau Change Etoile',
        WhatsApp: '+242 05 700 33 44',
        Type: 'Client',
        Categorie: 'Client devises',
        Devise: 'USD',
        Langue: 'fr',
        Consentement: 'Oui',
        Preuve: 'Opt-in WhatsApp',
        Ville: 'Pointe-Noire',
      },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contacts_WhatsApp');
    XLSX.writeFile(wb, 'modele_import_contacts_whatsapp_cams_gold.xlsx');
  };

  return (
    <div className="space-y-5">
      <AppPanel className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <SectionHeading
            title="CRM WhatsApp · Contacts, Catégories & Consentements"
            icon={<UserCheck size={18} />}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadSampleExcel}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E8D8BE] bg-white hover:bg-[#FAF8F3] text-xs font-bold text-[#192A24] cursor-pointer"
            >
              <FileSpreadsheet size={14} className="text-[#008B62]" />
              <span>Modèle Excel</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => void handleExcelFileSelect(e)}
            />
            <button
              type="button"
              disabled={!canManageContacts}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#E8D8BE] bg-[#FAF8F3] hover:bg-[#F3EBDC] text-xs font-bold text-[#192A24] cursor-pointer disabled:opacity-50"
            >
              <Upload size={14} />
              <span>Importer Excel (anti-doublon)</span>
            </button>
            <button
              type="button"
              disabled={!canManageContacts}
              onClick={openNewModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#192A24] hover:bg-[#253D34] text-white text-xs font-extrabold cursor-pointer disabled:opacity-50"
            >
              <Plus size={14} />
              <span>Nouveau contact CRM</span>
            </button>
          </div>
        </div>

        {!canManageContacts && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900">
            Lecture seule : vous n’avez pas le droit « sms.contacts » pour modifier les contacts ou consentements.
          </div>
        )}

        {feedback && (
          <div
            className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            <span>{feedback.text}</span>
            <button type="button" onClick={() => setFeedback(null)} className="cursor-pointer">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Filtres par catégorie métier */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#7D8176] mr-1">
            <Filter size={12} /> Catégories :
          </span>
          <button
            type="button"
            onClick={() => setCatFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
              catFilter === 'ALL'
                ? 'bg-[#192A24] text-white border-[#192A24]'
                : 'bg-white text-[#192A24] border-[#E8D8BE]'
            }`}
          >
            Tous actifs ({categoryCounts.ALL})
          </button>
          {ALL_WHATSAPP_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCatFilter(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                catFilter === cat
                  ? 'bg-[#192A24] text-white border-[#192A24]'
                  : 'bg-white text-[#192A24] border-[#E8D8BE]'
              }`}
            >
              {WHATSAPP_CATEGORY_META[cat].shortLabel} ({categoryCounts[cat]})
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCatFilter('UNSUBSCRIBED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
              catFilter === 'UNSUBSCRIBED'
                ? 'bg-red-700 text-white border-red-700'
                : 'bg-red-50 text-red-800 border-red-200'
            }`}
          >
            Désabonnés ({categoryCounts.UNSUBSCRIBED})
          </button>
          <button
            type="button"
            onClick={() => setCatFilter('ARCHIVED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
              catFilter === 'ARCHIVED'
                ? 'bg-gray-700 text-white border-gray-700'
                : 'bg-gray-50 text-gray-700 border-gray-200'
            }`}
          >
            Archivés ({categoryCounts.ARCHIVED})
          </button>
        </div>

        {/* Recherche & Actions groupées */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-2.5 text-[#7D8176]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom, numéro WhatsApp, référence, devise..."
              className="w-full pl-8 pr-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs text-[#192A24] focus:outline-hidden focus:border-[#D39725]"
            />
          </div>

          {selectedRefs.length > 0 && canManageContacts && (
            <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl bg-[#FAF8F3] border border-[#E8D8BE]">
              <span className="text-[11px] font-bold text-[#192A24] px-1">
                {selectedRefs.length} sélectionné(s) :
              </span>
              <button
                type="button"
                onClick={() =>
                  handleBulkUpdate('Consentement accordé', {
                    consentGranted: true,
                    consentDate: new Date().toISOString().slice(0, 10),
                    consentProof: 'Validation groupée CRM',
                  })
                }
                className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold cursor-pointer"
              >
                + Consentement
              </button>
              <button
                type="button"
                onClick={() => handleBulkUpdate('Diffusion activée', { broadcastEnabled: true })}
                className="px-2.5 py-1 rounded-lg bg-[#192A24] text-white text-[11px] font-bold cursor-pointer"
              >
                Activer diffusion
              </button>
              <button
                type="button"
                onClick={() => handleBulkUpdate('Suspendu', { whatsappStatus: 'suspended' })}
                className="px-2.5 py-1 rounded-lg bg-amber-600 text-white text-[11px] font-bold cursor-pointer"
              >
                Suspendre
              </button>
              <button
                type="button"
                onClick={() =>
                  handleBulkUpdate('Désabonnement', {
                    unsubscribed: true,
                    broadcastEnabled: false,
                    unsubscribedAt: new Date().toISOString(),
                  })
                }
                className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-[11px] font-bold cursor-pointer"
              >
                Désabonner
              </button>
            </div>
          )}
        </div>

        {/* Table CRM */}
        <div className="overflow-x-auto rounded-xl border border-[#E8D8BE]">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#FAF8F3] text-[#7D8176] border-b border-[#E8D8BE] text-[11px] uppercase tracking-wider">
                <th className="p-2.5 w-8">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedRefs(
                        selectedRefs.length === filteredContacts.length
                          ? []
                          : filteredContacts.map((c) => c.reference)
                      )
                    }
                    className="cursor-pointer"
                    title="Tout sélectionner"
                  >
                    {selectedRefs.length > 0 && selectedRefs.length === filteredContacts.length ? (
                      <CheckSquare size={15} className="text-[#008B62]" />
                    ) : (
                      <Square size={15} />
                    )}
                  </button>
                </th>
                <th className="p-2.5">Contact & Indicatif</th>
                <th className="p-2.5">Type & Catégories</th>
                <th className="p-2.5">Devise / Langue</th>
                <th className="p-2.5">Consentement</th>
                <th className="p-2.5">Statut / Diffusion</th>
                <th className="p-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3EBDC] bg-white">
              {filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-[#7D8176]">
                    Aucun contact trouvé dans cette vue.
                  </td>
                </tr>
              ) : (
                filteredContacts.map((c) => {
                  const checked = selectedRefs.includes(c.reference);
                  const eligible =
                    !c.archived &&
                    !c.unsubscribed &&
                    c.resolvedStatus === 'active' &&
                    c.resolvedConsent &&
                    c.resolvedBroadcast &&
                    normalizeDigits(c.phone || '').length >= 8;

                  return (
                    <tr key={c.reference} className="hover:bg-[#FAF8F3]/70">
                      <td className="p-2.5">
                        <button
                          type="button"
                          onClick={() => toggleSelectRow(c.reference)}
                          className="cursor-pointer"
                        >
                          {checked ? (
                            <CheckSquare size={15} className="text-[#008B62]" />
                          ) : (
                            <Square size={15} className="text-[#7D8176]" />
                          )}
                        </button>
                      </td>
                      <td className="p-2.5">
                        <div className="font-bold text-[#192A24]">{c.name}</div>
                        <div className="font-mono text-[11px] text-[#7D8176]">
                          {c.phone || 'Sans numéro'} · {c.reference}
                        </div>
                      </td>
                      <td className="p-2.5">
                        <div className="text-[10px] font-bold text-[#7D8176] mb-1">
                          {c.resolvedType}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {c.resolvedCategories.length === 0 ? (
                            <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px]">
                              Non classé
                            </span>
                          ) : (
                            c.resolvedCategories.map((cat) => (
                              <span
                                key={cat}
                                className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-900 text-[10px] font-bold"
                              >
                                {WHATSAPP_CATEGORY_META[cat].shortLabel}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="p-2.5">
                        <div className="font-bold text-[#192A24]">
                          {c.preferredCurrency || '—'}
                        </div>
                        <div className="text-[10px] text-[#7D8176] uppercase">
                          {c.language || 'fr'}
                        </div>
                      </td>
                      <td className="p-2.5">
                        {c.resolvedConsent ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 text-[10px] font-bold">
                              <ShieldCheck size={11} /> Accordé
                            </span>
                            {c.consentDate && (
                              <div className="text-[10px] text-[#7D8176]">{c.consentDate}</div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-800 text-[10px] font-bold">
                            <UserX size={11} /> Manquant
                          </span>
                        )}
                      </td>
                      <td className="p-2.5">
                        <div className="flex flex-col gap-1">
                          {c.unsubscribed ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-100 text-red-800 text-[10px] font-extrabold w-fit">
                              <Ban size={11} /> Désabonné
                            </span>
                          ) : c.resolvedStatus === 'suspended' ? (
                            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-extrabold w-fit">
                              Suspendu
                            </span>
                          ) : eligible ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-extrabold w-fit">
                              <CheckCircle2 size={11} /> Éligible 09h00
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-[10px] font-bold w-fit">
                              Bloqué ({!c.resolvedBroadcast ? 'Diff. OFF' : 'Incomplet'})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-2.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            disabled={!canManageContacts}
                            onClick={() => openEditModal(c)}
                            className="p-1.5 rounded-lg border border-[#E8D8BE] hover:bg-[#FAF8F3] text-[#192A24] cursor-pointer disabled:opacity-40"
                            title="Modifier fiche CRM"
                          >
                            <Edit3 size={13} />
                          </button>
                          <button
                            type="button"
                            disabled={!canManageContacts}
                            onClick={() => {
                              onUpdateContact(c.reference, { archived: !c.archived });
                              onAudit(
                                c.archived ? 'Restauration contact' : 'Archivage contact',
                                `${c.name} (${c.reference})`
                              );
                            }}
                            className="p-1.5 rounded-lg border border-[#E8D8BE] hover:bg-[#FAF8F3] text-[#7D8176] cursor-pointer disabled:opacity-40"
                            title={c.archived ? 'Restaurer' : 'Archiver'}
                          >
                            <Archive size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </AppPanel>

      {/* Modal Add / Edit Contact CRM */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingRef ? `Modifier contact CRM (${editingRef})` : 'Nouveau contact CRM WhatsApp'}
      >
        <form onSubmit={handleSaveContact} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-[#192A24] mb-1">Nom complet *</label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#E8D8BE] bg-[#FAF8F3]"
              />
            </div>
            <div>
              <label className="block font-bold text-[#192A24] mb-1">
                Numéro WhatsApp (indicatif) *
              </label>
              <input
                type="text"
                required
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="+242 06 846 15 31"
                className="w-full px-3 py-2 rounded-xl border border-[#E8D8BE] bg-[#FAF8F3] font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-bold text-[#192A24] mb-1">Type de contact</label>
              <select
                value={formType}
                onChange={(e) =>
                  setFormType(e.target.value as 'Fournisseur' | 'Client' | 'Partenaire')
                }
                className="w-full px-3 py-2 rounded-xl border border-[#E8D8BE] bg-[#FAF8F3]"
              >
                <option value="Fournisseur">Fournisseur</option>
                <option value="Client">Client</option>
                <option value="Partenaire">Partenaire</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-[#192A24] mb-1">Devise préférée</label>
              <select
                value={formCurrency}
                onChange={(e) => setFormCurrency(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#E8D8BE] bg-[#FAF8F3]"
              >
                <option value="ALL">Toutes devises</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="AED">AED</option>
                <option value="CNY">CNY</option>
                <option value="XAF">XAF</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-[#192A24] mb-1">Langue</label>
              <select
                value={formLang}
                onChange={(e) => setFormLang(e.target.value as 'fr' | 'en')}
                className="w-full px-3 py-2 rounded-xl border border-[#E8D8BE] bg-[#FAF8F3]"
              >
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-bold text-[#192A24] mb-1.5">
              Catégorie(s) WhatsApp (Cahier des charges)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_WHATSAPP_CATEGORIES.map((cat) => {
                const active = formCategories.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleFormCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer ${
                      active
                        ? 'bg-[#192A24] text-white border-[#192A24]'
                        : 'bg-white text-[#192A24] border-[#E8D8BE]'
                    }`}
                  >
                    {WHATSAPP_CATEGORY_META[cat].label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-[#FAF8F3] border border-[#E8D8BE]">
            <label className="flex items-center gap-2 font-bold text-[#192A24] cursor-pointer">
              <input
                type="checkbox"
                checked={formConsent}
                onChange={(e) => setFormConsent(e.target.checked)}
              />
              <span>Consentement WhatsApp enregistré</span>
            </label>
            <label className="flex items-center gap-2 font-bold text-[#192A24] cursor-pointer">
              <input
                type="checkbox"
                checked={formBroadcast}
                disabled={formUnsubscribed}
                onChange={(e) => setFormBroadcast(e.target.checked)}
              />
              <span>Préférence de diffusion activée</span>
            </label>
            {formConsent && (
              <>
                <div>
                  <label className="block text-[11px] font-bold text-[#7D8176] mb-1">
                    Date consentement
                  </label>
                  <input
                    type="date"
                    value={formConsentDate}
                    onChange={(e) => setFormConsentDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-[#E8D8BE] bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#7D8176] mb-1">
                    Preuve consentement
                  </label>
                  <input
                    type="text"
                    value={formConsentProof}
                    onChange={(e) => setFormConsentProof(e.target.value)}
                    placeholder="Ex: Formulaire signé / Message opt-in"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-[#E8D8BE] bg-white"
                  />
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-bold text-[#192A24] mb-1">Ville</label>
              <input
                type="text"
                value={formCity}
                onChange={(e) => setFormCity(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#E8D8BE] bg-[#FAF8F3]"
              />
            </div>
            <div>
              <label className="block font-bold text-[#192A24] mb-1">Statut contact</label>
              <select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value as 'active' | 'suspended')}
                className="w-full px-3 py-2 rounded-xl border border-[#E8D8BE] bg-[#FAF8F3]"
              >
                <option value="active">Actif</option>
                <option value="suspended">Suspendu</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 font-bold text-red-700 cursor-pointer pb-2">
                <input
                  type="checkbox"
                  checked={formUnsubscribed}
                  onChange={(e) => setFormUnsubscribed(e.target.checked)}
                />
                <span>Désabonné (STOP)</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-[#E8D8BE] text-xs font-bold text-[#7D8176] cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-[#008B62] hover:bg-[#007452] text-white text-xs font-extrabold cursor-pointer"
            >
              Enregistrer dans CRM
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Aperçu Import Excel & Détection des doublons */}
      <Modal
        isOpen={Boolean(importRows)}
        onClose={() => setImportRows(null)}
        title="Prévisualisation Import Excel · Détection des doublons"
        maxWidth="max-w-3xl"
      >
        {importRows && (
          <div className="space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-[#FAF8F3] border border-[#E8D8BE]">
              <span>
                <strong>{importRows.filter((r) => !r.isDuplicate).length}</strong> contact(s)
                prêt(s) à importer ·{' '}
                <strong className="text-red-700">
                  {importRows.filter((r) => r.isDuplicate).length}
                </strong>{' '}
                doublon(s) ou invalide(s) ignoré(s)
              </span>
            </div>
            <div className="max-h-72 overflow-y-auto rounded-xl border border-[#E8D8BE]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAF8F3] border-b border-[#E8D8BE]">
                  <tr>
                    <th className="p-2">Nom</th>
                    <th className="p-2">WhatsApp</th>
                    <th className="p-2">Catégorie</th>
                    <th className="p-2">Consentement</th>
                    <th className="p-2">Contrôle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3EBDC]">
                  {importRows.map((r, i) => (
                    <tr key={i} className={r.isDuplicate ? 'bg-red-50/50 text-gray-500' : ''}>
                      <td className="p-2 font-bold">{r.name || '—'}</td>
                      <td className="p-2 font-mono">{r.phone || '—'}</td>
                      <td className="p-2">
                        {r.whatsappCategories
                          .map((c) => WHATSAPP_CATEGORY_META[c].shortLabel)
                          .join(', ')}
                      </td>
                      <td className="p-2">{r.consentGranted ? 'Oui' : 'Non'}</td>
                      <td className="p-2">
                        {r.isDuplicate ? (
                          <span className="text-red-700 font-bold">{r.duplicateReason}</span>
                        ) : (
                          <span className="text-emerald-700 font-bold">Valide</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setImportRows(null)}
                className="px-4 py-2 rounded-xl border border-[#E8D8BE] font-bold text-[#7D8176] cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={importRows.filter((r) => !r.isDuplicate).length === 0}
                onClick={handleConfirmImport}
                className="px-5 py-2 rounded-xl bg-[#008B62] hover:bg-[#007452] disabled:opacity-50 text-white font-extrabold cursor-pointer"
              >
                Importer {importRows.filter((r) => !r.isDuplicate).length} contact(s)
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
