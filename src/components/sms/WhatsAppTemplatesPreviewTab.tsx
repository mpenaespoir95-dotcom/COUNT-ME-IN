import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  FileText,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { AppPanel, SectionHeading } from '../common/UIComponents';
import {
  ALL_WHATSAPP_CATEGORIES,
  DEFAULT_SECTION6_TEMPLATES,
  WHATSAPP_CATEGORY_META,
  WhatsAppAutomationState,
  WhatsAppBusinessCategory,
  WhatsAppCampaignType,
  WhatsAppMessageTemplate,
  WhatsAppPreviewResponse,
} from '../../types/whatsappAutomation';

interface WhatsAppTemplatesPreviewTabProps {
  automationState: WhatsAppAutomationState;
  canValidate: boolean;
  isGatewayConnected: boolean;
  onSaveTemplate: (tpl: WhatsAppMessageTemplate) => Promise<void>;
  onPreview: (opts?: {
    categories?: WhatsAppBusinessCategory[];
    campaignType?: WhatsAppCampaignType;
    ignoreDailyDedupe?: boolean;
  }) => Promise<WhatsAppPreviewResponse>;
  onRunCampaign: (opts: {
    type: WhatsAppCampaignType;
    categories?: WhatsAppBusinessCategory[];
    ignoreDailyDedupe?: boolean;
    notes?: string;
  }) => Promise<void>;
}

export const WhatsAppTemplatesPreviewTab: React.FC<WhatsAppTemplatesPreviewTabProps> = ({
  automationState,
  canValidate,
  isGatewayConnected,
  onSaveTemplate,
  onPreview,
  onRunCampaign,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<WhatsAppBusinessCategory>('OR_BRUT');
  const [draftTemplates, setDraftTemplates] = useState<WhatsAppMessageTemplate[]>(
    automationState.templates
  );
  const [savingTpl, setSavingTpl] = useState(false);

  // Preview state
  const [previewCats, setPreviewCats] = useState<WhatsAppBusinessCategory[]>([]);
  const [previewMode, setPreviewMode] = useState<WhatsAppCampaignType>('scheduled_09h');
  const [ignoreDedupe, setIgnoreDedupe] = useState(false);
  const [previewData, setPreviewData] = useState<WhatsAppPreviewResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [runningCampaign, setRunningCampaign] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  useEffect(() => {
    setDraftTemplates(automationState.templates);
  }, [automationState.templates]);

  const activeTemplate =
    draftTemplates.find((t) => t.category === selectedCategory) || draftTemplates[0];

  const loadPreview = async () => {
    setLoadingPreview(true);
    try {
      const res = await onPreview({
        categories: previewCats.length > 0 ? previewCats : undefined,
        campaignType: previewMode,
        ignoreDailyDedupe: ignoreDedupe,
      });
      setPreviewData(res);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erreur de prévisualisation.',
      });
    } finally {
      setLoadingPreview(false);
    }
  };

  useEffect(() => {
    void loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    automationState.updatedAt,
    previewMode,
    ignoreDedupe,
    previewCats.join(','),
  ]);

  const handleTemplateChange = (patch: Partial<WhatsAppMessageTemplate>) => {
    setDraftTemplates((prev) =>
      prev.map((t) => (t.category === selectedCategory ? { ...t, ...patch } : t))
    );
  };

  const handleResetDefault = () => {
    const def = DEFAULT_SECTION6_TEMPLATES.find((d) => d.category === selectedCategory);
    if (!def || !activeTemplate) return;
    handleTemplateChange({
      title: def.title,
      body: def.body,
      metaTemplateName: def.metaTemplateName,
    });
  };

  const handleSaveActiveTemplate = async () => {
    if (!activeTemplate) return;
    setSavingTpl(true);
    setFeedback(null);
    try {
      await onSaveTemplate(activeTemplate);
      setFeedback({
        type: 'success',
        text: `Modèle « ${activeTemplate.title} » enregistré.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Impossible d’enregistrer le modèle.',
      });
    } finally {
      setSavingTpl(false);
    }
  };

  const togglePreviewCategory = (cat: WhatsAppBusinessCategory) => {
    setPreviewCats((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handleTriggerCampaign = async (type: WhatsAppCampaignType) => {
    if (!canValidate) return;
    setRunningCampaign(true);
    setFeedback(null);
    try {
      await onRunCampaign({
        type,
        categories: previewCats.length > 0 ? previewCats : undefined,
        ignoreDailyDedupe: type === 'exceptional' ? true : ignoreDedupe,
        notes:
          type === 'exceptional'
            ? 'Diffusion exceptionnelle déclenchée depuis le module SMS'
            : 'Exécution manuelle campagne 09h00',
      });
      await loadPreview();
      setFeedback({
        type: isGatewayConnected ? 'success' : 'info',
        text: isGatewayConnected
          ? `Campagne ${type === 'exceptional' ? 'exceptionnelle' : '09h00'} exécutée. Consultez l’onglet Historique & Campagnes.`
          : 'Passerelle WhatsApp non connectée : les messages éligibles ont été placés en file d’attente (reprise automatique configurée).',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Échec du lancement de la campagne.',
      });
    } finally {
      setRunningCampaign(false);
    }
  };

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : feedback.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <AlertCircle size={15} className="shrink-0" />
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Section 6 : 5 Modèles WhatsApp du Cahier des charges */}
      <AppPanel className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionHeading
            title="Modèles de messages WhatsApp (Section 6 · 5 catégories)"
            icon={<FileText size={18} />}
          />
          <div className="text-[11px] text-[#7D8176]">
            Variables supportées :{' '}
            <code className="px-1.5 py-0.5 rounded bg-[#FAF8F3] border border-[#E8D8BE]">
              {'{nom}'}
            </code>{' '}
            <code className="px-1.5 py-0.5 rounded bg-[#FAF8F3] border border-[#E8D8BE]">
              {'{prix}'}
            </code>{' '}
            <code className="px-1.5 py-0.5 rounded bg-[#FAF8F3] border border-[#E8D8BE]">
              {'{devise}'}
            </code>{' '}
            <code className="px-1.5 py-0.5 rounded bg-[#FAF8F3] border border-[#E8D8BE]">
              {'{prix_achat}'}
            </code>{' '}
            <code className="px-1.5 py-0.5 rounded bg-[#FAF8F3] border border-[#E8D8BE]">
              {'{prix_vente}'}
            </code>{' '}
            <code className="px-1.5 py-0.5 rounded bg-[#FAF8F3] border border-[#E8D8BE]">
              {'{stock_disponible}'}
            </code>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {ALL_WHATSAPP_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-[#192A24] text-white border-[#192A24]'
                  : 'bg-white text-[#192A24] border-[#E8D8BE]'
              }`}
            >
              {WHATSAPP_CATEGORY_META[cat].label}
            </button>
          ))}
        </div>

        {activeTemplate && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#7D8176] mb-1">
                    Titre du modèle
                  </label>
                  <input
                    type="text"
                    value={activeTemplate.title}
                    onChange={(e) => handleTemplateChange({ title: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-[#E8D8BE] bg-[#FAF8F3] text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#7D8176] mb-1">
                    Nom Template Meta Approuvé (hors 24h)
                  </label>
                  <input
                    type="text"
                    value={activeTemplate.metaTemplateName || ''}
                    onChange={(e) => handleTemplateChange({ metaTemplateName: e.target.value })}
                    placeholder="cams_cours_jour"
                    className="w-full px-3 py-2 rounded-xl border border-[#E8D8BE] bg-[#FAF8F3] text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#7D8176] mb-1">
                  Corps du message WhatsApp
                </label>
                <textarea
                  rows={8}
                  value={activeTemplate.body}
                  onChange={(e) => handleTemplateChange({ body: e.target.value })}
                  className="w-full p-3 rounded-xl border border-[#E8D8BE] bg-[#FAF8F3] text-xs leading-relaxed font-mono"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleResetDefault}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E8D8BE] bg-white hover:bg-[#FAF8F3] text-xs font-bold text-[#7D8176] cursor-pointer"
                >
                  <RotateCcw size={13} />
                  <span>Modèle Cahier des charges</span>
                </button>
                <button
                  type="button"
                  disabled={savingTpl}
                  onClick={() => void handleSaveActiveTemplate()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#192A24] hover:bg-[#253D34] text-white text-xs font-extrabold cursor-pointer"
                >
                  {savingTpl ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  <span>Enregistrer ce modèle</span>
                </button>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#ECE5DD] border border-[#D4CBB8] space-y-2">
              <div className="text-[11px] font-extrabold text-[#192A24] uppercase tracking-wider">
                Aperçu rendu WhatsApp ({WHATSAPP_CATEGORY_META[selectedCategory].shortLabel})
              </div>
              <div className="p-3.5 rounded-xl bg-white shadow-xs text-xs whitespace-pre-line text-[#192A24] leading-relaxed max-w-md">
                {activeTemplate.body
                  .replace(/\{nom\}/gi, 'Partenaire CAMS')
                  .replace(/\{prix\}/gi, '48 500')
                  .replace(/\{devise\}/gi, 'USD')
                  .replace(/\{prix_achat\}/gi, '605')
                  .replace(/\{prix_vente\}/gi, '620')
                  .replace(/\{stock_disponible\}/gi, '15 000')}
              </div>
              <p className="text-[11px] text-[#555B54]">
                Conforme Section 13 : utilisez un nom de modèle approuvé par Meta pour les diffusions hors fenêtre client de 24 heures.
              </p>
            </div>
          </div>
        )}
      </AppPanel>

      {/* Section 5 & 15 : Prévisualisation avant diffusion + Diffusion exceptionnelle */}
      <AppPanel className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <SectionHeading
              title="Prévisualisation avant diffusion & Contrôles de blocage"
              icon={<Eye size={18} />}
            />
            <p className="text-[11px] text-[#7D8176] mt-1">
              Vérifiez exactement qui recevra les messages, avec quel prix validé, et pourquoi certains contacts sont bloqués.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={loadingPreview}
              onClick={() => void loadPreview()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E8D8BE] bg-white hover:bg-[#FAF8F3] text-xs font-bold cursor-pointer"
            >
              <RefreshCw size={13} className={loadingPreview ? 'animate-spin' : ''} />
              <span>Actualiser aperçu</span>
            </button>

            <button
              type="button"
              disabled={!canValidate || runningCampaign}
              onClick={() => void handleTriggerCampaign('scheduled_09h')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#192A24] hover:bg-[#253D34] disabled:opacity-50 text-white text-xs font-extrabold cursor-pointer"
            >
              {runningCampaign ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Play size={14} />
              )}
              <span>Exécuter campagne 09h00</span>
            </button>

            <button
              type="button"
              disabled={!canValidate || runningCampaign}
              onClick={() => void handleTriggerCampaign('exceptional')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#D39725] hover:bg-[#BA841E] disabled:opacity-50 text-white text-xs font-extrabold cursor-pointer"
            >
              {runningCampaign ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Zap size={14} />
              )}
              <span>Diffusion exceptionnelle</span>
            </button>
          </div>
        </div>

        {!canValidate && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900 flex items-center gap-2">
            <ShieldCheck size={15} />
            <span>
              Validation requise (<code>sms.validate</code>) pour déclencher l’envoi d’une campagne.
            </span>
          </div>
        )}

        {/* Filtres prévisualisation */}
        <div className="p-3 rounded-xl bg-[#FAF8F3] border border-[#E8D8BE] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold text-[#7D8176] mr-1">Catégories ciblées :</span>
            <button
              type="button"
              onClick={() => setPreviewCats([])}
              className={`px-2.5 py-1 rounded-lg border font-bold cursor-pointer ${
                previewCats.length === 0
                  ? 'bg-[#192A24] text-white border-[#192A24]'
                  : 'bg-white text-[#192A24] border-[#E8D8BE]'
              }`}
            >
              Selon calendrier du jour
            </button>
            {ALL_WHATSAPP_CATEGORIES.map((cat) => {
              const active = previewCats.includes(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => togglePreviewCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg border font-bold cursor-pointer ${
                    active
                      ? 'bg-[#192A24] text-white border-[#192A24]'
                      : 'bg-white text-[#192A24] border-[#E8D8BE]'
                  }`}
                >
                  {WHATSAPP_CATEGORY_META[cat].shortLabel}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={previewMode}
              onChange={(e) => setPreviewMode(e.target.value as WhatsAppCampaignType)}
              className="px-2.5 py-1.5 rounded-lg border border-[#E8D8BE] bg-white font-bold text-xs"
            >
              <option value="scheduled_09h">Mode : 09h00 programmé</option>
              <option value="exceptional">Mode : Diffusion exceptionnelle</option>
            </select>

            <label className="inline-flex items-center gap-1.5 font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={ignoreDedupe}
                onChange={(e) => setIgnoreDedupe(e.target.checked)}
              />
              <span>Simuler sans anti-doublon du jour</span>
            </label>
          </div>
        </div>

        {previewData && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-[#FAF8F3] border border-[#E8D8BE]">
                <div className="text-[#7D8176]">Date / Heure Brazzaville</div>
                <div className="font-black text-[#192A24] text-sm">
                  {previewData.localDate} · {previewData.localTime}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <div className="text-emerald-800">Messages éligibles</div>
                <div className="font-black text-emerald-900 text-lg">
                  {previewData.eligibleCount}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                <div className="text-red-800">Messages bloqués</div>
                <div className="font-black text-red-900 text-lg">{previewData.blockedCount}</div>
              </div>
              <div className="p-3 rounded-xl bg-[#FAF8F3] border border-[#E8D8BE]">
                <div className="text-[#7D8176]">Catégories prévues ce jour</div>
                <div className="font-bold text-[#192A24]">
                  {previewData.scheduledCategoriesToday.length > 0
                    ? previewData.scheduledCategoriesToday
                        .map((c) => WHATSAPP_CATEGORY_META[c].shortLabel)
                        .join(', ')
                    : 'Aucune'}
                </div>
              </div>
            </div>

            {previewData.items.length === 0 ? (
              <div className="p-6 rounded-xl bg-[#FAF8F3] border border-[#E8D8BE] text-center text-xs text-[#7D8176]">
                Aucun contact ne correspond aux catégories sélectionnées. Ajoutez ou classez vos contacts dans l’onglet « CRM Contacts ».
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto divide-y divide-[#F3EBDC] rounded-xl border border-[#E8D8BE] bg-white">
                {previewData.items.map((item) => (
                  <div
                    key={item.id}
                    className={`p-3.5 text-xs space-y-2 ${
                      item.eligible ? 'bg-white' : 'bg-red-50/40'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {item.eligible ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-extrabold text-[10px]">
                            <CheckCircle2 size={11} /> PRÊT À ENVOYER
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-100 text-red-800 font-extrabold text-[10px]">
                            <Send size={11} /> BLOQUÉ
                          </span>
                        )}
                        <span className="font-black text-[#192A24]">{item.contactName}</span>
                        <span className="font-mono text-[#7D8176]">{item.phone}</span>
                        <span className="px-2 py-0.5 rounded bg-[#FAF8F3] border border-[#E8D8BE] font-bold text-[10px]">
                          {WHATSAPP_CATEGORY_META[item.category].shortLabel}
                        </span>
                      </div>
                      <span className="font-bold text-[#9E731B]">{item.priceSummary}</span>
                    </div>

                    {!item.eligible && (
                      <div className="text-[11px] font-bold text-red-700">
                        Motif(s) de blocage : {item.blockReasons.join(' · ')}
                      </div>
                    )}

                    <pre className="p-2.5 rounded-lg bg-[#FAF8F3] border border-[#EFE6D5] whitespace-pre-wrap font-sans text-[11px] text-[#333]">
                      {item.renderedText}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </AppPanel>
    </div>
  );
};
