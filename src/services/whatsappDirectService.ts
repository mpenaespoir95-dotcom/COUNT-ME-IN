import type {
  CategoryScheduleRule,
  CurrencyRateInventoryEntry,
  GoldPriceQuoteEntry,
  WhatsAppAutomationSettings,
  WhatsAppAutomationState,
  WhatsAppBusinessCategory,
  WhatsAppCampaignRecord,
  WhatsAppCampaignType,
  WhatsAppCRMRecipient,
  WhatsAppMessageLog,
  WhatsAppMessageTemplate,
  WhatsAppPreviewResponse,
} from '../types/whatsappAutomation';

export interface WhatsAppDirectStatus {
  mode: 'meta_cloud' | 'ultramsg' | 'd7' | 'qr_trial';
  apiConfigured: boolean;
  providerName: 'Meta Cloud API' | 'UltraMsg' | 'D7 Networks' | null;
  d7Configured: boolean;
  d7Originator: string | null;
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected';
  qrDataUrl: string | null;
  connectedPhone: string | null;
  connectedName: string | null;
  lastError: string | null;
  updatedAt: string;
}

export interface WhatsAppSendResult {
  sent: boolean;
  mode: 'meta_cloud' | 'ultramsg' | 'd7' | 'qr_trial';
  phone: string;
  messageId?: string | null;
  filename?: string;
}

export type ScheduleAudienceFilter =
  | 'ALL'
  | 'CLIENTS'
  | 'SUPPLIERS'
  | 'PARTNERS'
  | 'CURRENCY'
  | 'GOLD'
  | 'CUSTOM';

export interface AutoScheduleRecipient {
  reference: string;
  name: string;
  phone: string;
  roles: string[];
}

export interface WhatsAppAutoSchedule {
  enabled: boolean;
  hour: number;
  minute: number;
  timezone: string;
  audienceFilter: ScheduleAudienceFilter;
  messageTemplate: string;
  recipients: AutoScheduleRecipient[];
  customRefs: string[];
  lastRunDate: string | null;
  lastRunAt: string | null;
  lastStatus: 'idle' | 'running' | 'success' | 'partial' | 'error';
  lastSentCount: number;
  lastFailedCount: number;
  lastError: string | null;
  updatedAt: string;
  targetCount: number;
  localDate: string;
  localTime: string;
  nextRunLabel: string;
}

const parseJsonResponse = async <T>(response: Response): Promise<T> => {
  const data = (await response.json().catch(() => null)) as
    | (T & { error?: string; code?: string })
    | null;
  if (!response.ok) {
    const err = new Error(data?.error || `Erreur serveur WhatsApp (${response.status}).`) as Error & {
      code?: string;
      status?: number;
    };
    err.code = data?.code;
    err.status = response.status;
    throw err;
  }
  if (!data) {
    throw new Error('Réponse invalide du serveur WhatsApp.');
  }
  return data;
};

export const WhatsAppDirectService = {
  async getStatus(): Promise<WhatsAppDirectStatus> {
    const response = await fetch('/api/whatsapp/status');
    return parseJsonResponse<WhatsAppDirectStatus>(response);
  },

  async connect(reset = false): Promise<WhatsAppDirectStatus> {
    const response = await fetch('/api/whatsapp/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset }),
    });
    return parseJsonResponse<WhatsAppDirectStatus>(response);
  },

  async disconnect(): Promise<WhatsAppDirectStatus> {
    const response = await fetch('/api/whatsapp/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return parseJsonResponse<WhatsAppDirectStatus>(response);
  },

  async sendText(phone: string, message: string): Promise<WhatsAppSendResult> {
    const response = await fetch('/api/whatsapp/send-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, message }),
    });
    return parseJsonResponse<WhatsAppSendResult>(response);
  },

  async sendDocument(params: {
    phone: string;
    filename: string;
    pdfBase64: string;
    caption?: string;
  }): Promise<WhatsAppSendResult> {
    const response = await fetch('/api/whatsapp/send-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return parseJsonResponse<WhatsAppSendResult>(response);
  },

  async getAutoSchedule(): Promise<WhatsAppAutoSchedule> {
    const response = await fetch('/api/whatsapp/auto-schedule');
    return parseJsonResponse<WhatsAppAutoSchedule>(response);
  },

  async saveAutoSchedule(
    payload: Partial<
      Pick<
        WhatsAppAutoSchedule,
        | 'enabled'
        | 'hour'
        | 'minute'
        | 'timezone'
        | 'audienceFilter'
        | 'messageTemplate'
        | 'recipients'
        | 'customRefs'
      >
    >
  ): Promise<WhatsAppAutoSchedule> {
    const response = await fetch('/api/whatsapp/auto-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return parseJsonResponse<WhatsAppAutoSchedule>(response);
  },

  async syncAutoScheduleContacts(
    recipients: AutoScheduleRecipient[]
  ): Promise<WhatsAppAutoSchedule> {
    const response = await fetch('/api/whatsapp/auto-schedule/sync-contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipients }),
    });
    return parseJsonResponse<WhatsAppAutoSchedule>(response);
  },

  async runAutoScheduleNow(
    override?: Partial<
      Pick<
        WhatsAppAutoSchedule,
        'audienceFilter' | 'messageTemplate' | 'recipients' | 'customRefs'
      >
    >
  ): Promise<WhatsAppAutoSchedule> {
    const response = await fetch('/api/whatsapp/auto-schedule/run-now', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(override || {}),
    });
    return parseJsonResponse<WhatsAppAutoSchedule>(response);
  },

  // --- Cahier des Charges WhatsApp Automation Engine ---
  async getAutomationState(): Promise<WhatsAppAutomationState> {
    const response = await fetch('/api/whatsapp/automation/state');
    return parseJsonResponse<WhatsAppAutomationState>(response);
  },

  async saveAutomationSettings(payload: {
    settings?: Partial<WhatsAppAutomationSettings>;
    categorySchedules?: CategoryScheduleRule[];
    actorName?: string;
    actorRole?: string;
  }): Promise<WhatsAppAutomationState> {
    const response = await fetch('/api/whatsapp/automation/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return parseJsonResponse<WhatsAppAutomationState>(response);
  },

  async saveGoldPriceQuote(payload: {
    quote: Partial<GoldPriceQuoteEntry> & { category: 'OR_BRUT' | 'OR_FONDU' | 'BIJOUX' };
    actorName?: string;
    actorRole?: string;
  }): Promise<WhatsAppAutomationState> {
    const response = await fetch('/api/whatsapp/automation/gold-prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return parseJsonResponse<WhatsAppAutomationState>(response);
  },

  async saveCurrencyRates(payload: {
    rates: CurrencyRateInventoryEntry[];
    actorName?: string;
    actorRole?: string;
    summaryNote?: string;
  }): Promise<WhatsAppAutomationState> {
    const response = await fetch('/api/whatsapp/automation/currency-rates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return parseJsonResponse<WhatsAppAutomationState>(response);
  },

  async syncAutomationRecipients(
    recipients: WhatsAppCRMRecipient[]
  ): Promise<WhatsAppAutomationState> {
    const response = await fetch('/api/whatsapp/automation/sync-recipients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipients }),
    });
    return parseJsonResponse<WhatsAppAutomationState>(response);
  },

  async saveTemplate(payload: {
    template: WhatsAppMessageTemplate;
    actorName?: string;
    actorRole?: string;
  }): Promise<WhatsAppAutomationState> {
    const response = await fetch('/api/whatsapp/automation/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return parseJsonResponse<WhatsAppAutomationState>(response);
  },

  async previewAutomation(payload?: {
    categories?: WhatsAppBusinessCategory[];
    campaignType?: WhatsAppCampaignType;
    ignoreDailyDedupe?: boolean;
  }): Promise<WhatsAppPreviewResponse> {
    const response = await fetch('/api/whatsapp/automation/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
    return parseJsonResponse<WhatsAppPreviewResponse>(response);
  },

  async runAutomationCampaign(payload: {
    type: WhatsAppCampaignType;
    categories?: WhatsAppBusinessCategory[];
    actorName?: string;
    actorRole?: string;
    ignoreDailyDedupe?: boolean;
    notes?: string;
  }): Promise<{
    campaign: WhatsAppCampaignRecord;
    createdLogs: WhatsAppMessageLog[];
    state: WhatsAppAutomationState;
  }> {
    const response = await fetch('/api/whatsapp/automation/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return parseJsonResponse<{
      campaign: WhatsAppCampaignRecord;
      createdLogs: WhatsAppMessageLog[];
      state: WhatsAppAutomationState;
    }>(response);
  },

  async toggleCampaignPause(payload: {
    campaignId: string;
    paused: boolean;
    actorName?: string;
    actorRole?: string;
  }): Promise<WhatsAppAutomationState> {
    const response = await fetch(
      `/api/whatsapp/automation/campaigns/${encodeURIComponent(payload.campaignId)}/pause`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
    return parseJsonResponse<WhatsAppAutomationState>(response);
  },

  async cancelCampaign(payload: {
    campaignId: string;
    actorName?: string;
    actorRole?: string;
  }): Promise<WhatsAppAutomationState> {
    const response = await fetch(
      `/api/whatsapp/automation/campaigns/${encodeURIComponent(payload.campaignId)}/cancel`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
    return parseJsonResponse<WhatsAppAutomationState>(response);
  },

  async retryQueue(payload?: {
    campaignId?: string;
    logId?: string;
  }): Promise<{ retriedCount: number; state: WhatsAppAutomationState }> {
    const response = await fetch('/api/whatsapp/automation/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
    return parseJsonResponse<{ retriedCount: number; state: WhatsAppAutomationState }>(response);
  },

  async clearAdminAlert(): Promise<WhatsAppAutomationState> {
    const response = await fetch('/api/whatsapp/automation/clear-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return parseJsonResponse<WhatsAppAutomationState>(response);
  },
};
