export type WhatsAppBusinessCategory =
  | 'OR_BRUT'
  | 'OR_FONDU'
  | 'BIJOUX'
  | 'FOURNISSEUR_DEVISES'
  | 'CLIENT_DEVISES';

export const WHATSAPP_CATEGORY_META: Record<
  WhatsAppBusinessCategory,
  {
    id: WhatsAppBusinessCategory;
    label: string;
    shortLabel: string;
    contactType: 'Fournisseur' | 'Client';
    defaultFrequency: 'daily' | 'weekly';
    priceSourceDescription: string;
  }
> = {
  OR_BRUT: {
    id: 'OR_BRUT',
    label: 'Fournisseur d’or brut',
    shortLabel: 'Or brut',
    contactType: 'Fournisseur',
    defaultFrequency: 'weekly',
    priceSourceDescription: 'Prix saisi manuellement et validé',
  },
  OR_FONDU: {
    id: 'OR_FONDU',
    label: 'Fournisseur d’or fondu',
    shortLabel: 'Or fondu',
    contactType: 'Fournisseur',
    defaultFrequency: 'daily',
    priceSourceDescription: 'Prix de base du logiciel (validé)',
  },
  BIJOUX: {
    id: 'BIJOUX',
    label: 'Fournisseur de bijoux',
    shortLabel: 'Bijoux',
    contactType: 'Fournisseur',
    defaultFrequency: 'weekly',
    priceSourceDescription: 'Prix saisi manuellement et validé',
  },
  FOURNISSEUR_DEVISES: {
    id: 'FOURNISSEUR_DEVISES',
    label: 'Fournisseur de devises',
    shortLabel: 'Fourn. Devises',
    contactType: 'Fournisseur',
    defaultFrequency: 'daily',
    priceSourceDescription: 'Prix d’achat configuré et validé',
  },
  CLIENT_DEVISES: {
    id: 'CLIENT_DEVISES',
    label: 'Client de devises',
    shortLabel: 'Client Devises',
    contactType: 'Client',
    defaultFrequency: 'daily',
    priceSourceDescription: 'Prix de vente et stock disponible validés',
  },
};

export const ALL_WHATSAPP_CATEGORIES: WhatsAppBusinessCategory[] = [
  'OR_BRUT',
  'OR_FONDU',
  'BIJOUX',
  'FOURNISSEUR_DEVISES',
  'CLIENT_DEVISES',
];

export type PriceApprovalStatus = 'draft' | 'validated' | 'expired';

export interface GoldPriceQuoteEntry {
  category: 'OR_BRUT' | 'OR_FONDU' | 'BIJOUX';
  pricePerGramXaf: number;
  unit: string; // 'gramme'
  currency: string; // 'FCFA'
  source: 'manual' | 'software_base';
  status: PriceApprovalStatus;
  validFrom: string; // YYYY-MM-DD
  validUntil: string; // YYYY-MM-DDTHH:mm
  updatedAt: string;
  updatedBy: string;
  validatedAt?: string;
  validatedBy?: string;
}

export interface CurrencyRateInventoryEntry {
  code: string; // USD, EUR, AED, CNY, XOF...
  buyRateXaf: number;
  sellRateXaf: number;
  physicalStock: number;
  reservedStock: number;
  availableStock: number; // physicalStock - reservedStock (>= 0)
  minAnnounceStock: number;
  status: PriceApprovalStatus;
  validUntil: string;
  updatedAt: string;
  updatedBy: string;
  validatedAt?: string;
  validatedBy?: string;
}

export interface CategoryScheduleRule {
  category: WhatsAppBusinessCategory;
  frequency: 'daily' | 'weekly';
  weekday: number; // 0 = Dimanche, 1 = Lundi, ..., 6 = Samedi
  enabled: boolean;
}

export interface WhatsAppMessageTemplate {
  id: string;
  category: WhatsAppBusinessCategory;
  title: string;
  language: 'fr' | 'en';
  body: string;
  metaTemplateName?: string;
  updatedAt: string;
  updatedBy: string;
}

export interface WhatsAppCRMRecipient {
  reference: string;
  name: string;
  phone: string;
  roles: string[];
  contactType?: 'Fournisseur' | 'Client' | 'Partenaire';
  whatsappCategories?: WhatsAppBusinessCategory[];
  preferredCurrency?: string;
  language?: 'fr' | 'en';
  whatsappStatus?: 'active' | 'suspended';
  consentGranted?: boolean;
  consentDate?: string;
  consentProof?: string;
  broadcastEnabled?: boolean;
  unsubscribed?: boolean;
  unsubscribedAt?: string;
  archived?: boolean;
}

export type WhatsAppMessageLogStatus =
  | 'pending'
  | 'sending'
  | 'accepted'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'cancelled'
  | 'blocked';

export type WhatsAppCampaignType = 'scheduled_09h' | 'exceptional' | 'manual';

export interface WhatsAppCampaignRecord {
  id: string;
  reference: string;
  type: WhatsAppCampaignType;
  status: 'scheduled' | 'running' | 'completed' | 'partial' | 'paused' | 'cancelled' | 'failed';
  triggeredAt: string;
  finishedAt?: string;
  scheduledDate: string;
  timezone: string;
  categories: WhatsAppBusinessCategory[];
  totalTargeted: number;
  eligibleCount: number;
  blockedCount: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  createdBy: string;
  notes?: string;
}

export interface WhatsAppMessageLog {
  id: string;
  campaignId: string;
  campaignRef: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  contactRef: string;
  contactName: string;
  phone: string;
  category: WhatsAppBusinessCategory | 'GENERAL';
  messageType: WhatsAppCampaignType;
  currencyCode?: string;
  priceSummary: string;
  renderedText: string;
  status: WhatsAppMessageLogStatus;
  whatsappMessageId?: string | null;
  errorReason?: string | null;
  retryCount: number;
  nextRetryAt?: string | null;
}

export interface WhatsAppAuditLog {
  id: string;
  timestamp: string;
  actorName: string;
  actorRole: string;
  action: string;
  entityType:
    | 'gold_price'
    | 'currency_rate'
    | 'contact'
    | 'template'
    | 'campaign'
    | 'automation'
    | 'queue';
  summary: string;
}

export interface WhatsAppPreviewItem {
  id: string;
  contactRef: string;
  contactName: string;
  phone: string;
  category: WhatsAppBusinessCategory;
  currencyCode?: string;
  priceSummary: string;
  renderedText: string;
  eligible: boolean;
  blockReasons: string[];
  idempotencyKey: string;
  alreadySentToday: boolean;
}

export interface WhatsAppPreviewResponse {
  localDate: string;
  localTime: string;
  localWeekday: number;
  scheduledCategoriesToday: WhatsAppBusinessCategory[];
  eligibleCount: number;
  blockedCount: number;
  items: WhatsAppPreviewItem[];
}

export interface WhatsAppAutomationSettings {
  enabled: boolean;
  paused: boolean;
  hour: number;
  minute: number;
  timezone: string;
  currencyClientMode: 'grouped' | 'per_currency';
  autoRetryEnabled: boolean;
  maxRetries: number;
  retryDelayMinutes: number;
  adminAlertMessage: string | null;
}

export interface WhatsAppAutomationState {
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
  localDate: string;
  localTime: string;
  localWeekday: number;
  nextRunLabel: string;
  pendingQueueCount: number;
}

export const DEFAULT_SECTION6_TEMPLATES: Omit<WhatsAppMessageTemplate, 'updatedAt' | 'updatedBy'>[] = [
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
  },
];

export const inferCategoriesFromRoles = (roles: string[]): WhatsAppBusinessCategory[] => {
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

export const WEEKDAY_LABELS_FR: Array<{ value: number; label: string }> = [
  { value: 1, label: 'Lundi' },
  { value: 2, label: 'Mardi' },
  { value: 3, label: 'Mercredi' },
  { value: 4, label: 'Jeudi' },
  { value: 5, label: 'Vendredi' },
  { value: 6, label: 'Samedi' },
  { value: 0, label: 'Dimanche' },
];
