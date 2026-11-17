import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Ban,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  History,
  Loader2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { AppPanel, SectionHeading } from '../common/UIComponents';
import {
  WHATSAPP_CATEGORY_META,
  WhatsAppAutomationState,
  WhatsAppBusinessCategory,
  WhatsAppCampaignRecord,
  WhatsAppMessageLogStatus,
} from '../../types/whatsappAutomation';

interface WhatsAppHistoryAuditTabProps {
  automationState: WhatsAppAutomationState;
  canValidate: boolean;
  onToggleCampaignPause: (campaignId: string, paused: boolean) => Promise<void>;
  onCancelCampaign: (campaignId: string) => Promise<void>;
  onRetryQueue: (opts?: { campaignId?: string; logId?: string }) => Promise<number>;
}

const LOG_STATUS_LABELS: Record<
  WhatsAppMessageLogStatus,
  { label: string; badgeClass: string }
> = {
  pending: { label: 'En attente', badgeClass: 'bg-amber-100 text-amber-900' },
  sending: { label: 'En cours', badgeClass: 'bg-blue-100 text-blue-800' },
  accepted: { label: 'Accepté API', badgeClass: 'bg-teal-100 text-teal-800' },
  delivered: { label: 'Livré', badgeClass: 'bg-emerald-100 text-emerald-800' },
  read: { label: 'Lu', badgeClass: 'bg-emerald-200 text-emerald-950' },
  failed: { label: 'Échec', badgeClass: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Annulé', badgeClass: 'bg-gray-200 text-gray-700' },
  blocked: { label: 'Bloqué', badgeClass: 'bg-orange-100 text-orange-900' },
};

const CAMPAIGN_STATUS_LABELS: Record<
  WhatsAppCampaignRecord['status'],
  { label: string; badgeClass: string }
> = {
  scheduled: { label: 'En file d’attente', badgeClass: 'bg-amber-100 text-amber-900' },
  running: { label: 'En cours', badgeClass: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Terminée', badgeClass: 'bg-emerald-100 text-emerald-800' },
  partial: { label: 'Partielle', badgeClass: 'bg-amber-100 text-amber-900' },
  paused: { label: 'Suspendue', badgeClass: 'bg-orange-100 text-orange-900' },
  cancelled: { label: 'Annulée', badgeClass: 'bg-gray-200 text-gray-700' },
  failed: { label: 'Échec', badgeClass: 'bg-red-100 text-red-800' },
};

export const WhatsAppHistoryAuditTab: React.FC<WhatsAppHistoryAuditTabProps> = ({
  automationState,
  canValidate,
  onToggleCampaignPause,
  onCancelCampaign,
  onRetryQueue,
}) => {
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [recipientQuery, setRecipientQuery] = useState('');
  const [retryingKey, setRetryingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const filteredLogs = useMemo(() => {
    const q = recipientQuery.trim().toLowerCase();
    return automationState.logs.filter((l) => {
      if (selectedCampaignId !== 'ALL' && l.campaignId !== selectedCampaignId) return false;
      if (dateFilter && !l.createdAt.startsWith(dateFilter)) return false;
      if (categoryFilter !== 'ALL' && l.category !== categoryFilter) return false;
      if (statusFilter !== 'ALL' && l.status !== statusFilter) return false;
      if (q) {
        const hit =
          l.contactName.toLowerCase().includes(q) ||
          l.phone.toLowerCase().includes(q) ||
          l.campaignRef.toLowerCase().includes(q) ||
          (l.whatsappMessageId || '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [
    automationState.logs,
    selectedCampaignId,
    dateFilter,
    categoryFilter,
    statusFilter,
    recipientQuery,
  ]);

  const handleRetry = async (opts?: { campaignId?: string; logId?: string }, key = 'all') => {
    setRetryingKey(key);
    setFeedback(null);
    try {
      const count = await onRetryQueue(opts);
      setFeedback({
        type: 'success',
        text:
          count > 0
            ? `${count} message(s) repris sans doublon.`
            : 'Aucun message éligible à la reprise (déjà envoyé ou annulé).',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Échec de la reprise.',
      });
    } finally {
      setRetryingKey(null);
    }
  };

  const handleExportExcel = () => {
    const rows = filteredLogs.map((l) => ({
      Date_Heure: new Date(l.createdAt).toLocaleString('fr-FR'),
      Campagne: l.campaignRef,
      Type: l.messageType === 'scheduled_09h' ? 'Automatique 09h00' : 'Exceptionnelle',
      Destinataire: l.contactName,
      Numero_WhatsApp: l.phone,
      Categorie:
        l.category in WHATSAPP_CATEGORY_META
          ? WHATSAPP_CATEGORY_META[l.category as WhatsAppBusinessCategory].label
          : l.category,
      Devise: l.currencyCode || '',
      Prix_Transmis: l.priceSummary,
      Statut: LOG_STATUS_LABELS[l.status]?.label || l.status,
      ID_Message_WhatsApp: l.whatsappMessageId || '',
      Motif_Echec_ou_Blocage: l.errorReason || '',
      Tentatives: l.retryCount,
      Cle_Idempotence: l.idempotencyKey,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Historique_WhatsApp');
    XLSX.writeFile(
      wb,
      `CAMS_GOLD_WhatsApp_Historique_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  };

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs font-bold ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Campagnes programmées et exceptionnelles */}
      <AppPanel className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionHeading
            title={`Campagnes WhatsApp (${automationState.campaigns.length})`}
            icon={<Clock size={18} />}
          />
          {automationState.pendingQueueCount > 0 && (
            <button
              type="button"
              disabled={retryingKey !== null}
              onClick={() => void handleRetry(undefined, 'all')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#D39725] hover:bg-[#BA841E] text-white text-xs font-extrabold cursor-pointer"
            >
              {retryingKey === 'all' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RotateCcw size={14} />
              )}
              <span>Relancer file d’attente ({automationState.pendingQueueCount})</span>
            </button>
          )}
        </div>

        {automationState.campaigns.length === 0 ? (
          <div className="p-4 rounded-xl bg-[#FAF8F3] border border-[#E8D8BE] text-xs text-[#7D8176]">
            Aucune campagne WhatsApp exécutée pour le moment.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#E8D8BE]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#FAF8F3] text-[#7D8176] border-b border-[#E8D8BE] text-[11px]">
                  <th className="p-2.5">Référence</th>
                  <th className="p-2.5">Date & Type</th>
                  <th className="p-2.5">Catégories</th>
                  <th className="p-2.5">Acceptés / Livrés / Lus</th>
                  <th className="p-2.5">Bloqués / Échecs</th>
                  <th className="p-2.5">Statut</th>
                  <th className="p-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3EBDC] bg-white">
                {automationState.campaigns.map((camp) => {
                  const st = CAMPAIGN_STATUS_LABELS[camp.status];
                  const isPaused = camp.status === 'paused';
                  return (
                    <tr key={camp.id} className="hover:bg-[#FAF8F3]/70">
                      <td className="p-2.5 font-black text-[#192A24]">{camp.reference}</td>
                      <td className="p-2.5">
                        <div>{new Date(camp.triggeredAt).toLocaleString('fr-FR')}</div>
                        <div className="text-[10px] text-[#7D8176]">
                          {camp.type === 'scheduled_09h'
                            ? 'Auto 09h00'
                            : camp.type === 'exceptional'
                              ? 'Diffusion exceptionnelle'
                              : 'Manuelle'}{' '}
                          · {camp.createdBy}
                        </div>
                      </td>
                      <td className="p-2.5">
                        <div className="flex flex-wrap gap-1">
                          {camp.categories.map((cat) => (
                            <span
                              key={cat}
                              className="px-1.5 py-0.5 rounded bg-[#FAF8F3] border border-[#E8D8BE] text-[10px] font-bold"
                            >
                              {WHATSAPP_CATEGORY_META[cat]?.shortLabel || cat}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-2.5 font-bold">
                        <span className="text-teal-700">{camp.sentCount}</span> /{' '}
                        <span className="text-emerald-700">{camp.deliveredCount}</span> /{' '}
                        <span className="text-emerald-900">{camp.readCount}</span>
                      </td>
                      <td className="p-2.5">
                        <span className="text-orange-700 font-bold">{camp.blockedCount} blq</span> ·{' '}
                        <span className="text-red-700 font-bold">{camp.failedCount} éch</span>
                      </td>
                      <td className="p-2.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${st.badgeClass}`}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td className="p-2.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedCampaignId(camp.id)}
                            className="px-2 py-1 rounded-lg border border-[#E8D8BE] bg-white text-[11px] font-bold cursor-pointer"
                          >
                            Détail
                          </button>
                          {canValidate && camp.status !== 'cancelled' && (
                            <button
                              type="button"
                              onClick={() => void onToggleCampaignPause(camp.id, !isPaused)}
                              className="p-1.5 rounded-lg border border-[#E8D8BE] hover:bg-[#FAF8F3] text-[#192A24] cursor-pointer"
                              title={isPaused ? 'Reprendre la campagne' : 'Suspendre la campagne'}
                            >
                              {isPaused ? <PlayCircle size={14} /> : <PauseCircle size={14} />}
                            </button>
                          )}
                          {(camp.failedCount > 0 || camp.status === 'scheduled') && (
                            <button
                              type="button"
                              disabled={retryingKey !== null}
                              onClick={() => void handleRetry({ campaignId: camp.id }, camp.id)}
                              className="p-1.5 rounded-lg border border-[#E8D8BE] hover:bg-amber-50 text-[#9E731B] cursor-pointer"
                              title="Réessayer les échecs sans doublon"
                            >
                              <RefreshCw size={14} />
                            </button>
                          )}
                          {canValidate &&
                            camp.status !== 'cancelled' &&
                            camp.status !== 'completed' && (
                              <button
                                type="button"
                                onClick={() => void onCancelCampaign(camp.id)}
                                className="p-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-red-700 cursor-pointer"
                                title="Annuler les envois en attente"
                              >
                                <Ban size={14} />
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AppPanel>

      {/* Historique détaillé et suivi des messages */}
      <AppPanel className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <SectionHeading
            title={`Historique détaillé des messages (${filteredLogs.length})`}
            icon={<History size={18} />}
          />
          <button
            type="button"
            disabled={filteredLogs.length === 0}
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#192A24] hover:bg-[#253D34] disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
          >
            <FileSpreadsheet size={14} />
            <Download size={13} />
            <span>Exporter Excel (.xlsx)</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-[#7D8176]" />
            <input
              type="text"
              value={recipientQuery}
              onChange={(e) => setRecipientQuery(e.target.value)}
              placeholder="Destinataire, numéro, ID..."
              className="w-full pl-8 pr-3 py-2 rounded-xl border border-[#E8D8BE] bg-[#FAF8F3]"
            />
          </div>

          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-[#E8D8BE] bg-[#FAF8F3]"
          />

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-[#E8D8BE] bg-[#FAF8F3] font-bold"
          >
            <option value="ALL">Toutes catégories</option>
            {Object.values(WHATSAPP_CATEGORY_META).map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-[#E8D8BE] bg-[#FAF8F3] font-bold"
          >
            <option value="ALL">Tous statuts</option>
            {Object.entries(LOG_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>

          <select
            value={selectedCampaignId}
            onChange={(e) => setSelectedCampaignId(e.target.value)}
            className="px-3 py-2 rounded-xl border border-[#E8D8BE] bg-[#FAF8F3] font-bold"
          >
            <option value="ALL">Toutes campagnes</option>
            {automationState.campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.reference}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[#E8D8BE] max-h-[420px]">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 bg-[#FAF8F3] z-10">
              <tr className="text-[#7D8176] border-b border-[#E8D8BE] text-[11px]">
                <th className="p-2.5">Date & Heure</th>
                <th className="p-2.5">Destinataire</th>
                <th className="p-2.5">Catégorie & Type</th>
                <th className="p-2.5">Prix transmis</th>
                <th className="p-2.5">Statut & ID API</th>
                <th className="p-2.5">Motif / Reprise</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3EBDC] bg-white">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-[#7D8176]">
                    Aucun enregistrement correspondant aux filtres.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const st = LOG_STATUS_LABELS[log.status];
                  const canRetry = log.status === 'failed' || log.status === 'pending';
                  return (
                    <tr key={log.id} className="hover:bg-[#FAF8F3]/60">
                      <td className="p-2.5 whitespace-nowrap">
                        <div>{new Date(log.createdAt).toLocaleString('fr-FR')}</div>
                        <div className="text-[10px] font-mono text-[#7D8176]">
                          {log.campaignRef}
                        </div>
                      </td>
                      <td className="p-2.5">
                        <div className="font-bold text-[#192A24]">{log.contactName}</div>
                        <div className="font-mono text-[11px] text-[#7D8176]">{log.phone}</div>
                      </td>
                      <td className="p-2.5">
                        <div className="font-bold">
                          {log.category in WHATSAPP_CATEGORY_META
                            ? WHATSAPP_CATEGORY_META[log.category as WhatsAppBusinessCategory]
                                .shortLabel
                            : log.category}
                        </div>
                        <div className="text-[10px] text-[#7D8176]">
                          {log.messageType === 'scheduled_09h' ? '09h00' : 'Exceptionnelle'}
                        </div>
                      </td>
                      <td className="p-2.5 font-semibold text-[#9E731B]">{log.priceSummary}</td>
                      <td className="p-2.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold ${st.badgeClass}`}
                        >
                          {log.status === 'delivered' || log.status === 'read' ? (
                            <CheckCircle2 size={10} />
                          ) : null}
                          {st.label}
                        </span>
                        {log.whatsappMessageId && (
                          <div className="font-mono text-[10px] text-[#7D8176] mt-0.5 truncate max-w-[140px]">
                            {log.whatsappMessageId}
                          </div>
                        )}
                      </td>
                      <td className="p-2.5 max-w-[240px]">
                        {log.errorReason && (
                          <div className="text-[11px] text-red-700 font-medium">
                            {log.errorReason}
                          </div>
                        )}
                        {log.retryCount > 0 && (
                          <div className="text-[10px] text-[#7D8176]">
                            Tentatives : {log.retryCount}
                          </div>
                        )}
                        {canRetry && (
                          <button
                            type="button"
                            disabled={retryingKey !== null}
                            onClick={() => void handleRetry({ logId: log.id }, log.id)}
                            className="mt-1 inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-50 border border-amber-200 text-amber-900 text-[10px] font-bold cursor-pointer"
                          >
                            <RotateCcw size={10} /> Réessayer sans doublon
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </AppPanel>

      {/* Section 8 : Journal d'audit */}
      <AppPanel className="space-y-3">
        <SectionHeading
          title={`Journal d’audit & sécurité (${automationState.auditLogs.length})`}
          icon={<ShieldAlert size={18} />}
        />
        {automationState.auditLogs.length === 0 ? (
          <div className="text-xs text-[#7D8176]">Aucune action enregistrée dans l’audit.</div>
        ) : (
          <div className="max-h-60 overflow-y-auto divide-y divide-[#F3EBDC] rounded-xl border border-[#E8D8BE] bg-white">
            {automationState.auditLogs.slice(0, 60).map((a) => (
              <div
                key={a.id}
                className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div>
                  <span className="font-extrabold text-[#192A24]">{a.action}</span> ·{' '}
                  <span className="text-[#555B54]">{a.summary}</span>
                </div>
                <div className="text-[11px] text-[#7D8176] whitespace-nowrap">
                  <strong>{a.actorName}</strong> ({a.actorRole}) ·{' '}
                  {new Date(a.timestamp).toLocaleString('fr-FR')}
                </div>
              </div>
            ))}
          </div>
        )}
      </AppPanel>
    </div>
  );
};
