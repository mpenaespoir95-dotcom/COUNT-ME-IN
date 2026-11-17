import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Coins,
  DollarSign,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { AppPanel, SectionHeading } from '../common/UIComponents';
import { PurchaseFormulaConfig } from '../../types';
import {
  CurrencyRateInventoryEntry,
  GoldPriceQuoteEntry,
  PriceApprovalStatus,
  WhatsAppAutomationState,
} from '../../types/whatsappAutomation';
import { GoldPriceService } from '../../services/goldPriceService';
import { ExchangeRateService } from '../../services/exchangeRateService';
import { computeGoldPurchasePrice, formatMoney } from '../../utils/goldMath';

interface WhatsAppPricesStockTabProps {
  automationState: WhatsAppAutomationState;
  canValidate: boolean;
  purchaseFormulaConfig: PurchaseFormulaConfig;
  currencyBalances: Record<string, number>;
  actorName: string;
  actorRole: string;
  onSaveGoldPrice: (
    quote: Partial<GoldPriceQuoteEntry> & { category: 'OR_BRUT' | 'OR_FONDU' | 'BIJOUX' }
  ) => Promise<void>;
  onSaveCurrencyRates: (rates: CurrencyRateInventoryEntry[], summaryNote?: string) => Promise<void>;
}

const GOLD_CATEGORIES: Array<{
  key: 'OR_BRUT' | 'OR_FONDU' | 'BIJOUX';
  title: string;
  subtitle: string;
  frequencyLabel: string;
}> = [
  {
    key: 'OR_BRUT',
    title: 'Or brut',
    subtitle: 'Prix saisi manuellement et validé (24K ou référence configurée)',
    frequencyLabel: 'Diffusion hebdomadaire',
  },
  {
    key: 'OR_FONDU',
    title: 'Or fondu',
    subtitle: 'Prix de base du logiciel synchronisé et validé',
    frequencyLabel: 'Diffusion quotidienne',
  },
  {
    key: 'BIJOUX',
    title: 'Bijoux',
    subtitle: 'Prix saisi manuellement et validé',
    frequencyLabel: 'Diffusion hebdomadaire',
  },
];

const statusBadge = (status: PriceApprovalStatus) => {
  if (status === 'validated') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold uppercase">
        <CheckCircle2 size={11} /> Validé
      </span>
    );
  }
  if (status === 'expired') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-extrabold uppercase">
        <AlertTriangle size={11} /> Expiré
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-extrabold uppercase">
      Brouillon
    </span>
  );
};

export const WhatsAppPricesStockTab: React.FC<WhatsAppPricesStockTabProps> = ({
  automationState,
  canValidate,
  purchaseFormulaConfig,
  currencyBalances,
  actorName,
  onSaveGoldPrice,
  onSaveCurrencyRates,
}) => {
  const [goldDrafts, setGoldDrafts] = useState(automationState.goldPrices);
  const [currencyDrafts, setCurrencyDrafts] = useState<CurrencyRateInventoryEntry[]>(
    automationState.currencyRates
  );
  const [newCurrencyCode, setNewCurrencyCode] = useState('');
  const [syncingSoftware, setSyncingSoftware] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  useEffect(() => {
    setGoldDrafts(automationState.goldPrices);
    setCurrencyDrafts(automationState.currencyRates);
  }, [automationState.goldPrices, automationState.currencyRates]);

  const updateGoldField = (
    cat: 'OR_BRUT' | 'OR_FONDU' | 'BIJOUX',
    patch: Partial<GoldPriceQuoteEntry>
  ) => {
    setGoldDrafts((prev) => ({
      ...prev,
      [cat]: {
        ...prev[cat],
        ...patch,
      },
    }));
  };

  const handleSaveGold = async (
    cat: 'OR_BRUT' | 'OR_FONDU' | 'BIJOUX',
    targetStatus: PriceApprovalStatus
  ) => {
    if (targetStatus === 'validated' && !canValidate) return;
    const item = goldDrafts[cat];
    if (targetStatus === 'validated' && (!item.pricePerGramXaf || item.pricePerGramXaf <= 0)) {
      setFeedback({
        type: 'error',
        text: `Impossible de valider ${cat} : le prix doit être supérieur à 0 FCFA.`,
      });
      return;
    }
    setSavingKey(cat);
    setFeedback(null);
    try {
      await onSaveGoldPrice({
        ...item,
        category: cat,
        status: targetStatus,
      });
      setFeedback({
        type: 'success',
        text:
          targetStatus === 'validated'
            ? `Tarif ${cat} validé et prêt pour la diffusion.`
            : `Tarif ${cat} enregistré en brouillon.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erreur de sauvegarde.',
      });
    } finally {
      setSavingKey(null);
    }
  };

  const handleSyncFonduFromSoftware = async () => {
    setSyncingSoftware(true);
    setFeedback(null);
    try {
      const [goldQuote, fxSnap] = await Promise.all([
        GoldPriceService.fetchGoldUsd(),
        ExchangeRateService.fetchRates(),
      ]);
      const usdToXaf =
        purchaseFormulaConfig.officialUsdRate > 0
          ? purchaseFormulaConfig.officialUsdRate
          : ExchangeRateService.getRate(fxSnap, 'USD', 'XAF') || 600;
      const ouncePrice =
        goldQuote.pricePerTroyOunceUsd > 0
          ? goldQuote.pricePerTroyOunceUsd
          : purchaseFormulaConfig.kitcoGoldSpotUsd || 0;

      if (ouncePrice <= 0) {
        throw new Error('Cours spot de l’or indisponible. Saisissez le tarif manuellement.');
      }

      const res = computeGoldPurchasePrice({
        pricePerTroyOunceUsd: ouncePrice,
        usdToXafRate: usdToXaf,
        karat: 24,
        category: 'Or fondu',
        config: purchaseFormulaConfig,
      });
      const computedPrice = Math.round(
        purchaseFormulaConfig.useParallelRateInPurchases && res.parallelPricePerGram > 0
          ? res.parallelPricePerGram
          : res.pricePerGram
      );
      const today = new Date().toISOString().slice(0, 10);
      await onSaveGoldPrice({
        category: 'OR_FONDU',
        pricePerGramXaf: computedPrice,
        source: 'software_base',
        status: 'draft',
        validFrom: today,
        validUntil: `${today}T23:59`,
      });
      setFeedback({
        type: 'success',
        text: `Cours de base Or fondu calculé (${formatMoney(computedPrice)} FCFA/g · OZ $${ouncePrice}). En attente de validation pour diffusion.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Synchronisation logiciel impossible.',
      });
    } finally {
      setSyncingSoftware(false);
    }
  };

  const handleSyncCurrencyFromSoftware = async () => {
    setSyncingSoftware(true);
    setFeedback(null);
    try {
      const fxSnap = await ExchangeRateService.fetchRates();
      const today = new Date().toISOString().slice(0, 10);
      const validUntil = `${today}T23:59`;
      const knownCodes = Array.from(
        new Set([
          ...currencyDrafts.map((c) => c.code),
          ...Object.keys(currencyBalances || {}).filter((k) => k !== 'XAF'),
        ])
      );

      const nextRates: CurrencyRateInventoryEntry[] = knownCodes.map((code) => {
        const existing = currencyDrafts.find((c) => c.code === code);
        const liveRate = ExchangeRateService.getRate(fxSnap, code, 'XAF');
        const phys = Number(currencyBalances?.[code] ?? existing?.physicalStock ?? 0);
        const resv = Number(existing?.reservedStock ?? 0);
        const buy = existing?.buyRateXaf || (liveRate ? Math.round(liveRate * 0.99) : 0);
        const sell = existing?.sellRateXaf || (liveRate ? Math.round(liveRate * 1.01) : 0);
        return {
          code,
          buyRateXaf: buy,
          sellRateXaf: sell,
          physicalStock: phys,
          reservedStock: resv,
          availableStock: Math.max(0, phys - resv),
          minAnnounceStock: existing?.minAnnounceStock ?? 100,
          status: 'draft',
          validUntil,
          updatedAt: new Date().toISOString(),
          updatedBy: actorName,
        };
      });

      setCurrencyDrafts(nextRates);
      await onSaveCurrencyRates(
        nextRates,
        'Synchronisation des stocks depuis Coffre Devises (statut brouillon avant validation).'
      );
      setFeedback({
        type: 'success',
        text: 'Stocks physiques synchronisés depuis le module Stock Devises (en brouillon jusqu’à validation).',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erreur de synchronisation devises.',
      });
    } finally {
      setSyncingSoftware(false);
    }
  };

  const updateCurrencyRow = (code: string, patch: Partial<CurrencyRateInventoryEntry>) => {
    setCurrencyDrafts((prev) =>
      prev.map((row) => {
        if (row.code !== code) return row;
        const merged = { ...row, ...patch };
        merged.availableStock = Math.max(
          0,
          (Number(merged.physicalStock) || 0) - (Number(merged.reservedStock) || 0)
        );
        return merged;
      })
    );
  };

  const handleAddCurrency = () => {
    const code = newCurrencyCode.trim().toUpperCase();
    if (!code || currencyDrafts.some((c) => c.code === code)) return;
    const today = new Date().toISOString().slice(0, 10);
    setCurrencyDrafts((prev) => [
      ...prev,
      {
        code,
        buyRateXaf: 0,
        sellRateXaf: 0,
        physicalStock: Number(currencyBalances?.[code] || 0),
        reservedStock: 0,
        availableStock: Number(currencyBalances?.[code] || 0),
        minAnnounceStock: 100,
        status: 'draft',
        validUntil: `${today}T23:59`,
        updatedAt: new Date().toISOString(),
        updatedBy: actorName,
      },
    ]);
    setNewCurrencyCode('');
  };

  const handleSaveAllCurrencies = async (approveAll: boolean) => {
    if (approveAll && !canValidate) return;
    setSavingKey('currencies');
    setFeedback(null);
    try {
      const nowIso = new Date().toISOString();
      const payload = currencyDrafts.map((row) => {
        const nextStatus: PriceApprovalStatus = approveAll
          ? row.buyRateXaf > 0 || row.sellRateXaf > 0
            ? 'validated'
            : 'draft'
          : row.status === 'validated' && !canValidate
            ? 'draft'
            : row.status;
        return {
          ...row,
          status: nextStatus,
          ...(nextStatus === 'validated'
            ? { validatedAt: nowIso, validatedBy: actorName }
            : {}),
        };
      });
      await onSaveCurrencyRates(
        payload,
        approveAll
          ? `Validation globale des taux & stocks devises par ${actorName}.`
          : `Enregistrement brouillon des taux & stocks devises.`
      );
      setFeedback({
        type: 'success',
        text: approveAll
          ? 'Taux et disponibilités devises validés pour la diffusion.'
          : 'Taux et inventaire enregistrés.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Impossible d’enregistrer les devises.',
      });
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-6">
      {!canValidate && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900 flex items-center gap-2">
          <ShieldCheck size={16} className="shrink-0" />
          <span>
            Sécurité (Section 8) : vous pouvez préparer les tarifs en <strong>brouillon</strong>, mais seul un utilisateur autorisé (droit <code>sms.validate</code>) peut les <strong>valider</strong> pour autoriser l’envoi WhatsApp.
          </span>
        </div>
      )}

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

      {/* A. Prix de l'or */}
      <AppPanel className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionHeading
            title="Prix d’achat de l’Or (Or brut, Or fondu, Bijoux)"
            icon={<Coins size={18} />}
          />
          <button
            type="button"
            disabled={syncingSoftware}
            onClick={() => void handleSyncFonduFromSoftware()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FFF4D6] hover:bg-[#FCE8B2] border border-[#E8D8BE] text-[#8F630A] text-xs font-extrabold cursor-pointer disabled:opacity-50"
          >
            {syncingSoftware ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            <span>Importer cours de base logiciel (Or fondu)</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {GOLD_CATEGORIES.map(({ key, title, subtitle, frequencyLabel }) => {
            const q = goldDrafts[key];
            return (
              <div
                key={key}
                className="p-4 rounded-2xl bg-[#FAF8F3] border border-[#E8D8BE] space-y-3 flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-black text-[#192A24]">{title}</div>
                      <div className="text-[11px] text-[#7D8176]">{frequencyLabel}</div>
                    </div>
                    {statusBadge(q.status)}
                  </div>
                  <p className="text-[11px] text-[#555B54]">{subtitle}</p>

                  <div>
                    <label className="block text-[11px] font-bold text-[#7D8176] mb-1">
                      Prix d’achat ({q.currency} / {q.unit})
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={q.pricePerGramXaf || ''}
                      onChange={(e) =>
                        updateGoldField(key, {
                          pricePerGramXaf: Number(e.target.value) || 0,
                          status: 'draft',
                        })
                      }
                      placeholder="Ex: 48500"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-[#E8D8BE] text-sm font-extrabold text-[#192A24]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-[#7D8176] mb-1">
                        Unité
                      </label>
                      <input
                        type="text"
                        value={q.unit}
                        onChange={(e) => updateGoldField(key, { unit: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-[#E8D8BE] text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#7D8176] mb-1">
                        Devise réf.
                      </label>
                      <input
                        type="text"
                        value={q.currency}
                        onChange={(e) => updateGoldField(key, { currency: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-[#E8D8BE] text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-[#7D8176] mb-1">
                      Valide jusqu’au
                    </label>
                    <input
                      type="datetime-local"
                      value={(q.validUntil || '').slice(0, 16)}
                      onChange={(e) => updateGoldField(key, { validUntil: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-[#E8D8BE] text-xs"
                    />
                  </div>

                  <div className="text-[10px] text-[#7D8176] pt-1">
                    Modifié par <strong>{q.updatedBy}</strong> ·{' '}
                    {q.updatedAt ? new Date(q.updatedAt).toLocaleString('fr-FR') : '—'}
                    {q.validatedBy && q.status === 'validated' && (
                      <div>Validé par {q.validatedBy}</div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-[#E8D8BE]">
                  <button
                    type="button"
                    disabled={savingKey === key}
                    onClick={() => void handleSaveGold(key, 'draft')}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl border border-[#E8D8BE] bg-white hover:bg-gray-50 text-[11px] font-bold text-[#192A24] cursor-pointer"
                  >
                    <Save size={13} />
                    <span>Brouillon</span>
                  </button>
                  {canValidate && (
                    <button
                      type="button"
                      disabled={savingKey === key}
                      onClick={() => void handleSaveGold(key, 'validated')}
                      className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-[#008B62] hover:bg-[#007452] text-white text-[11px] font-extrabold cursor-pointer"
                    >
                      <CheckCircle2 size={13} />
                      <span>Valider</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </AppPanel>

      {/* B. Prix des devises et inventaire */}
      <AppPanel className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <SectionHeading
              title="Prix des Devises & Inventaire (Stock disponible = Physique − Réservé)"
              icon={<DollarSign size={18} />}
            />
            <p className="text-[11px] text-[#7D8176] mt-1">
              Règle de blocage : aucun message client devises ne part si le tarif est non validé/expiré ou si le stock disponible est nul ou inférieur au seuil minimum.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={syncingSoftware}
              onClick={() => void handleSyncCurrencyFromSoftware()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#E8D8BE] bg-[#FAF8F3] hover:bg-[#F3EBDC] text-xs font-bold text-[#192A24] cursor-pointer"
            >
              <RefreshCw size={13} className={syncingSoftware ? 'animate-spin' : ''} />
              <span>Synchroniser coffre devises</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[#E8D8BE]">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#FAF8F3] text-[#7D8176] border-b border-[#E8D8BE] text-[11px]">
                <th className="p-2.5">Devise</th>
                <th className="p-2.5">Prix Achat (FCFA)</th>
                <th className="p-2.5">Prix Vente (FCFA)</th>
                <th className="p-2.5">Stock Physique</th>
                <th className="p-2.5">Stock Réservé</th>
                <th className="p-2.5">Stock Disponible</th>
                <th className="p-2.5">Seuil Min.</th>
                <th className="p-2.5">Validité</th>
                <th className="p-2.5">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3EBDC] bg-white">
              {currencyDrafts.map((row) => {
                const avail = Math.max(0, row.physicalStock - row.reservedStock);
                const stockOk = avail > 0 && avail >= (row.minAnnounceStock || 0);
                return (
                  <tr key={row.code}>
                    <td className="p-2.5 font-black text-[#192A24]">{row.code}</td>
                    <td className="p-2.5">
                      <input
                        type="number"
                        min={0}
                        value={row.buyRateXaf || ''}
                        onChange={(e) =>
                          updateCurrencyRow(row.code, {
                            buyRateXaf: Number(e.target.value) || 0,
                            status: 'draft',
                          })
                        }
                        className="w-24 px-2 py-1.5 rounded-lg border border-[#E8D8BE] bg-[#FAF8F3] font-bold"
                      />
                    </td>
                    <td className="p-2.5">
                      <input
                        type="number"
                        min={0}
                        value={row.sellRateXaf || ''}
                        onChange={(e) =>
                          updateCurrencyRow(row.code, {
                            sellRateXaf: Number(e.target.value) || 0,
                            status: 'draft',
                          })
                        }
                        className="w-24 px-2 py-1.5 rounded-lg border border-[#E8D8BE] bg-[#FAF8F3] font-bold"
                      />
                    </td>
                    <td className="p-2.5">
                      <input
                        type="number"
                        min={0}
                        value={row.physicalStock}
                        onChange={(e) =>
                          updateCurrencyRow(row.code, {
                            physicalStock: Number(e.target.value) || 0,
                          })
                        }
                        className="w-24 px-2 py-1.5 rounded-lg border border-[#E8D8BE] bg-white"
                      />
                    </td>
                    <td className="p-2.5">
                      <input
                        type="number"
                        min={0}
                        value={row.reservedStock}
                        onChange={(e) =>
                          updateCurrencyRow(row.code, {
                            reservedStock: Number(e.target.value) || 0,
                          })
                        }
                        className="w-24 px-2 py-1.5 rounded-lg border border-[#E8D8BE] bg-white"
                      />
                    </td>
                    <td className="p-2.5">
                      <span
                        className={`px-2 py-1 rounded-lg font-extrabold ${
                          stockOk ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {formatMoney(avail)} {row.code}
                      </span>
                    </td>
                    <td className="p-2.5">
                      <input
                        type="number"
                        min={0}
                        value={row.minAnnounceStock}
                        onChange={(e) =>
                          updateCurrencyRow(row.code, {
                            minAnnounceStock: Number(e.target.value) || 0,
                          })
                        }
                        className="w-20 px-2 py-1.5 rounded-lg border border-[#E8D8BE] bg-white"
                      />
                    </td>
                    <td className="p-2.5">
                      <input
                        type="datetime-local"
                        value={(row.validUntil || '').slice(0, 16)}
                        onChange={(e) => updateCurrencyRow(row.code, { validUntil: e.target.value })}
                        className="px-2 py-1.5 rounded-lg border border-[#E8D8BE] bg-white text-[11px]"
                      />
                    </td>
                    <td className="p-2.5">{statusBadge(row.status)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newCurrencyCode}
              onChange={(e) => setNewCurrencyCode(e.target.value)}
              placeholder="Ajouter devise (ex: CNY, XOF)"
              className="px-3 py-2 rounded-xl border border-[#E8D8BE] bg-[#FAF8F3] text-xs uppercase w-48"
            />
            <button
              type="button"
              onClick={handleAddCurrency}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-[#E8D8BE] bg-white hover:bg-[#FAF8F3] text-xs font-bold cursor-pointer"
            >
              <Plus size={14} /> Ajouter
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={savingKey === 'currencies'}
              onClick={() => void handleSaveAllCurrencies(false)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#E8D8BE] bg-white hover:bg-[#FAF8F3] text-xs font-bold text-[#192A24] cursor-pointer"
            >
              <Save size={14} />
              <span>Enregistrer brouillon</span>
            </button>
            {canValidate && (
              <button
                type="button"
                disabled={savingKey === 'currencies'}
                onClick={() => void handleSaveAllCurrencies(true)}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#008B62] hover:bg-[#007452] text-white text-xs font-extrabold cursor-pointer"
              >
                <CheckCircle2 size={14} />
                <span>Valider taux & disponibilités</span>
              </button>
            )}
          </div>
        </div>
      </AppPanel>
    </div>
  );
};
