import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  CategoryScheduleRule,
  CurrencyRateInventoryEntry,
  GoldPriceQuoteEntry,
  PriceApprovalStatus,
  WhatsAppAuditLog,
  WhatsAppAutomationSettings,
  WhatsAppAutomationState,
  WhatsAppBusinessCategory,
  WhatsAppCampaignRecord,
  WhatsAppCampaignType,
  WhatsAppCRMRecipient,
  WhatsAppMessageLog,
  WhatsAppMessageTemplate,
  WhatsAppPreviewItem,
  WhatsAppPreviewResponse,
} from '../src/types/whatsappAutomation.ts';

const AUTOMATION_FILE = path.resolve(process.cwd(), '.whatsapp-automation.json');

export const ALL_CATEGORIES: WhatsAppBusinessCategory[] = [
  'OR_BRUT',
  'OR_FONDU',
  'BIJOUX',
  'FOURNISSEUR_DEVISES',
  'CLIENT_DEVISES',
];

const DEFAULT_TEMPLATES_SEED: WhatsAppMessageTemplate[] = [
  {
    id: 'tpl-or-brut',
    category: 'OR_BRUT',
    title: 'Modèle 1 – Fournisseur d’or brut',
    language: 'fr',
    metaTemplateName: 'cams_offre_achat_or_brut',
    body: `CAMS GOLD
OFFRE D’ACHAT – OR BRUT

Bonjour {nom},
Voici nos prix d’achat pour cette semaine :
Prix du gramme : {prix} FCFA

Nous restons disponibles pour vos transactions.
Cordialement,
CAMS GOLD.`,
    updatedAt: new Date().toISOString(),
    updatedBy: 'Système',
  },
  {
    id: 'tpl-or-fondu',
    category: 'OR_FONDU',
    title: 'Modèle 2 – Fournisseur d’or fondu',
    language: 'fr',
    metaTemplateName: 'cams_cours_jour_or_fondu',
    body: `CAMS GOLD
COURS DU JOUR – OR FONDU

Bonjour {nom},
Notre prix d’achat du jour est fixé à :
{prix} FCFA / gramme.

Merci pour votre confiance.
CAMS GOLD.`,
    updatedAt: new Date().toISOString(),
    updatedBy: 'Système',
  },
  {
    id: 'tpl-bijoux',
    category: 'BIJOUX',
    title: 'Modèle 3 – Fournisseur de bijoux',
    language: 'fr',
    metaTemplateName: 'cams_offre_achat_bijoux',
    body: `CAMS GOLD
OFFRE D’ACHAT – BIJOUX

Bonjour {nom},
Voici notre prix d’achat hebdomadaire :
{prix} FCFA / gramme.

Nous restons à votre disposition.
CAMS GOLD.`,
    updatedAt: new Date().toISOString(),
    updatedBy: 'Système',
  },
  {
    id: 'tpl-fourn-devises',
    category: 'FOURNISSEUR_DEVISES',
    title: 'Modèle 4 – Fournisseur de devises',
    language: 'fr',
    metaTemplateName: 'cams_cours_achat_devises',
    body: `CAMS GOLD
COURS D’ACHAT DU JOUR

Bonjour {nom},
Devise : {devise}
Notre prix d’achat :
1 {devise} = {prix_achat} FCFA.

Cordialement,
CAMS GOLD.`,
    updatedAt: new Date().toISOString(),
    updatedBy: 'Système',
  },
  {
    id: 'tpl-client-devises',
    category: 'CLIENT_DEVISES',
    title: 'Modèle 5 – Client de devises',
    language: 'fr',
    metaTemplateName: 'cams_cours_vente_devises',
    body: `CAMS GOLD
COURS DE VENTE DU JOUR

Bonjour {nom},
Devise : {devise}
Prix de vente : 1 {devise} = {prix_vente} FCFA.
Disponibilité : {stock_disponible} {devise}.

Pour toute transaction, veuillez nous contacter.
CAMS GOLD.`,
    updatedAt: new Date().toISOString(),
    updatedBy: 'Système',
  },
];

export const DEFAULT_AUTOMATION_SETTINGS: WhatsAppAutomationSettings = {
  enabled: false,
  paused: false,
  hour: 9,
  minute: 0,
  timezone: 'Africa/Brazzaville',
  currencyClientMode: 'per_currency',
  autoRetryEnabled: true,
  maxRetries: 3,
  retryDelayMinutes: 10,
  adminAlertMessage: null,
};

export const DEFAULT_CATEGORY_SCHEDULES: CategoryScheduleRule[] = [
  { category: 'OR_BRUT', frequency: 'weekly', weekday: 1, enabled: true },
  { category: 'OR_FONDU', frequency: 'daily', weekday: 1, enabled: true },
  { category: 'BIJOUX', frequency: 'weekly', weekday: 1, enabled: true },
  { category: 'FOURNISSEUR_DEVISES', frequency: 'daily', weekday: 1, enabled: true },
  { category: 'CLIENT_DEVISES', frequency: 'daily', weekday: 1, enabled: true },
];

const createDefaultGoldPrices = (): Record<'OR_BRUT' | 'OR_FONDU' | 'BIJOUX', GoldPriceQuoteEntry> => {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const untilWeek = new Date(now.getTime() + 7 * 86400_000).toISOString().slice(0, 16);
  const untilToday = `${todayStr}T23:59`;
  return {
    OR_BRUT: {
      category: 'OR_BRUT',
      pricePerGramXaf: 0,
      unit: 'gramme',
      currency: 'FCFA',
      source: 'manual',
      status: 'draft',
      validFrom: todayStr,
      validUntil: untilWeek,
      updatedAt: now.toISOString(),
      updatedBy: 'Système',
    },
    OR_FONDU: {
      category: 'OR_FONDU',
      pricePerGramXaf: 0,
      unit: 'gramme',
      currency: 'FCFA',
      source: 'software_base',
      status: 'draft',
      validFrom: todayStr,
      validUntil: untilToday,
      updatedAt: now.toISOString(),
      updatedBy: 'Système',
    },
    BIJOUX: {
      category: 'BIJOUX',
      pricePerGramXaf: 0,
      unit: 'gramme',
      currency: 'FCFA',
      source: 'manual',
      status: 'draft',
      validFrom: todayStr,
      validUntil: untilWeek,
      updatedAt: now.toISOString(),
      updatedBy: 'Système',
    },
  };
};

const createDefaultCurrencyRates = (): CurrencyRateInventoryEntry[] => {
  const now = new Date();
  const validUntil = `${now.toISOString().slice(0, 10)}T23:59`;
  return ['USD', 'EUR', 'AED'].map((code) => ({
    code,
    buyRateXaf: 0,
    sellRateXaf: 0,
    physicalStock: 0,
    reservedStock: 0,
    availableStock: 0,
    minAnnounceStock: 100,
    status: 'draft' as PriceApprovalStatus,
    validUntil,
    updatedAt: now.toISOString(),
    updatedBy: 'Système',
  }));
};

export interface PersistedAutomationData {
  settings: WhatsAppAutomationSettings;
  categorySchedules: CategoryScheduleRule[];
  goldPrices: Record<'OR_BRUT' | 'OR_FONDU' | 'BIJOUX', GoldPriceQuoteEntry>;
  currencyRates: CurrencyRateInventoryEntry[];
  templates: WhatsAppMessageTemplate[];
  recipients: WhatsAppCRMRecipient[];
  campaigns: WhatsAppCampaignRecord[];
  logs: WhatsAppMessageLog[];
  auditLogs: WhatsAppAuditLog[];
  lastRunDate: string | null;
  lastRunAt: string | null;
  lastStatus: 'idle' | 'running' | 'success' | 'partial' | 'error';
  lastError: string | null;
  updatedAt: string;
}

const createDefaultData = (): PersistedAutomationData => ({
  settings: { ...DEFAULT_AUTOMATION_SETTINGS },
  categorySchedules: DEFAULT_CATEGORY_SCHEDULES.map((r) => ({ ...r })),
  goldPrices: createDefaultGoldPrices(),
  currencyRates: createDefaultCurrencyRates(),
  templates: DEFAULT_TEMPLATES_SEED.map((t) => ({ ...t })),
  recipients: [],
  campaigns: [],
  logs: [],
  auditLogs: [],
  lastRunDate: null,
  lastRunAt: null,
  lastStatus: 'idle',
  lastError: null,
  updatedAt: new Date().toISOString(),
});

export const normalizeDigits = (rawPhone: string): string => {
  let digits = (rawPhone || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  if (digits.length === 9 && digits.startsWith('0')) {
    digits = `242${digits}`;
  }
  return digits;
};

export const inferRecipientCategories = (roles: string[]): WhatsAppBusinessCategory[] => {
  const lower = (roles || []).map((r) => r.toLowerCase());
  const cats = new Set<WhatsAppBusinessCategory>();
  for (const r of lower) {
    if (r.includes('fournisseur') && r.includes('brut')) cats.add('OR_BRUT');
    if (r.includes('fournisseur') && r.includes('fondu')) cats.add('OR_FONDU');
    if (r.includes('fournisseur') && r.includes('bijou')) cats.add('BIJOUX');
    if (r.includes('fournisseur') && (r.includes('devise') || r.includes('change'))) {
      cats.add('FOURNISSEUR_DEVISES');
    }
    if (r.includes('client') && (r.includes('devise') || r.includes('change'))) {
      cats.add('CLIENT_DEVISES');
    }
  }
  return Array.from(cats);
};

export const getBrazzavilleClock = (timeZone = 'Africa/Brazzaville') => {
  const tz = timeZone || 'Africa/Brazzaville';
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const pick = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const rawHour = Number(pick('hour') || '0');
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = Number(pick('minute') || '0');
  const dateKey = `${pick('year')}-${pick('month')}-${pick('day')}`;
  const weekdayToken = pick('weekday').toLowerCase().slice(0, 3);
  const weekdayMap: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  const weekday = weekdayMap[weekdayToken] ?? new Date().getDay();
  return {
    dateKey,
    hour,
    minute,
    timeLabel: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    weekday,
  };
};

export const formatFrNumber = (val: number): string =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })
    .format(Number.isFinite(val) ? val : 0)
    .replace(/\u202F/g, ' ');

export const loadAutomationData = (): PersistedAutomationData => {
  const base = createDefaultData();
  try {
    if (!fs.existsSync(AUTOMATION_FILE)) {
      return base;
    }
    const raw = fs.readFileSync(AUTOMATION_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<PersistedAutomationData>;
    const mergedTemplates = DEFAULT_TEMPLATES_SEED.map((defTpl) => {
      const savedTpl = (parsed.templates || []).find((t) => t.category === defTpl.category);
      return savedTpl ? { ...defTpl, ...savedTpl } : defTpl;
    });
    const mergedSchedules = DEFAULT_CATEGORY_SCHEDULES.map((defRule) => {
      const savedRule = (parsed.categorySchedules || []).find(
        (r) => r.category === defRule.category
      );
      return savedRule ? { ...defRule, ...savedRule } : defRule;
    });
    return {
      ...base,
      ...parsed,
      settings: { ...DEFAULT_AUTOMATION_SETTINGS, ...(parsed.settings || {}) },
      categorySchedules: mergedSchedules,
      goldPrices: {
        OR_BRUT: { ...base.goldPrices.OR_BRUT, ...(parsed.goldPrices?.OR_BRUT || {}) },
        OR_FONDU: { ...base.goldPrices.OR_FONDU, ...(parsed.goldPrices?.OR_FONDU || {}) },
        BIJOUX: { ...base.goldPrices.BIJOUX, ...(parsed.goldPrices?.BIJOUX || {}) },
      },
      currencyRates: Array.isArray(parsed.currencyRates) && parsed.currencyRates.length > 0
        ? parsed.currencyRates.map((r) => ({
            ...r,
            availableStock: Math.max(0, (Number(r.physicalStock) || 0) - (Number(r.reservedStock) || 0)),
          }))
        : base.currencyRates,
      templates: mergedTemplates,
      recipients: Array.isArray(parsed.recipients) ? parsed.recipients : [],
      campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns : [],
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
      auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
    };
  } catch {
    return base;
  }
};

export const saveAutomationData = (data: PersistedAutomationData): PersistedAutomationData => {
  const next: PersistedAutomationData = {
    ...data,
    campaigns: data.campaigns.slice(0, 120),
    logs: data.logs.slice(0, 1200),
    auditLogs: data.auditLogs.slice(0, 500),
    updatedAt: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(AUTOMATION_FILE, JSON.stringify(next, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save .whatsapp-automation.json:', err);
  }
  return next;
};

export const appendAuditLog = (
  data: PersistedAutomationData,
  entry: Omit<WhatsAppAuditLog, 'id' | 'timestamp'>
): PersistedAutomationData => {
  const audit: WhatsAppAuditLog = {
    id: `aud-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  return {
    ...data,
    auditLogs: [audit, ...data.auditLogs],
  };
};

export const isPriceExpired = (validUntil?: string): boolean => {
  if (!validUntil) return false;
  const ts = Date.parse(validUntil);
  if (Number.isNaN(ts)) return false;
  return ts < Date.now();
};

export const getEffectiveGoldStatus = (entry: GoldPriceQuoteEntry): PriceApprovalStatus => {
  if (entry.status === 'validated' && isPriceExpired(entry.validUntil)) {
    return 'expired';
  }
  return entry.status;
};

export const getEffectiveCurrencyStatus = (
  entry: CurrencyRateInventoryEntry
): PriceApprovalStatus => {
  if (entry.status === 'validated' && isPriceExpired(entry.validUntil)) {
    return 'expired';
  }
  return entry.status;
};

export const getScheduledCategoriesForWeekday = (
  schedules: CategoryScheduleRule[],
  weekday: number
): WhatsAppBusinessCategory[] =>
  schedules
    .filter((rule) => {
      if (!rule.enabled) return false;
      if (rule.frequency === 'daily') return true;
      return rule.weekday === weekday;
    })
    .map((rule) => rule.category);

const renderTemplate = (body: string, vars: Record<string, string>): string => {
  let out = body;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, 'gi'), v);
  }
  return out;
};

export const buildAutomationPreview = (
  data: PersistedAutomationData,
  options?: {
    categories?: WhatsAppBusinessCategory[];
    campaignType?: WhatsAppCampaignType;
    ignoreDailyDedupe?: boolean;
  }
): WhatsAppPreviewResponse => {
  const clock = getBrazzavilleClock(data.settings.timezone);
  const scheduledToday = getScheduledCategoriesForWeekday(
    data.categorySchedules,
    clock.weekday
  );
  const targetCategories =
    options?.categories && options.categories.length > 0
      ? options.categories
      : scheduledToday;

  const campaignType = options?.campaignType || 'scheduled_09h';
  const items: WhatsAppPreviewItem[] = [];

  const getRecipientBlockReasons = (r: WhatsAppCRMRecipient): string[] => {
    const reasons: string[] = [];
    if (r.archived) reasons.push('Contact archivé');
    if (r.unsubscribed) reasons.push('Contact désabonné (liste suppression)');
    if (r.whatsappStatus === 'suspended') reasons.push('Contact suspendu');
    if (r.consentGranted !== true) reasons.push('Consentement WhatsApp non enregistré');
    if (r.broadcastEnabled === false) reasons.push('Préférence de diffusion désactivée');
    const digits = normalizeDigits(r.phone || '');
    if (!digits || digits.length < 8) reasons.push('Numéro WhatsApp invalide ou absent');
    return reasons;
  };

  const hasSuccessfulLogForKey = (idempotencyKey: string): boolean => {
    if (options?.ignoreDailyDedupe) return false;
    return data.logs.some(
      (l) =>
        l.idempotencyKey === idempotencyKey &&
        ['pending', 'sending', 'accepted', 'delivered', 'read'].includes(l.status)
    );
  };

  for (const category of targetCategories) {
    const tpl = data.templates.find((t) => t.category === category);
    const tplBody = tpl?.body || '';

    const matchingRecipients = data.recipients.filter((r) => {
      const explicitCats =
        Array.isArray(r.whatsappCategories) && r.whatsappCategories.length > 0
          ? r.whatsappCategories
          : inferRecipientCategories(r.roles || []);
      return explicitCats.includes(category);
    });

    for (const r of matchingRecipients) {
      const contactBlockReasons = getRecipientBlockReasons(r);

      if (category === 'OR_BRUT' || category === 'OR_FONDU' || category === 'BIJOUX') {
        const quote = data.goldPrices[category];
        const effStatus = getEffectiveGoldStatus(quote);
        const priceReasons: string[] = [];
        if (!quote || quote.pricePerGramXaf <= 0) {
          priceReasons.push('Tarif absent');
        } else if (effStatus === 'expired') {
          priceReasons.push('Tarif expiré');
        } else if (effStatus !== 'validated') {
          priceReasons.push('Tarif en brouillon (non validé)');
        }

        const priceText = formatFrNumber(quote?.pricePerGramXaf || 0);
        const rendered = renderTemplate(tplBody, {
          nom: r.name,
          prix: priceText,
        });
        const idempotencyKey = `${campaignType}_${clock.dateKey}_${r.reference}_${category}`;
        const alreadySentToday = hasSuccessfulLogForKey(idempotencyKey);
        const allReasons = [
          ...contactBlockReasons,
          ...priceReasons,
          ...(alreadySentToday ? ['Déjà envoyé aujourd’hui (anti-doublon)'] : []),
        ];

        items.push({
          id: `${r.reference}-${category}`,
          contactRef: r.reference,
          contactName: r.name,
          phone: r.phone,
          category,
          priceSummary: `${priceText} FCFA / ${quote?.unit || 'g'}`,
          renderedText: rendered,
          eligible: allReasons.length === 0,
          blockReasons: allReasons,
          idempotencyKey,
          alreadySentToday,
        });
      } else if (category === 'FOURNISSEUR_DEVISES') {
        const pref = (r.preferredCurrency || '').trim().toUpperCase();
        const candidateRates = data.currencyRates.filter((cr) =>
          pref && pref !== 'ALL' ? cr.code.toUpperCase() === pref : true
        );
        const ratesToCheck =
          candidateRates.length > 0 ? candidateRates : data.currencyRates;

        const validRates = ratesToCheck.filter((cr) => {
          const st = getEffectiveCurrencyStatus(cr);
          return st === 'validated' && cr.buyRateXaf > 0;
        });

        if (validRates.length === 0) {
          const reason =
            ratesToCheck.length === 0
              ? 'Aucune devise configurée'
              : 'Tarif d’achat devise absent, non validé ou expiré';
          const fallbackCode = pref || ratesToCheck[0]?.code || 'USD';
          const idempotencyKey = `${campaignType}_${clock.dateKey}_${r.reference}_${category}`;
          items.push({
            id: `${r.reference}-${category}`,
            contactRef: r.reference,
            contactName: r.name,
            phone: r.phone,
            category,
            currencyCode: fallbackCode,
            priceSummary: `1 ${fallbackCode} = 0 FCFA`,
            renderedText: renderTemplate(tplBody, {
              nom: r.name,
              devise: fallbackCode,
              prix_achat: '0',
            }),
            eligible: false,
            blockReasons: [...contactBlockReasons, reason],
            idempotencyKey,
            alreadySentToday: false,
          });
          continue;
        }

        for (const cr of validRates) {
          const buyStr = formatFrNumber(cr.buyRateXaf);
          const rendered = renderTemplate(tplBody, {
            nom: r.name,
            devise: cr.code,
            prix_achat: buyStr,
          });
          const idempotencyKey = `${campaignType}_${clock.dateKey}_${r.reference}_${category}_${cr.code}`;
          const alreadySentToday = hasSuccessfulLogForKey(idempotencyKey);
          const allReasons = [
            ...contactBlockReasons,
            ...(alreadySentToday ? ['Déjà envoyé aujourd’hui (anti-doublon)'] : []),
          ];

          items.push({
            id: `${r.reference}-${category}-${cr.code}`,
            contactRef: r.reference,
            contactName: r.name,
            phone: r.phone,
            category,
            currencyCode: cr.code,
            priceSummary: `Achat 1 ${cr.code} = ${buyStr} FCFA`,
            renderedText: rendered,
            eligible: allReasons.length === 0,
            blockReasons: allReasons,
            idempotencyKey,
            alreadySentToday,
          });
        }
      } else if (category === 'CLIENT_DEVISES') {
        const pref = (r.preferredCurrency || '').trim().toUpperCase();
        const candidateRates = data.currencyRates.filter((cr) =>
          pref && pref !== 'ALL' ? cr.code.toUpperCase() === pref : true
        );
        const ratesToCheck =
          candidateRates.length > 0 ? candidateRates : data.currencyRates;

        const eligibleRates = ratesToCheck.filter((cr) => {
          const st = getEffectiveCurrencyStatus(cr);
          const avail = Math.max(0, cr.physicalStock - cr.reservedStock);
          const minStock = Math.max(0, cr.minAnnounceStock || 0);
          return st === 'validated' && cr.sellRateXaf > 0 && avail > 0 && avail >= minStock;
        });

        if (eligibleRates.length === 0) {
          const anyValidatedPrice = ratesToCheck.some(
            (cr) => getEffectiveCurrencyStatus(cr) === 'validated' && cr.sellRateXaf > 0
          );
          const stockReason = anyValidatedPrice
            ? 'Stock disponible nul ou inférieur au seuil minimum'
            : 'Tarif de vente devise absent, non validé ou expiré';
          const fallbackCode = pref || ratesToCheck[0]?.code || 'USD';
          const idempotencyKey = `${campaignType}_${clock.dateKey}_${r.reference}_${category}`;
          items.push({
            id: `${r.reference}-${category}`,
            contactRef: r.reference,
            contactName: r.name,
            phone: r.phone,
            category,
            currencyCode: fallbackCode,
            priceSummary: 'Stock insuffisant / Tarif non validé',
            renderedText: renderTemplate(tplBody, {
              nom: r.name,
              devise: fallbackCode,
              prix_vente: '0',
              stock_disponible: '0',
            }),
            eligible: false,
            blockReasons: [...contactBlockReasons, stockReason],
            idempotencyKey,
            alreadySentToday: false,
          });
          continue;
        }

        if (data.settings.currencyClientMode === 'grouped' && eligibleRates.length > 1) {
          const lines = eligibleRates.map((cr) => {
            const avail = Math.max(0, cr.physicalStock - cr.reservedStock);
            return `• ${cr.code} : 1 ${cr.code} = ${formatFrNumber(cr.sellRateXaf)} FCFA (Dispo : ${formatFrNumber(avail)} ${cr.code})`;
          });
          const rendered = `CAMS GOLD\nCOURS DE VENTE DU JOUR\n\nBonjour ${r.name},\nVoici nos devises disponibles aujourd’hui :\n${lines.join('\n')}\n\nPour toute transaction, veuillez nous contacter.\nCAMS GOLD.`;
          const idempotencyKey = `${campaignType}_${clock.dateKey}_${r.reference}_${category}_GROUPED`;
          const alreadySentToday = hasSuccessfulLogForKey(idempotencyKey);
          const allReasons = [
            ...contactBlockReasons,
            ...(alreadySentToday ? ['Déjà envoyé aujourd’hui (anti-doublon)'] : []),
          ];

          items.push({
            id: `${r.reference}-${category}-GROUPED`,
            contactRef: r.reference,
            contactName: r.name,
            phone: r.phone,
            category,
            currencyCode: eligibleRates.map((x) => x.code).join(','),
            priceSummary: eligibleRates
              .map((x) => `${x.code}: ${formatFrNumber(x.sellRateXaf)} F`)
              .join(' · '),
            renderedText: rendered,
            eligible: allReasons.length === 0,
            blockReasons: allReasons,
            idempotencyKey,
            alreadySentToday,
          });
        } else {
          for (const cr of eligibleRates) {
            const avail = Math.max(0, cr.physicalStock - cr.reservedStock);
            const sellStr = formatFrNumber(cr.sellRateXaf);
            const availStr = formatFrNumber(avail);
            const rendered = renderTemplate(tplBody, {
              nom: r.name,
              devise: cr.code,
              prix_vente: sellStr,
              stock_disponible: availStr,
            });
            const idempotencyKey = `${campaignType}_${clock.dateKey}_${r.reference}_${category}_${cr.code}`;
            const alreadySentToday = hasSuccessfulLogForKey(idempotencyKey);
            const allReasons = [
              ...contactBlockReasons,
              ...(alreadySentToday ? ['Déjà envoyé aujourd’hui (anti-doublon)'] : []),
            ];

            items.push({
              id: `${r.reference}-${category}-${cr.code}`,
              contactRef: r.reference,
              contactName: r.name,
              phone: r.phone,
              category,
              currencyCode: cr.code,
              priceSummary: `Vente 1 ${cr.code} = ${sellStr} FCFA · Dispo ${availStr}`,
              renderedText: rendered,
              eligible: allReasons.length === 0,
              blockReasons: allReasons,
              idempotencyKey,
              alreadySentToday,
            });
          }
        }
      }
    }
  }

  const eligibleCount = items.filter((i) => i.eligible).length;
  const blockedCount = items.filter((i) => !i.eligible).length;

  return {
    localDate: clock.dateKey,
    localTime: clock.timeLabel,
    localWeekday: clock.weekday,
    scheduledCategoriesToday: scheduledToday,
    eligibleCount,
    blockedCount,
    items,
  };
};

export const buildAutomationStatePayload = (
  data: PersistedAutomationData
): WhatsAppAutomationState => {
  const clock = getBrazzavilleClock(data.settings.timezone);
  const hh = String(data.settings.hour).padStart(2, '0');
  const mm = String(data.settings.minute).padStart(2, '0');
  const alreadyRanToday = data.lastRunDate === clock.dateKey;
  const currentMins = clock.hour * 60 + clock.minute;
  const targetMins = data.settings.hour * 60 + data.settings.minute;

  let nextRunLabel = 'Désactivé';
  if (data.settings.paused) {
    nextRunLabel = 'Suspendu (en pause)';
  } else if (data.settings.enabled) {
    if (!alreadyRanToday && currentMins <= targetMins + 15) {
      nextRunLabel = `Aujourd’hui à ${hh}h${mm}`;
    } else {
      nextRunLabel = `Demain à ${hh}h${mm}`;
    }
  }

  const goldPricesSynced: Record<'OR_BRUT' | 'OR_FONDU' | 'BIJOUX', GoldPriceQuoteEntry> = {
    OR_BRUT: {
      ...data.goldPrices.OR_BRUT,
      status: getEffectiveGoldStatus(data.goldPrices.OR_BRUT),
    },
    OR_FONDU: {
      ...data.goldPrices.OR_FONDU,
      status: getEffectiveGoldStatus(data.goldPrices.OR_FONDU),
    },
    BIJOUX: {
      ...data.goldPrices.BIJOUX,
      status: getEffectiveGoldStatus(data.goldPrices.BIJOUX),
    },
  };

  const currencyRatesSynced = data.currencyRates.map((cr) => ({
    ...cr,
    availableStock: Math.max(0, cr.physicalStock - cr.reservedStock),
    status: getEffectiveCurrencyStatus(cr),
  }));

  const pendingQueueCount = data.logs.filter(
    (l) => l.status === 'pending' || (l.status === 'failed' && l.nextRetryAt)
  ).length;

  return {
    ...data,
    goldPrices: goldPricesSynced,
    currencyRates: currencyRatesSynced,
    localDate: clock.dateKey,
    localTime: clock.timeLabel,
    localWeekday: clock.weekday,
    nextRunLabel,
    pendingQueueCount,
  };
};
