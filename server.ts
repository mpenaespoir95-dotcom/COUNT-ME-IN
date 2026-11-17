import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Request, Response } from 'express';
import pino from 'pino';
import QRCode from 'qrcode';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import type { WASocket } from '@whiskeysockets/baileys';
import type {
  CurrencyRateInventoryEntry,
  GoldPriceQuoteEntry,
  WhatsAppAutomationSettings,
  WhatsAppBusinessCategory,
  WhatsAppCampaignRecord,
  WhatsAppCampaignType,
  WhatsAppCRMRecipient,
  WhatsAppMessageLog,
  WhatsAppMessageTemplate,
  CategoryScheduleRule,
} from './src/types/whatsappAutomation.ts';
import {
  appendAuditLog,
  buildAutomationPreview,
  buildAutomationStatePayload,
  getBrazzavilleClock,
  getScheduledCategoriesForWeekday,
  inferRecipientCategories,
  loadAutomationData,
  normalizeDigits,
  saveAutomationData,
} from './server/whatsappAutomation.ts';

const envFilePath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envFilePath)) {
  process.loadEnvFile(envFilePath);
}

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';
const AUTH_DIR = path.resolve(process.cwd(), '.whatsapp-auth');
const SCHEDULE_FILE = path.resolve(process.cwd(), '.whatsapp-schedule.json');
const D7_SEND_URL = 'https://api.d7networks.com/whatsapp/v2/send';
const ULTRAMSG_API_URL = 'https://api.ultramsg.com';

type ConnectionStatus = 'disconnected' | 'connecting' | 'qr_ready' | 'connected';

interface UltraMsgResponse {
  id?: string | number;
  messageId?: string | number;
  sent?: boolean | string;
  error?: string | { message?: string };
  message?: string;
  detail?: string;
}

interface WhatsAppSessionState {
  status: ConnectionStatus;
  qrDataUrl: string | null;
  connectedPhone: string | null;
  connectedName: string | null;
  lastError: string | null;
  updatedAt: string;
}

interface TempMediaEntry {
  buffer: Buffer;
  filename: string;
  expiresAt: number;
}

const tempMediaStore = new Map<string, TempMediaEntry>();

const sessionState: WhatsAppSessionState = {
  status: 'disconnected',
  qrDataUrl: null,
  connectedPhone: null,
  connectedName: null,
  lastError: null,
  updatedAt: new Date().toISOString(),
};

let activeSocket: WASocket | null = null;
let isConnecting = false;
let manualDisconnect = false;
let consecutiveFailures = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const getMetaCloudConfig = () => {
  const token = (process.env.WHATSAPP_CLOUD_API_TOKEN || '').trim();
  const phoneNumberId = (process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID || '').trim();
  const apiVersion = (process.env.WHATSAPP_CLOUD_API_VERSION || 'v21.0').trim() || 'v21.0';
  const verifyToken = (process.env.WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN || '').trim();
  return {
    configured: Boolean(token && phoneNumberId),
    token,
    phoneNumberId,
    apiVersion,
    verifyToken,
  };
};

const getD7Config = () => {
  const token = (process.env.D7_API_TOKEN || '').trim();
  const originator = (process.env.D7_WHATSAPP_ORIGINATOR || '').trim().replace(/[^\d]/g, '');
  const reportUrl = (process.env.D7_WHATSAPP_REPORT_URL || '').trim();
  return {
    configured: Boolean(token && originator),
    token,
    originator,
    reportUrl,
  };
};

const getUltraMsgConfig = () => {
  const instanceId = (process.env.ULTRAMSG_INSTANCE_ID || '').trim();
  const token = (process.env.ULTRAMSG_TOKEN || '').trim();
  return {
    configured: Boolean(instanceId && token),
    instanceId,
    token,
  };
};

interface UltraMsgLiveCache {
  fetchedAt: number;
  connected: boolean;
  connectedPhone: string | null;
  connectedName: string | null;
  lastError: string | null;
}

let ultraMsgCache: UltraMsgLiveCache | null = null;

const getUltraMsgLiveState = async (): Promise<UltraMsgLiveCache> => {
  const ultraMsg = getUltraMsgConfig();
  if (!ultraMsg.configured) {
    return {
      fetchedAt: Date.now(),
      connected: false,
      connectedPhone: null,
      connectedName: null,
      lastError: null,
    };
  }

  if (ultraMsgCache && Date.now() - ultraMsgCache.fetchedAt < 30_000) {
    return ultraMsgCache;
  }

  try {
    const [statusResp, meResp] = await Promise.all([
      fetch(
        `${ULTRAMSG_API_URL}/${encodeURIComponent(ultraMsg.instanceId)}/instance/status?token=${encodeURIComponent(ultraMsg.token)}`,
        { signal: AbortSignal.timeout(4000) }
      ),
      fetch(
        `${ULTRAMSG_API_URL}/${encodeURIComponent(ultraMsg.instanceId)}/instance/me?token=${encodeURIComponent(ultraMsg.token)}`,
        { signal: AbortSignal.timeout(4000) }
      ).catch(() => null),
    ]);

    const statusJson = (await statusResp.json().catch(() => null)) as {
      status?: { accountStatus?: { status?: string; substatus?: string } };
      error?: string;
    } | null;

    const accountState = statusJson?.status?.accountStatus?.status?.toLowerCase() || '';
    const subState = statusJson?.status?.accountStatus?.substatus?.toLowerCase() || '';
    const connected = accountState === 'authenticated' || subState === 'connected';

    let connectedPhone: string | null = null;
    let connectedName = 'UltraMsg WhatsApp API';
    if (meResp && meResp.ok) {
      const meJson = (await meResp.json().catch(() => null)) as {
        id?: string;
        name?: string;
      } | null;
      if (meJson?.id) {
        connectedPhone = formatPhoneDisplay(meJson.id);
      }
      if (meJson?.name) {
        connectedName = `UltraMsg · ${meJson.name}`;
      }
    }

    ultraMsgCache = {
      fetchedAt: Date.now(),
      connected: statusResp.ok ? connected : true,
      connectedPhone,
      connectedName,
      lastError:
        statusResp.ok && !connected
          ? `Instance UltraMsg (${ultraMsg.instanceId}) en attente de connexion (${accountState || 'non authentifiée'}).`
          : null,
    };
    return ultraMsgCache;
  } catch {
    return (
      ultraMsgCache || {
        fetchedAt: Date.now(),
        connected: true,
        connectedPhone: null,
        connectedName: 'UltraMsg WhatsApp API',
        lastError: null,
      }
    );
  }
};

const normalizePhoneDigits = (rawPhone: string): string => {
  let digits = (rawPhone || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  // Congo Brazzaville local mobile format (9 digits starting with 0, e.g. 06 846 15 31)
  if (digits.length === 9 && digits.startsWith('0')) {
    digits = `242${digits}`;
  }
  return digits;
};

type ScheduleAudienceFilter =
  | 'ALL'
  | 'CLIENTS'
  | 'SUPPLIERS'
  | 'PARTNERS'
  | 'CURRENCY'
  | 'GOLD'
  | 'CUSTOM';

interface AutoScheduleRecipient {
  reference: string;
  name: string;
  phone: string;
  roles: string[];
}

interface AutoScheduleConfig {
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
}

const DEFAULT_SCHEDULE_TEMPLATE =
  'Bonjour {nom}, CAMS GOLD vous souhaite une excellente journée ! Nous sommes disponibles dès maintenant pour vos opérations Or et Devises au meilleur taux.';

const DEFAULT_SCHEDULE: AutoScheduleConfig = {
  enabled: false,
  hour: 9,
  minute: 0,
  timezone: 'Africa/Brazzaville',
  audienceFilter: 'ALL',
  messageTemplate: DEFAULT_SCHEDULE_TEMPLATE,
  recipients: [],
  customRefs: [],
  lastRunDate: null,
  lastRunAt: null,
  lastStatus: 'idle',
  lastSentCount: 0,
  lastFailedCount: 0,
  lastError: null,
  updatedAt: new Date().toISOString(),
};

let isScheduleRunning = false;
let scheduleTimer: ReturnType<typeof setInterval> | null = null;

const loadScheduleConfig = (): AutoScheduleConfig => {
  try {
    if (!fs.existsSync(SCHEDULE_FILE)) {
      return { ...DEFAULT_SCHEDULE };
    }
    const raw = fs.readFileSync(SCHEDULE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<AutoScheduleConfig>;
    return {
      ...DEFAULT_SCHEDULE,
      ...parsed,
      hour: Number.isFinite(parsed.hour) ? Math.min(23, Math.max(0, Number(parsed.hour))) : 9,
      minute: Number.isFinite(parsed.minute) ? Math.min(59, Math.max(0, Number(parsed.minute))) : 0,
      timezone: (parsed.timezone || 'Africa/Brazzaville').trim() || 'Africa/Brazzaville',
      recipients: Array.isArray(parsed.recipients) ? parsed.recipients : [],
      customRefs: Array.isArray(parsed.customRefs) ? parsed.customRefs : [],
      messageTemplate:
        typeof parsed.messageTemplate === 'string' && parsed.messageTemplate.trim()
          ? parsed.messageTemplate
          : DEFAULT_SCHEDULE_TEMPLATE,
    };
  } catch {
    return { ...DEFAULT_SCHEDULE };
  }
};

const saveScheduleConfig = (config: AutoScheduleConfig): AutoScheduleConfig => {
  const next: AutoScheduleConfig = {
    ...config,
    updatedAt: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(next, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save WhatsApp schedule file:', err);
  }
  return next;
};

const getLocalClockParts = (timeZone: string): { dateKey: string; hour: number; minute: number } => {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || 'Africa/Brazzaville',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const pick = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  const rawHour = Number(pick('hour'));
  return {
    dateKey: `${pick('year')}-${pick('month')}-${pick('day')}`,
    hour: rawHour === 24 ? 0 : rawHour,
    minute: Number(pick('minute')),
  };
};

const matchesScheduleAudience = (
  recipient: AutoScheduleRecipient,
  filter: ScheduleAudienceFilter,
  customSet: Set<string>
): boolean => {
  const rolesLower = (recipient.roles || []).map((r) => r.toLowerCase());
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
    case 'CUSTOM':
      return customSet.has(recipient.reference);
    case 'ALL':
    default:
      return true;
  }
};

const getTargetRecipientsForSchedule = (config: AutoScheduleConfig): AutoScheduleRecipient[] => {
  const customSet = new Set(config.customRefs || []);
  const seenPhones = new Set<string>();
  const targets: AutoScheduleRecipient[] = [];

  for (const r of config.recipients || []) {
    if (!matchesScheduleAudience(r, config.audienceFilter, customSet)) continue;
    const digits = normalizePhoneDigits(r.phone || '');
    if (!digits || digits.length < 8 || seenPhones.has(digits)) continue;
    seenPhones.add(digits);
    targets.push(r);
  }
  return targets;
};

const buildScheduleStatusPayload = (config: AutoScheduleConfig) => {
  const targets = getTargetRecipientsForSchedule(config);
  const localClock = getLocalClockParts(config.timezone);
  const alreadyRanToday = config.lastRunDate === localClock.dateKey;
  const targetMinutes = config.hour * 60 + config.minute;
  const currentMinutes = localClock.hour * 60 + localClock.minute;
  const hh = String(config.hour).padStart(2, '0');
  const mm = String(config.minute).padStart(2, '0');

  let nextRunLabel = 'Désactivé';
  if (config.enabled) {
    if (!alreadyRanToday && currentMinutes <= targetMinutes + 15) {
      nextRunLabel = `Aujourd’hui à ${hh}h${mm}`;
    } else {
      nextRunLabel = `Demain à ${hh}h${mm}`;
    }
  }

  return {
    ...config,
    targetCount: targets.length,
    localDate: localClock.dateKey,
    localTime: `${String(localClock.hour).padStart(2, '0')}:${String(localClock.minute).padStart(2, '0')}`,
    nextRunLabel,
  };
};

const formatPhoneDisplay = (jidOrId?: string | null): string | null => {
  if (!jidOrId) return null;
  const raw = jidOrId.split(':')[0]?.split('@')[0]?.replace(/[^\d]/g, '');
  return raw ? `+${raw}` : null;
};

const clearReconnectTimer = () => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
};

const cleanupExpiredMedia = () => {
  const now = Date.now();
  for (const [token, entry] of tempMediaStore.entries()) {
    if (entry.expiresAt <= now) {
      tempMediaStore.delete(token);
    }
  }
};

const startBaileysConnection = async (forceResetAuth = false): Promise<void> => {
  if (isConnecting) return;
  clearReconnectTimer();

  if (forceResetAuth) {
    if (activeSocket) {
      try {
        activeSocket.end(undefined);
      } catch {
        // ignore close errors
      }
      activeSocket = null;
    }
    try {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }

  if (activeSocket && sessionState.status === 'connected') {
    return;
  }

  isConnecting = true;
  manualDisconnect = false;
  sessionState.status = 'connecting';
  sessionState.lastError = null;
  sessionState.updatedAt = new Date().toISOString();

  try {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    let version: [number, number, number] | undefined;
    try {
      const latest = await fetchLatestBaileysVersion();
      version = latest.version;
    } catch {
      version = undefined;
    }

    const sock = makeWASocket({
      auth: state,
      ...(version ? { version } : {}),
      logger: pino({ level: 'silent' }),
      browser: Browsers.macOS('Desktop'),
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      connectTimeoutMs: 30000,
    });

    activeSocket = sock;
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      if (activeSocket !== sock) return;
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          sessionState.qrDataUrl = await QRCode.toDataURL(qr, {
            width: 280,
            margin: 2,
            color: { dark: '#192A24', light: '#FFFFFF' },
          });
          sessionState.status = 'qr_ready';
          sessionState.lastError = null;
          sessionState.updatedAt = new Date().toISOString();
        } catch (qrErr) {
          sessionState.lastError =
            qrErr instanceof Error ? qrErr.message : 'Impossible de générer le QR Code.';
        }
      }

      if (connection === 'open') {
        consecutiveFailures = 0;
        sessionState.status = 'connected';
        sessionState.qrDataUrl = null;
        sessionState.connectedPhone = formatPhoneDisplay(sock.user?.id);
        sessionState.connectedName = sock.user?.name || 'WhatsApp connecté';
        sessionState.lastError = null;
        sessionState.updatedAt = new Date().toISOString();
      } else if (connection === 'close') {
        const statusCode = (
          lastDisconnect?.error as { output?: { statusCode?: number }; message?: string } | undefined
        )?.output?.statusCode;
        const errMessage = (
          lastDisconnect?.error as { message?: string } | undefined
        )?.message;

        activeSocket = null;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;

        if (isLoggedOut) {
          try {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          } catch {
            // ignore
          }
          sessionState.status = 'disconnected';
          sessionState.qrDataUrl = null;
          sessionState.connectedPhone = null;
          sessionState.connectedName = null;
          sessionState.lastError =
            'Session WhatsApp expirée ou déconnectée. Cliquez sur « Connecter WhatsApp » pour scanner un nouveau QR Code.';
          sessionState.updatedAt = new Date().toISOString();
          return;
        }

        if (manualDisconnect) {
          sessionState.status = 'disconnected';
          sessionState.qrDataUrl = null;
          sessionState.connectedPhone = null;
          sessionState.connectedName = null;
          sessionState.updatedAt = new Date().toISOString();
          return;
        }

        consecutiveFailures += 1;
        if (consecutiveFailures <= 6) {
          sessionState.status = 'connecting';
          sessionState.updatedAt = new Date().toISOString();
          reconnectTimer = setTimeout(() => {
            void startBaileysConnection(false);
          }, 1200);
        } else {
          sessionState.status = 'disconnected';
          sessionState.qrDataUrl = null;
          sessionState.lastError =
            errMessage || 'Connexion WhatsApp interrompue. Veuillez relancer la connexion.';
          sessionState.updatedAt = new Date().toISOString();
        }
      }
    });
  } catch (err) {
    sessionState.status = 'disconnected';
    sessionState.qrDataUrl = null;
    sessionState.lastError =
      err instanceof Error ? err.message : 'Erreur lors de l’initialisation WhatsApp.';
    sessionState.updatedAt = new Date().toISOString();
  } finally {
    isConnecting = false;
  }
};

const disconnectBaileys = async (): Promise<void> => {
  manualDisconnect = true;
  clearReconnectTimer();
  consecutiveFailures = 0;

  if (activeSocket) {
    try {
      await activeSocket.logout();
    } catch {
      try {
        activeSocket.end(undefined);
      } catch {
        // ignore
      }
    }
    activeSocket = null;
  }

  try {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }

  sessionState.status = 'disconnected';
  sessionState.qrDataUrl = null;
  sessionState.connectedPhone = null;
  sessionState.connectedName = null;
  sessionState.lastError = null;
  sessionState.updatedAt = new Date().toISOString();
};

const resolveBaileysJid = async (sock: WASocket, digits: string): Promise<string> => {
  try {
    const check = await sock.onWhatsApp(digits);
    const match = Array.isArray(check) ? check[0] : undefined;
    if (match && match.exists === false) {
      throw new Error(`Le numéro +${digits} n’est pas enregistré sur WhatsApp.`);
    }
    if (match?.jid) return match.jid;
  } catch (err) {
    if (err instanceof Error && err.message.includes('pas enregistré sur WhatsApp')) {
      throw err;
    }
  }
  return `${digits}@s.whatsapp.net`;
};

const parseUltraMsgResponse = async (response: globalThis.Response): Promise<UltraMsgResponse> => {
  const responseText = await response.text();
  let data: UltraMsgResponse | null;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Réponse UltraMsg invalide (${response.status}).`);
  }

  const errorMessage =
    typeof data?.error === 'string'
      ? data.error
      : data?.error?.message || data?.detail || data?.message;
  if (!response.ok || data?.sent === false || data?.sent === 'false' || data?.error) {
    throw new Error(errorMessage || `Erreur UltraMsg (${response.status}).`);
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Réponse UltraMsg invalide.');
  }
  return data;
};

const sendViaUltraMsgText = async (
  digits: string,
  body: string
): Promise<{ messageId?: string | number }> => {
  const ultraMsg = getUltraMsgConfig();
  const payload = new URLSearchParams({
    token: ultraMsg.token,
    to: `+${digits}`,
    body,
  });
  const response = await fetch(
    `${ULTRAMSG_API_URL}/${encodeURIComponent(ultraMsg.instanceId)}/messages/chat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload,
    }
  );
  const data = await parseUltraMsgResponse(response);
  return { messageId: data.id ?? data.messageId };
};

const sendViaUltraMsgDocument = async (
  digits: string,
  buffer: Buffer,
  filename: string,
  caption: string
): Promise<{ messageId?: string | number }> => {
  const ultraMsg = getUltraMsgConfig();
  const document = buffer.toString('base64');
  if (document.length > 10_000_000) {
    throw new Error('Le PDF dépasse la limite de taille acceptée par UltraMsg.');
  }
  const payload = new URLSearchParams({
    token: ultraMsg.token,
    to: `+${digits}`,
    filename,
    document,
    caption,
  });
  const response = await fetch(
    `${ULTRAMSG_API_URL}/${encodeURIComponent(ultraMsg.instanceId)}/messages/document`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload,
    }
  );
  const data = await parseUltraMsgResponse(response);
  return { messageId: data.id ?? data.messageId };
};

const sendViaD7Text = async (digits: string, body: string): Promise<{ messageId?: string }> => {
  const d7 = getD7Config();
  const payload = {
    messages: [
      {
        originator: d7.originator,
        content: {
          message_type: 'TEXT',
          text: {
            preview_url: true,
            body,
          },
        },
        recipients: [
          {
            recipient: digits,
            recipient_type: 'individual',
          },
        ],
        ...(d7.reportUrl ? { report_url: d7.reportUrl } : {}),
      },
    ],
  };

  const resp = await fetch(D7_SEND_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${d7.token}`,
    },
    body: JSON.stringify(payload),
  });

  const data = (await resp.json().catch(() => null)) as {
    request_id?: string;
    detail?: string;
    message?: string;
    error?: { message?: string };
  } | null;

  if (!resp.ok) {
    throw new Error(
      data?.detail || data?.error?.message || data?.message || `Erreur D7 Networks (${resp.status})`
    );
  }
  return { messageId: data?.request_id };
};

const sendViaD7Document = async (
  req: Request,
  digits: string,
  buffer: Buffer,
  filename: string,
  caption: string
): Promise<{ messageId?: string }> => {
  const d7 = getD7Config();
  cleanupExpiredMedia();
  const token = crypto.randomBytes(18).toString('hex');
  tempMediaStore.set(token, {
    buffer,
    filename,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  const baseEnv = (process.env.WHATSAPP_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  const host = req.get('host');
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  const publicBase = baseEnv || (host ? `${proto}://${host}` : '');
  if (!publicBase) {
    throw new Error('URL publique introuvable pour héberger temporairement le PDF vers D7.');
  }

  const documentUrl = `${publicBase}/api/whatsapp/media/${token}.pdf`;
  const payload = {
    messages: [
      {
        originator: d7.originator,
        content: {
          message_type: 'ATTACHMENT',
          attachment: {
            type: 'document',
            url: documentUrl,
            caption,
          },
        },
        recipients: [
          {
            recipient: digits,
            recipient_type: 'individual',
          },
        ],
        ...(d7.reportUrl ? { report_url: d7.reportUrl } : {}),
      },
    ],
  };

  const resp = await fetch(D7_SEND_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${d7.token}`,
    },
    body: JSON.stringify(payload),
  });

  const data = (await resp.json().catch(() => null)) as {
    request_id?: string;
    detail?: string;
    message?: string;
    error?: { message?: string };
  } | null;

  if (!resp.ok) {
    throw new Error(
      data?.detail || data?.error?.message || data?.message || `Erreur D7 Networks (${resp.status})`
    );
  }
  return { messageId: data?.request_id };
};

const sendViaMetaCloudText = async (
  digits: string,
  body: string
): Promise<{ messageId?: string }> => {
  const meta = getMetaCloudConfig();
  const endpoint = `https://graph.facebook.com/${encodeURIComponent(meta.apiVersion)}/${encodeURIComponent(meta.phoneNumberId)}/messages`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${meta.token}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: digits,
      type: 'text',
      text: {
        preview_url: false,
        body,
      },
    }),
  });
  const data = (await resp.json().catch(() => null)) as {
    messages?: Array<{ id?: string }>;
    error?: { message?: string };
  } | null;
  if (!resp.ok) {
    throw new Error(
      data?.error?.message || `Erreur Meta WhatsApp Cloud API (${resp.status})`
    );
  }
  return { messageId: data?.messages?.[0]?.id };
};

const sendViaMetaCloudDocument = async (
  req: Request,
  digits: string,
  buffer: Buffer,
  filename: string,
  caption: string
): Promise<{ messageId?: string }> => {
  const meta = getMetaCloudConfig();
  cleanupExpiredMedia();
  const token = crypto.randomBytes(18).toString('hex');
  tempMediaStore.set(token, {
    buffer,
    filename,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  const baseEnv = (process.env.WHATSAPP_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  const host = req.get('host');
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  const publicBase = baseEnv || (host ? `${proto}://${host}` : '');
  if (!publicBase) {
    throw new Error('URL publique introuvable pour héberger temporairement le PDF vers Meta Cloud API.');
  }

  const endpoint = `https://graph.facebook.com/${encodeURIComponent(meta.apiVersion)}/${encodeURIComponent(meta.phoneNumberId)}/messages`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${meta.token}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: digits,
      type: 'document',
      document: {
        link: `${publicBase}/api/whatsapp/media/${token}.pdf`,
        filename,
        caption,
      },
    }),
  });
  const data = (await resp.json().catch(() => null)) as {
    messages?: Array<{ id?: string }>;
    error?: { message?: string };
  } | null;
  if (!resp.ok) {
    throw new Error(
      data?.error?.message || `Erreur Meta WhatsApp Cloud API (${resp.status})`
    );
  }
  return { messageId: data?.messages?.[0]?.id };
};

const getStatusPayload = async () => {
  const metaCloud = getMetaCloudConfig();
  const ultraMsg = getUltraMsgConfig();
  const d7 = getD7Config();

  if (metaCloud.configured) {
    return {
      mode: 'meta_cloud' as const,
      apiConfigured: true,
      providerName: 'Meta Cloud API' as const,
      d7Configured: false,
      d7Originator: null,
      status: 'connected' as const,
      qrDataUrl: null,
      connectedPhone: metaCloud.phoneNumberId,
      connectedName: `WhatsApp Business Cloud API (${metaCloud.apiVersion})`,
      lastError: null,
      updatedAt: new Date().toISOString(),
    };
  }

  const apiConfigured = ultraMsg.configured || d7.configured;
  const providerName = ultraMsg.configured
    ? 'UltraMsg'
    : d7.configured
      ? 'D7 Networks'
      : null;

  if (ultraMsg.configured) {
    const live = await getUltraMsgLiveState();
    return {
      mode: 'ultramsg' as const,
      apiConfigured: true,
      providerName: 'UltraMsg' as const,
      d7Configured: false,
      d7Originator: null,
      status: live.connected ? ('connected' as const) : ('disconnected' as const),
      qrDataUrl: null,
      connectedPhone: live.connectedPhone,
      connectedName: live.connectedName || 'UltraMsg WhatsApp API',
      lastError: live.lastError,
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    mode: d7.configured ? ('d7' as const) : ('qr_trial' as const),
    apiConfigured,
    providerName,
    d7Configured: d7.configured,
    d7Originator: d7.configured ? `+${d7.originator}` : null,
    status: apiConfigured ? ('connected' as const) : sessionState.status,
    qrDataUrl: apiConfigured ? null : sessionState.qrDataUrl,
    connectedPhone: apiConfigured
      ? d7.configured
        ? `+${d7.originator}`
        : null
      : sessionState.connectedPhone,
    connectedName: apiConfigured ? `${providerName} WhatsApp API` : sessionState.connectedName,
    lastError: sessionState.lastError,
    updatedAt: sessionState.updatedAt,
  };
};

async function startServer() {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/whatsapp/status', async (_req: Request, res: Response) => {
    res.json(await getStatusPayload());
  });

  app.post('/api/whatsapp/connect', async (req: Request, res: Response) => {
    if (getMetaCloudConfig().configured || getUltraMsgConfig().configured || getD7Config().configured) {
      ultraMsgCache = null;
      res.json(await getStatusPayload());
      return;
    }
    const forceNew = Boolean((req.body as { reset?: boolean } | undefined)?.reset);
    await startBaileysConnection(forceNew);
    res.json(await getStatusPayload());
  });

  app.post('/api/whatsapp/disconnect', async (_req: Request, res: Response) => {
    await disconnectBaileys();
    res.json(await getStatusPayload());
  });

  const sendDirectText = async (phone: string, text: string) => {
    const digits = normalizePhoneDigits(phone);
    if (!digits || digits.length < 8) {
      throw new Error('Numéro WhatsApp invalide.');
    }
    const metaCloud = getMetaCloudConfig();
    if (metaCloud.configured) {
      const result = await sendViaMetaCloudText(digits, text);
      return { mode: 'meta_cloud' as const, digits, messageId: result.messageId || null };
    }
    const ultraMsg = getUltraMsgConfig();
    if (ultraMsg.configured) {
      const result = await sendViaUltraMsgText(digits, text);
      return { mode: 'ultramsg' as const, digits, messageId: result.messageId || null };
    }
    const d7 = getD7Config();
    if (d7.configured) {
      const result = await sendViaD7Text(digits, text);
      return { mode: 'd7' as const, digits, messageId: result.messageId || null };
    }
    if (!activeSocket || sessionState.status !== 'connected') {
      throw new Error('Passerelle WhatsApp non connectée.');
    }
    const jid = await resolveBaileysJid(activeSocket, digits);
    const sentInfo = await activeSocket.sendMessage(jid, { text });
    return { mode: 'qr_trial' as const, digits, messageId: sentInfo?.key?.id || null };
  };

  const executeScheduledBroadcast = async (
    reason: 'schedule' | 'manual',
    override?: Partial<AutoScheduleConfig>
  ) => {
    if (isScheduleRunning) {
      throw new Error('Un envoi automatique est déjà en cours.');
    }
    isScheduleRunning = true;
    const baseConfig = loadScheduleConfig();
    const activeConfig: AutoScheduleConfig = {
      ...baseConfig,
      ...override,
      recipients: override?.recipients ?? baseConfig.recipients,
      customRefs: override?.customRefs ?? baseConfig.customRefs,
    };

    const localClock = getLocalClockParts(activeConfig.timezone);
    const targets = getTargetRecipientsForSchedule(activeConfig);
    const template = (activeConfig.messageTemplate || DEFAULT_SCHEDULE_TEMPLATE).trim();

    if (targets.length === 0) {
      isScheduleRunning = false;
      const updated = saveScheduleConfig({
        ...baseConfig,
        ...(reason === 'schedule' ? { lastRunDate: localClock.dateKey } : {}),
        lastRunAt: new Date().toISOString(),
        lastStatus: 'error',
        lastSentCount: 0,
        lastFailedCount: 0,
        lastError: 'Aucun destinataire avec téléphone dans la cible sélectionnée.',
      });
      return buildScheduleStatusPayload(updated);
    }

    if (reason === 'schedule') {
      saveScheduleConfig({
        ...baseConfig,
        lastRunDate: localClock.dateKey,
        lastStatus: 'running',
        lastError: null,
      });
    }

    let sentCount = 0;
    let failedCount = 0;
    let firstError: string | null = null;

    try {
      for (let i = 0; i < targets.length; i += 1) {
        const contact = targets[i];
        const personalized = template.replace(/\{nom\}/gi, contact.name);
        try {
          await sendDirectText(contact.phone, personalized);
          sentCount += 1;
        } catch (err) {
          failedCount += 1;
          if (!firstError) {
            firstError = `${contact.name} : ${err instanceof Error ? err.message : 'échec'}`;
          }
        }
        if (i < targets.length - 1) {
          await new Promise((r) => setTimeout(r, 450));
        }
      }

      const finalStatus: AutoScheduleConfig['lastStatus'] =
        failedCount === 0 ? 'success' : sentCount > 0 ? 'partial' : 'error';

      const latest = loadScheduleConfig();
      const saved = saveScheduleConfig({
        ...latest,
        lastRunDate: localClock.dateKey,
        lastRunAt: new Date().toISOString(),
        lastStatus: finalStatus,
        lastSentCount: sentCount,
        lastFailedCount: failedCount,
        lastError: firstError,
      });
      console.log(
        `[WhatsApp Auto 09h00 - ${reason}] ${sentCount} envoyé(s), ${failedCount} échec(s) (${localClock.dateKey})`
      );
      return buildScheduleStatusPayload(saved);
    } finally {
      isScheduleRunning = false;
    }
  };

  app.get('/api/whatsapp/auto-schedule', (_req: Request, res: Response) => {
    const config = loadScheduleConfig();
    res.json(buildScheduleStatusPayload(config));
  });

  app.post('/api/whatsapp/auto-schedule', (req: Request, res: Response) => {
    const body = (req.body || {}) as Partial<AutoScheduleConfig>;
    const current = loadScheduleConfig();
    const next: AutoScheduleConfig = {
      ...current,
      ...(typeof body.enabled === 'boolean' ? { enabled: body.enabled } : {}),
      ...(Number.isFinite(body.hour)
        ? { hour: Math.min(23, Math.max(0, Number(body.hour))) }
        : {}),
      ...(Number.isFinite(body.minute)
        ? { minute: Math.min(59, Math.max(0, Number(body.minute))) }
        : {}),
      ...(typeof body.timezone === 'string' && body.timezone.trim()
        ? { timezone: body.timezone.trim() }
        : {}),
      ...(body.audienceFilter ? { audienceFilter: body.audienceFilter } : {}),
      ...(typeof body.messageTemplate === 'string'
        ? { messageTemplate: body.messageTemplate }
        : {}),
      ...(Array.isArray(body.recipients) ? { recipients: body.recipients } : {}),
      ...(Array.isArray(body.customRefs) ? { customRefs: body.customRefs } : {}),
    };
    const saved = saveScheduleConfig(next);
    res.json(buildScheduleStatusPayload(saved));
  });

  app.post('/api/whatsapp/auto-schedule/sync-contacts', (req: Request, res: Response) => {
    const body = (req.body || {}) as { recipients?: AutoScheduleRecipient[] };
    const current = loadScheduleConfig();
    if (Array.isArray(body.recipients)) {
      const saved = saveScheduleConfig({
        ...current,
        recipients: body.recipients,
      });
      res.json(buildScheduleStatusPayload(saved));
      return;
    }
    res.json(buildScheduleStatusPayload(current));
  });

  app.post('/api/whatsapp/auto-schedule/run-now', async (req: Request, res: Response) => {
    try {
      const override = (req.body || {}) as Partial<AutoScheduleConfig>;
      const result = await executeScheduledBroadcast('manual', override);
      res.json(result);
    } catch (err) {
      res.status(409).json({
        error: err instanceof Error ? err.message : 'Impossible de lancer la diffusion maintenant.',
      });
    }
  });

  app.get('/api/whatsapp/media/:tokenFile', (req: Request, res: Response) => {
    cleanupExpiredMedia();
    const rawParam = String(req.params.tokenFile || '');
    const token = rawParam.replace(/\.pdf$/i, '');
    const entry = tempMediaStore.get(token);
    if (!entry) {
      res.status(404).json({ error: 'Document PDF expiré ou introuvable.' });
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${entry.filename}"`);
    res.send(entry.buffer);
  });

  app.post('/api/whatsapp/send-text', async (req: Request, res: Response) => {
    try {
      const { phone, message } = (req.body || {}) as { phone?: string; message?: string };
      const digits = normalizePhoneDigits(phone || '');
      const text = (message || '').trim();

      if (!digits || digits.length < 8) {
        res.status(400).json({ error: 'Numéro de téléphone WhatsApp invalide.' });
        return;
      }
      if (!text) {
        res.status(400).json({ error: 'Le message texte est vide.' });
        return;
      }

      const metaCloud = getMetaCloudConfig();
      if (metaCloud.configured) {
        const result = await sendViaMetaCloudText(digits, text);
        res.json({
          sent: true,
          mode: 'meta_cloud',
          phone: `+${digits}`,
          messageId: result.messageId || null,
        });
        return;
      }

      const ultraMsg = getUltraMsgConfig();
      if (ultraMsg.configured) {
        const result = await sendViaUltraMsgText(digits, text);
        res.json({
          sent: true,
          mode: 'ultramsg',
          phone: `+${digits}`,
          messageId: result.messageId || null,
        });
        return;
      }

      const d7 = getD7Config();
      if (d7.configured) {
        const result = await sendViaD7Text(digits, text);
        res.json({ sent: true, mode: 'd7', phone: `+${digits}`, messageId: result.messageId || null });
        return;
      }

      if (!activeSocket || sessionState.status !== 'connected') {
        res.status(409).json({
          code: 'NOT_CONNECTED',
          error:
            'WhatsApp direct non connecté. Scannez d’abord le QR Code dans Messages pour envoyer sans ouvrir WhatsApp.',
        });
        return;
      }

      const jid = await resolveBaileysJid(activeSocket, digits);
      const sentInfo = await activeSocket.sendMessage(jid, { text });
      res.json({
        sent: true,
        mode: 'qr_trial',
        phone: `+${digits}`,
        messageId: sentInfo?.key?.id || null,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Erreur lors de l’envoi WhatsApp.',
      });
    }
  });

  app.post('/api/whatsapp/send-document', async (req: Request, res: Response) => {
    try {
      const { phone, filename, pdfBase64, caption } = (req.body || {}) as {
        phone?: string;
        filename?: string;
        pdfBase64?: string;
        caption?: string;
      };
      const digits = normalizePhoneDigits(phone || '');
      const cleanName = (filename || 'document.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');

      if (!digits || digits.length < 8) {
        res.status(400).json({ error: 'Numéro de téléphone WhatsApp invalide.' });
        return;
      }
      if (!pdfBase64 || typeof pdfBase64 !== 'string') {
        res.status(400).json({ error: 'Fichier PDF manquant.' });
        return;
      }

      const cleanBase64 = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64;
      const pdfBuffer = Buffer.from(cleanBase64, 'base64');
      if (pdfBuffer.length === 0) {
        res.status(400).json({ error: 'Le contenu du PDF est invalide.' });
        return;
      }

      const metaCloud = getMetaCloudConfig();
      if (metaCloud.configured) {
        const result = await sendViaMetaCloudDocument(
          req,
          digits,
          pdfBuffer,
          cleanName,
          caption || cleanName
        );
        res.json({
          sent: true,
          mode: 'meta_cloud',
          phone: `+${digits}`,
          filename: cleanName,
          messageId: result.messageId || null,
        });
        return;
      }

      const ultraMsg = getUltraMsgConfig();
      if (ultraMsg.configured) {
        const result = await sendViaUltraMsgDocument(
          digits,
          pdfBuffer,
          cleanName,
          caption || cleanName
        );
        res.json({
          sent: true,
          mode: 'ultramsg',
          phone: `+${digits}`,
          filename: cleanName,
          messageId: result.messageId || null,
        });
        return;
      }

      const d7 = getD7Config();
      if (d7.configured) {
        const result = await sendViaD7Document(
          req,
          digits,
          pdfBuffer,
          cleanName,
          caption || cleanName
        );
        res.json({
          sent: true,
          mode: 'd7',
          phone: `+${digits}`,
          filename: cleanName,
          messageId: result.messageId || null,
        });
        return;
      }

      if (!activeSocket || sessionState.status !== 'connected') {
        res.status(409).json({
          code: 'NOT_CONNECTED',
          error:
            'WhatsApp direct non connecté. Scannez d’abord le QR Code dans Messages pour envoyer le PDF sans ouvrir WhatsApp.',
        });
        return;
      }

      const jid = await resolveBaileysJid(activeSocket, digits);
      const sentInfo = await activeSocket.sendMessage(jid, {
        document: pdfBuffer,
        mimetype: 'application/pdf',
        fileName: cleanName,
        ...(caption ? { caption } : {}),
      });
      res.json({
        sent: true,
        mode: 'qr_trial',
        phone: `+${digits}`,
        filename: cleanName,
        messageId: sentInfo?.key?.id || null,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Erreur lors de l’envoi du PDF WhatsApp.',
      });
    }
  });

  // Meta WhatsApp Business Cloud API Webhook (verification + delivery receipts + STOP opt-out)
  app.get('/api/whatsapp/webhook', (req: Request, res: Response) => {
    const mode = String(req.query['hub.mode'] || '');
    const token = String(req.query['hub.verify_token'] || '');
    const challenge = String(req.query['hub.challenge'] || '');
    const expected = getMetaCloudConfig().verifyToken;
    if (mode === 'subscribe' && (!expected || token === expected)) {
      res.status(200).send(challenge);
      return;
    }
    res.sendStatus(403);
  });

  app.post('/api/whatsapp/webhook', (req: Request, res: Response) => {
    try {
      const body = req.body as {
        event_type?: string;
        data?: {
          id?: string | number;
          from?: string;
          body?: string;
          ack?: string;
          status?: string;
        };
        entry?: Array<{
          changes?: Array<{
            value?: {
              statuses?: Array<{
                id?: string;
                status?: string;
                errors?: Array<{ title?: string; message?: string }>;
              }>;
              messages?: Array<{
                from?: string;
                text?: { body?: string };
              }>;
            };
          }>;
        }>;
      };

      let data = loadAutomationData();
      let changed = false;

      const markUnsubscribeFromDigits = (rawFrom: string, rawKeyword: string) => {
        const fromDigits = normalizeDigits((rawFrom || '').split('@')[0] || '');
        if (!fromDigits) return;
        data.recipients = data.recipients.map((rec) => {
          if (normalizeDigits(rec.phone) !== fromDigits) return rec;
          changed = true;
          return {
            ...rec,
            unsubscribed: true,
            broadcastEnabled: false,
            unsubscribedAt: new Date().toISOString(),
          };
        });
        data = appendAuditLog(data, {
          actorName: `Webhook (+${fromDigits})`,
          actorRole: 'SYSTEM',
          action: 'Désabonnement automatique (STOP)',
          entityType: 'contact',
          summary: `Désabonnement WhatsApp enregistré via mot-clé "${rawKeyword || 'STOP'}" pour +${fromDigits}.`,
        });
        changed = true;
      };

      // UltraMsg webhook support (message_ack / message_received)
      if (body?.event_type === 'message_ack' && body.data?.id !== undefined) {
        const ackLower = String(body.data.ack || body.data.status || '').toLowerCase();
        const mappedUltraStatus: WhatsAppMessageLog['status'] | null =
          ackLower === 'read' || ackLower === 'played'
            ? 'read'
            : ackLower === 'device' || ackLower === 'delivered'
              ? 'delivered'
              : ackLower === 'server' || ackLower === 'sent'
                ? 'accepted'
                : ackLower === 'failed' || ackLower === 'invalid'
                  ? 'failed'
                  : null;
        if (mappedUltraStatus) {
          const targetId = String(body.data.id);
          data.logs = data.logs.map((log) => {
            if (String(log.whatsappMessageId || '') !== targetId) return log;
            changed = true;
            return {
              ...log,
              status: mappedUltraStatus,
              updatedAt: new Date().toISOString(),
            };
          });
        }
      } else if (body?.event_type === 'message_received' && body.data) {
        const textUpper = String(body.data.body || '').trim().toUpperCase();
        if (
          textUpper === 'STOP' ||
          textUpper.includes('DESABONNER') ||
          textUpper.includes('DÉSABONNER') ||
          textUpper === 'UNSUBSCRIBE'
        ) {
          markUnsubscribeFromDigits(body.data.from || '', body.data.body || 'STOP');
        }
      }

      // Meta WhatsApp Cloud API webhook support
      for (const entry of body?.entry || []) {
        for (const change of entry?.changes || []) {
          const statuses = change?.value?.statuses || [];
          for (const st of statuses) {
            if (!st.id) continue;
            const mappedStatus: WhatsAppMessageLog['status'] | null =
              st.status === 'sent'
                ? 'accepted'
                : st.status === 'delivered'
                  ? 'delivered'
                  : st.status === 'read'
                    ? 'read'
                    : st.status === 'failed'
                      ? 'failed'
                      : null;
            if (!mappedStatus) continue;
            data.logs = data.logs.map((log) => {
              if (log.whatsappMessageId !== st.id) return log;
              changed = true;
              const errMsg = st.errors?.[0]?.message || st.errors?.[0]?.title || log.errorReason;
              return {
                ...log,
                status: mappedStatus,
                errorReason: mappedStatus === 'failed' ? errMsg || 'Rejeté par Meta API' : log.errorReason,
                updatedAt: new Date().toISOString(),
              };
            });
          }

          const inbound = change?.value?.messages || [];
          for (const msg of inbound) {
            const textUpper = (msg.text?.body || '').trim().toUpperCase();
            if (
              textUpper === 'STOP' ||
              textUpper.includes('DESABONNER') ||
              textUpper.includes('DÉSABONNER') ||
              textUpper === 'UNSUBSCRIBE'
            ) {
              markUnsubscribeFromDigits(msg.from || '', msg.text?.body || 'STOP');
            }
          }
        }
      }

      if (changed) {
        // Recompute campaign delivery counters
        data.campaigns = data.campaigns.map((camp) => {
          const campLogs = data.logs.filter((l) => l.campaignId === camp.id);
          if (campLogs.length === 0) return camp;
          return {
            ...camp,
            sentCount: campLogs.filter((l) =>
              ['accepted', 'delivered', 'read'].includes(l.status)
            ).length,
            deliveredCount: campLogs.filter((l) => ['delivered', 'read'].includes(l.status)).length,
            readCount: campLogs.filter((l) => l.status === 'read').length,
            failedCount: campLogs.filter((l) => l.status === 'failed').length,
          };
        });
        saveAutomationData(data);
      }
      res.sendStatus(200);
    } catch (err) {
      console.error('Webhook processing error:', err);
      res.sendStatus(200);
    }
  });

  // =========================================================================
  // CAMS GOLD WhatsApp Automation Engine (Cahier des Charges v1.0)
  // =========================================================================
  let isAutomationDispatching = false;

  const isGatewayReady = async (): Promise<{ ready: boolean; reason?: string }> => {
    const st = await getStatusPayload();
    if (st.mode === 'meta_cloud' || st.mode === 'd7') {
      return { ready: true };
    }
    if (st.mode === 'ultramsg') {
      return st.status === 'connected'
        ? { ready: true }
        : { ready: false, reason: st.lastError || 'Instance UltraMsg non connectée.' };
    }
    if (st.status === 'connected' && activeSocket) {
      return { ready: true };
    }
    return {
      ready: false,
      reason: 'Passerelle WhatsApp non connectée (connectez Cloud API, UltraMsg ou scannez le QR Code).',
    };
  };

  const recomputeCampaignStats = (
    campaign: WhatsAppCampaignRecord,
    logs: WhatsAppMessageLog[]
  ): WhatsAppCampaignRecord => {
    const campLogs = logs.filter((l) => l.campaignId === campaign.id);
    const sentCount = campLogs.filter((l) =>
      ['accepted', 'delivered', 'read'].includes(l.status)
    ).length;
    const deliveredCount = campLogs.filter((l) => ['delivered', 'read'].includes(l.status)).length;
    const readCount = campLogs.filter((l) => l.status === 'read').length;
    const failedCount = campLogs.filter((l) => l.status === 'failed').length;
    const pendingCount = campLogs.filter((l) => l.status === 'pending' || l.status === 'sending').length;
    let status = campaign.status;
    if (status !== 'paused' && status !== 'cancelled') {
      if (pendingCount > 0) status = 'running';
      else if (failedCount === 0 && sentCount > 0) status = 'completed';
      else if (sentCount > 0 && failedCount > 0) status = 'partial';
      else if (sentCount === 0 && failedCount > 0) status = 'failed';
      else if (campaign.eligibleCount === 0) status = 'completed';
    }
    return {
      ...campaign,
      sentCount,
      deliveredCount,
      readCount,
      failedCount,
      status,
      finishedAt: pendingCount === 0 ? new Date().toISOString() : campaign.finishedAt,
    };
  };

  const dispatchCampaignNow = async (params: {
    type: WhatsAppCampaignType;
    categories?: WhatsAppBusinessCategory[];
    actorName?: string;
    actorRole?: string;
    ignoreDailyDedupe?: boolean;
    notes?: string;
  }) => {
    if (isAutomationDispatching) {
      throw new Error('Une diffusion WhatsApp est déjà en cours d’exécution.');
    }
    isAutomationDispatching = true;
    try {
      let data = loadAutomationData();
      const clock = getBrazzavilleClock(data.settings.timezone);
      const targetCategories =
        params.categories && params.categories.length > 0
          ? params.categories
          : getScheduledCategoriesForWeekday(data.categorySchedules, clock.weekday);

      const preview = buildAutomationPreview(data, {
        categories: targetCategories,
        campaignType: params.type,
        ignoreDailyDedupe: params.ignoreDailyDedupe,
      });

      const campId = `cmp_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
      const campRef = `WA-${clock.dateKey.replace(/-/g, '')}-${String(data.campaigns.length + 1).padStart(3, '0')}`;
      const gateway = await isGatewayReady();

      let campaign: WhatsAppCampaignRecord = {
        id: campId,
        reference: campRef,
        type: params.type,
        status: gateway.ready ? 'running' : 'scheduled',
        triggeredAt: new Date().toISOString(),
        scheduledDate: clock.dateKey,
        timezone: data.settings.timezone,
        categories: targetCategories,
        totalTargeted: preview.items.length,
        eligibleCount: preview.eligibleCount,
        blockedCount: preview.blockedCount,
        sentCount: 0,
        deliveredCount: 0,
        readCount: 0,
        failedCount: 0,
        createdBy: params.actorName || 'Moteur 09h00',
        notes: params.notes,
      };

      const newLogs: WhatsAppMessageLog[] = [];
      const retryDelayMs = Math.max(1, data.settings.retryDelayMinutes || 10) * 60_000;

      for (const item of preview.items) {
        const logId = `wlog_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
        if (!item.eligible) {
          newLogs.push({
            id: logId,
            campaignId: campId,
            campaignRef: campRef,
            idempotencyKey: item.idempotencyKey,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            contactRef: item.contactRef,
            contactName: item.contactName,
            phone: item.phone,
            category: item.category,
            messageType: params.type,
            currencyCode: item.currencyCode,
            priceSummary: item.priceSummary,
            renderedText: item.renderedText,
            status: 'blocked',
            whatsappMessageId: null,
            errorReason: item.blockReasons.join(' · '),
            retryCount: 0,
            nextRetryAt: null,
          });
          continue;
        }

        if (!gateway.ready) {
          newLogs.push({
            id: logId,
            campaignId: campId,
            campaignRef: campRef,
            idempotencyKey: item.idempotencyKey,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            contactRef: item.contactRef,
            contactName: item.contactName,
            phone: item.phone,
            category: item.category,
            messageType: params.type,
            currencyCode: item.currencyCode,
            priceSummary: item.priceSummary,
            renderedText: item.renderedText,
            status: 'pending',
            whatsappMessageId: null,
            errorReason: gateway.reason || 'WhatsApp indisponible à 09h00 — mis en file d’attente',
            retryCount: 0,
            nextRetryAt: data.settings.autoRetryEnabled
              ? new Date(Date.now() + retryDelayMs).toISOString()
              : null,
          });
          continue;
        }

        try {
          const sent = await sendDirectText(item.phone, item.renderedText);
          newLogs.push({
            id: logId,
            campaignId: campId,
            campaignRef: campRef,
            idempotencyKey: item.idempotencyKey,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            contactRef: item.contactRef,
            contactName: item.contactName,
            phone: item.phone,
            category: item.category,
            messageType: params.type,
            currencyCode: item.currencyCode,
            priceSummary: item.priceSummary,
            renderedText: item.renderedText,
            status: 'accepted',
            whatsappMessageId: sent.messageId ? String(sent.messageId) : null,
            errorReason: null,
            retryCount: 0,
            nextRetryAt: null,
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Erreur d’envoi temporaire';
          newLogs.push({
            id: logId,
            campaignId: campId,
            campaignRef: campRef,
            idempotencyKey: item.idempotencyKey,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            contactRef: item.contactRef,
            contactName: item.contactName,
            phone: item.phone,
            category: item.category,
            messageType: params.type,
            currencyCode: item.currencyCode,
            priceSummary: item.priceSummary,
            renderedText: item.renderedText,
            status: 'failed',
            whatsappMessageId: null,
            errorReason: errMsg,
            retryCount: 0,
            nextRetryAt: data.settings.autoRetryEnabled
              ? new Date(Date.now() + retryDelayMs).toISOString()
              : null,
          });
        }
        await new Promise((r) => setTimeout(r, 350));
      }

      const mergedLogs = [...newLogs, ...data.logs];
      campaign = recomputeCampaignStats(campaign, mergedLogs);
      if (!gateway.ready && preview.eligibleCount > 0) {
        data.settings.adminAlertMessage = `Alerte ${clock.timeLabel} : ${gateway.reason} (${preview.eligibleCount} message(s) conservé(s) en file d’attente).`;
        campaign.status = 'scheduled';
      } else if (campaign.failedCount > 0) {
        data.settings.adminAlertMessage = `Campagne ${campRef} : ${campaign.failedCount} échec(s) d’envoi mis en reprise contrôlée.`;
      }

      data = {
        ...data,
        campaigns: [campaign, ...data.campaigns],
        logs: mergedLogs,
        lastRunDate: params.type === 'scheduled_09h' ? clock.dateKey : data.lastRunDate,
        lastRunAt: new Date().toISOString(),
        lastStatus:
          campaign.failedCount === 0 && gateway.ready
            ? 'success'
            : campaign.sentCount > 0
              ? 'partial'
              : 'error',
        lastError: !gateway.ready
          ? gateway.reason || 'Passerelle indisponible'
          : campaign.failedCount > 0
            ? `${campaign.failedCount} échec(s)`
            : null,
      };
      data = appendAuditLog(data, {
        actorName: params.actorName || 'Système',
        actorRole: params.actorRole || 'ADMIN',
        action:
          params.type === 'exceptional'
            ? 'Diffusion exceptionnelle'
            : 'Campagne automatique 09h00',
        entityType: 'campaign',
        summary: `${campRef} : ${campaign.sentCount} accepté(s), ${campaign.blockedCount} bloqué(s), ${campaign.failedCount} échec(s).`,
      });

      const saved = saveAutomationData(data);
      return {
        campaign,
        createdLogs: newLogs,
        state: buildAutomationStatePayload(saved),
      };
    } finally {
      isAutomationDispatching = false;
    }
  };

  const processRetryQueue = async (filter?: { campaignId?: string; logId?: string; manual?: boolean }) => {
    if (isAutomationDispatching) return { retriedCount: 0, state: buildAutomationStatePayload(loadAutomationData()) };
    isAutomationDispatching = true;
    try {
      let data = loadAutomationData();
      const gateway = await isGatewayReady();
      if (!gateway.ready) {
        if (filter?.manual) {
          throw new Error(gateway.reason || 'Passerelle WhatsApp non connectée.');
        }
        return { retriedCount: 0, state: buildAutomationStatePayload(data) };
      }

      const now = Date.now();
      const pausedCampIds = new Set(
        data.campaigns.filter((c) => c.status === 'paused' || c.status === 'cancelled').map((c) => c.id)
      );

      // Idempotency guard: never retry a key that already succeeded
      const succeededKeys = new Set(
        data.logs
          .filter((l) => ['accepted', 'delivered', 'read'].includes(l.status))
          .map((l) => l.idempotencyKey)
      );

      let retriedCount = 0;
      const updatedLogs = [...data.logs];
      for (let i = 0; i < updatedLogs.length; i += 1) {
        const log = updatedLogs[i];
        if (filter?.campaignId && log.campaignId !== filter.campaignId) continue;
        if (filter?.logId && log.id !== filter.logId) continue;
        if (pausedCampIds.has(log.campaignId)) continue;
        if (!['pending', 'failed'].includes(log.status)) continue;

        if (!filter?.manual) {
          if (!data.settings.autoRetryEnabled) continue;
          if (log.retryCount >= (data.settings.maxRetries || 3)) continue;
          if (log.nextRetryAt && Date.parse(log.nextRetryAt) > now) continue;
        }

        if (succeededKeys.has(log.idempotencyKey)) {
          updatedLogs[i] = {
            ...log,
            status: 'cancelled',
            errorReason: 'Annulé automatiquement (idempotence : déjà envoyé)',
            nextRetryAt: null,
            updatedAt: new Date().toISOString(),
          };
          continue;
        }

        retriedCount += 1;
        const nextRetryNum = log.retryCount + 1;
        try {
          const sent = await sendDirectText(log.phone, log.renderedText);
          succeededKeys.add(log.idempotencyKey);
          updatedLogs[i] = {
            ...log,
            status: 'accepted',
            whatsappMessageId: sent.messageId ? String(sent.messageId) : log.whatsappMessageId,
            errorReason: null,
            retryCount: nextRetryNum,
            nextRetryAt: null,
            updatedAt: new Date().toISOString(),
          };
        } catch (err) {
          const progressiveDelay =
            Math.max(1, data.settings.retryDelayMinutes || 10) * (nextRetryNum + 1) * 60_000;
          updatedLogs[i] = {
            ...log,
            status: 'failed',
            errorReason: err instanceof Error ? err.message : 'Échec reprise',
            retryCount: nextRetryNum,
            nextRetryAt:
              nextRetryNum < (data.settings.maxRetries || 3)
                ? new Date(Date.now() + progressiveDelay).toISOString()
                : null,
            updatedAt: new Date().toISOString(),
          };
        }
        await new Promise((r) => setTimeout(r, 350));
      }

      if (retriedCount > 0) {
        data.logs = updatedLogs;
        data.campaigns = data.campaigns.map((c) => recomputeCampaignStats(c, updatedLogs));
        if (filter?.manual) {
          data = appendAuditLog(data, {
            actorName: 'Opérateur',
            actorRole: 'ADMIN',
            action: 'Reprise manuelle file d’attente',
            entityType: 'queue',
            summary: `${retriedCount} message(s) relancé(s) sans doublon.`,
          });
        }
        data = saveAutomationData(data);
      }

      return { retriedCount, state: buildAutomationStatePayload(data) };
    } finally {
      isAutomationDispatching = false;
    }
  };

  app.get('/api/whatsapp/automation/state', (_req: Request, res: Response) => {
    const data = loadAutomationData();
    res.json(buildAutomationStatePayload(data));
  });

  app.post('/api/whatsapp/automation/settings', (req: Request, res: Response) => {
    const body = (req.body || {}) as {
      settings?: Partial<WhatsAppAutomationSettings>;
      categorySchedules?: CategoryScheduleRule[];
      actorName?: string;
      actorRole?: string;
    };
    let data = loadAutomationData();
    if (body.settings) {
      data.settings = {
        ...data.settings,
        ...body.settings,
        hour:
          body.settings.hour !== undefined
            ? Math.min(23, Math.max(0, Number(body.settings.hour)))
            : data.settings.hour,
        minute:
          body.settings.minute !== undefined
            ? Math.min(59, Math.max(0, Number(body.settings.minute)))
            : data.settings.minute,
      };
    }
    if (Array.isArray(body.categorySchedules)) {
      data.categorySchedules = body.categorySchedules;
    }
    data = appendAuditLog(data, {
      actorName: body.actorName || 'Administrateur',
      actorRole: body.actorRole || 'ADMIN',
      action: body.settings?.paused !== undefined
        ? body.settings.paused
          ? 'Suspension automatisation'
          : 'Reprise automatisation'
        : 'Mise à jour planification 09h00',
      entityType: 'automation',
      summary: `Heure ${String(data.settings.hour).padStart(2, '0')}h${String(data.settings.minute).padStart(2, '0')} (${data.settings.timezone}) · Actif: ${data.settings.enabled ? 'Oui' : 'Non'} · Pause: ${data.settings.paused ? 'Oui' : 'Non'}.`,
    });
    const saved = saveAutomationData(data);
    res.json(buildAutomationStatePayload(saved));
  });

  app.post('/api/whatsapp/automation/gold-prices', (req: Request, res: Response) => {
    const body = (req.body || {}) as {
      quote?: Partial<GoldPriceQuoteEntry> & { category: 'OR_BRUT' | 'OR_FONDU' | 'BIJOUX' };
      actorName?: string;
      actorRole?: string;
    };
    if (!body.quote?.category) {
      res.status(400).json({ error: 'Catégorie or manquante.' });
      return;
    }
    let data = loadAutomationData();
    const cat = body.quote.category;
    const prev = data.goldPrices[cat];
    const nowIso = new Date().toISOString();
    const next: GoldPriceQuoteEntry = {
      ...prev,
      ...body.quote,
      category: cat,
      updatedAt: nowIso,
      updatedBy: body.actorName || body.quote.updatedBy || 'Opérateur',
      ...(body.quote.status === 'validated'
        ? {
            validatedAt: nowIso,
            validatedBy: body.actorName || 'Validateur',
          }
        : {}),
    };
    data.goldPrices[cat] = next;
    data = appendAuditLog(data, {
      actorName: body.actorName || 'Opérateur',
      actorRole: body.actorRole || 'ADMIN',
      action:
        next.status === 'validated'
          ? `Validation tarif ${cat}`
          : `Modification tarif ${cat} (${next.status})`,
      entityType: 'gold_price',
      summary: `${cat} : ${next.pricePerGramXaf} ${next.currency}/${next.unit} · Statut: ${next.status}.`,
    });
    const saved = saveAutomationData(data);
    res.json(buildAutomationStatePayload(saved));
  });

  app.post('/api/whatsapp/automation/currency-rates', (req: Request, res: Response) => {
    const body = (req.body || {}) as {
      rates?: CurrencyRateInventoryEntry[];
      actorName?: string;
      actorRole?: string;
      summaryNote?: string;
    };
    if (!Array.isArray(body.rates)) {
      res.status(400).json({ error: 'Liste de devises invalide.' });
      return;
    }
    let data = loadAutomationData();
    const nowIso = new Date().toISOString();
    data.currencyRates = body.rates.map((r) => {
      const physical = Math.max(0, Number(r.physicalStock) || 0);
      const reserved = Math.max(0, Number(r.reservedStock) || 0);
      return {
        ...r,
        code: String(r.code || 'USD').toUpperCase().trim(),
        buyRateXaf: Math.max(0, Number(r.buyRateXaf) || 0),
        sellRateXaf: Math.max(0, Number(r.sellRateXaf) || 0),
        physicalStock: physical,
        reservedStock: reserved,
        availableStock: Math.max(0, physical - reserved),
        minAnnounceStock: Math.max(0, Number(r.minAnnounceStock) || 0),
        updatedAt: nowIso,
        updatedBy: body.actorName || r.updatedBy || 'Opérateur',
      };
    });
    data = appendAuditLog(data, {
      actorName: body.actorName || 'Opérateur',
      actorRole: body.actorRole || 'ADMIN',
      action: 'Mise à jour taux & stocks devises',
      entityType: 'currency_rate',
      summary:
        body.summaryNote ||
        `${data.currencyRates.length} devise(s) actualisée(s) (${data.currencyRates.map((x) => `${x.code}:${x.status}`).join(', ')}).`,
    });
    const saved = saveAutomationData(data);
    res.json(buildAutomationStatePayload(saved));
  });

  app.post('/api/whatsapp/automation/sync-recipients', (req: Request, res: Response) => {
    const body = (req.body || {}) as { recipients?: WhatsAppCRMRecipient[] };
    if (!Array.isArray(body.recipients)) {
      res.status(400).json({ error: 'Liste de contacts invalide.' });
      return;
    }
    const data = loadAutomationData();
    const existingByRef = new Map(data.recipients.map((r) => [r.reference, r]));
    data.recipients = body.recipients.map((incoming) => {
      const prev = existingByRef.get(incoming.reference);
      const cats =
        Array.isArray(incoming.whatsappCategories) && incoming.whatsappCategories.length > 0
          ? incoming.whatsappCategories
          : prev?.whatsappCategories?.length
            ? prev.whatsappCategories
            : inferRecipientCategories(incoming.roles || []);
      // Preserve server-side webhook STOP opt-out unless explicitly re-subscribed in UI
      const unsubscribed =
        incoming.unsubscribed !== undefined ? incoming.unsubscribed : prev?.unsubscribed ?? false;
      return {
        ...prev,
        ...incoming,
        whatsappCategories: cats,
        unsubscribed,
        whatsappStatus: incoming.whatsappStatus || prev?.whatsappStatus || 'active',
        consentGranted: incoming.consentGranted ?? prev?.consentGranted ?? false,
        broadcastEnabled:
          unsubscribed
            ? false
            : incoming.broadcastEnabled ?? prev?.broadcastEnabled ?? true,
      };
    });
    const saved = saveAutomationData(data);
    res.json(buildAutomationStatePayload(saved));
  });

  app.post('/api/whatsapp/automation/templates', (req: Request, res: Response) => {
    const body = (req.body || {}) as {
      template?: WhatsAppMessageTemplate;
      actorName?: string;
      actorRole?: string;
    };
    if (!body.template?.category) {
      res.status(400).json({ error: 'Modèle invalide.' });
      return;
    }
    let data = loadAutomationData();
    const nowIso = new Date().toISOString();
    data.templates = data.templates.map((t) =>
      t.category === body.template!.category
        ? {
            ...t,
            ...body.template,
            updatedAt: nowIso,
            updatedBy: body.actorName || 'Opérateur',
          }
        : t
    );
    data = appendAuditLog(data, {
      actorName: body.actorName || 'Opérateur',
      actorRole: body.actorRole || 'ADMIN',
      action: `Modification modèle ${body.template.category}`,
      entityType: 'template',
      summary: `Modèle "${body.template.title}" mis à jour.`,
    });
    const saved = saveAutomationData(data);
    res.json(buildAutomationStatePayload(saved));
  });

  app.post('/api/whatsapp/automation/preview', (req: Request, res: Response) => {
    const body = (req.body || {}) as {
      categories?: WhatsAppBusinessCategory[];
      campaignType?: WhatsAppCampaignType;
      ignoreDailyDedupe?: boolean;
    };
    const data = loadAutomationData();
    res.json(buildAutomationPreview(data, body));
  });

  app.post('/api/whatsapp/automation/run', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        type?: WhatsAppCampaignType;
        categories?: WhatsAppBusinessCategory[];
        actorName?: string;
        actorRole?: string;
        ignoreDailyDedupe?: boolean;
        notes?: string;
      };
      const result = await dispatchCampaignNow({
        type: body.type || 'exceptional',
        categories: body.categories,
        actorName: body.actorName,
        actorRole: body.actorRole,
        ignoreDailyDedupe: body.ignoreDailyDedupe,
        notes: body.notes,
      });
      res.json(result);
    } catch (err) {
      res.status(409).json({
        error: err instanceof Error ? err.message : 'Impossible d’exécuter la campagne.',
      });
    }
  });

  app.post('/api/whatsapp/automation/campaigns/:id/pause', (req: Request, res: Response) => {
    const campaignId = String(req.params.id || '');
    const body = (req.body || {}) as { paused?: boolean; actorName?: string; actorRole?: string };
    let data = loadAutomationData();
    let foundRef = campaignId;
    data.campaigns = data.campaigns.map((c) => {
      if (c.id !== campaignId) return c;
      foundRef = c.reference;
      const nextStatus = body.paused ? 'paused' : 'running';
      return { ...c, status: nextStatus };
    });
    data = appendAuditLog(data, {
      actorName: body.actorName || 'Administrateur',
      actorRole: body.actorRole || 'ADMIN',
      action: body.paused ? 'Campagne suspendue' : 'Campagne reprise',
      entityType: 'campaign',
      summary: `Campagne ${foundRef} ${body.paused ? 'mise en pause' : 'reprise'}.`,
    });
    const saved = saveAutomationData(data);
    res.json(buildAutomationStatePayload(saved));
  });

  app.post('/api/whatsapp/automation/campaigns/:id/cancel', (req: Request, res: Response) => {
    const campaignId = String(req.params.id || '');
    const body = (req.body || {}) as { actorName?: string; actorRole?: string };
    let data = loadAutomationData();
    let foundRef = campaignId;
    data.campaigns = data.campaigns.map((c) => {
      if (c.id !== campaignId) return c;
      foundRef = c.reference;
      return { ...c, status: 'cancelled', finishedAt: new Date().toISOString() };
    });
    data.logs = data.logs.map((l) =>
      l.campaignId === campaignId && (l.status === 'pending' || l.status === 'failed')
        ? { ...l, status: 'cancelled', nextRetryAt: null, updatedAt: new Date().toISOString() }
        : l
    );
    data = appendAuditLog(data, {
      actorName: body.actorName || 'Administrateur',
      actorRole: body.actorRole || 'ADMIN',
      action: 'Campagne annulée',
      entityType: 'campaign',
      summary: `Campagne ${foundRef} annulée (file d’attente vidée).`,
    });
    const saved = saveAutomationData(data);
    res.json(buildAutomationStatePayload(saved));
  });

  app.post('/api/whatsapp/automation/retry', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as { campaignId?: string; logId?: string };
      const result = await processRetryQueue({
        campaignId: body.campaignId,
        logId: body.logId,
        manual: true,
      });
      res.json(result);
    } catch (err) {
      res.status(409).json({
        error: err instanceof Error ? err.message : 'Impossible de relancer la file d’attente.',
      });
    }
  });

  app.post('/api/whatsapp/automation/clear-alert', (_req: Request, res: Response) => {
    const data = loadAutomationData();
    data.settings.adminAlertMessage = null;
    const saved = saveAutomationData(data);
    res.json(buildAutomationStatePayload(saved));
  });

  app.get('/healthz', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  if (IS_PROD) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const viteReady = import('vite').then(({ createServer: createViteServer }) =>
      createViteServer({
        server: { middlewareMode: true, hmr: false },
        appType: 'spa',
      })
    );
    app.use(async (req: Request, res: Response, next) => {
      try {
        const vite = await viteReady;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`CAMS GOLD server listening on http://0.0.0.0:${PORT}`);
    // Auto-resume saved WhatsApp QR session if credentials already exist
    if (
      !getMetaCloudConfig().configured &&
      !getUltraMsgConfig().configured &&
      !getD7Config().configured &&
      fs.existsSync(path.join(AUTH_DIR, 'creds.json'))
    ) {
      void startBaileysConnection(false);
    }

    if (scheduleTimer) {
      clearInterval(scheduleTimer);
    }
    const checkAutoSchedule = () => {
      if (isScheduleRunning) return;
      const cfg = loadScheduleConfig();
      if (cfg.enabled && cfg.messageTemplate.trim() && cfg.recipients.length > 0) {
        const localClock = getLocalClockParts(cfg.timezone);
        if (cfg.lastRunDate !== localClock.dateKey) {
          const nowMins = localClock.hour * 60 + localClock.minute;
          const targetMins = cfg.hour * 60 + cfg.minute;
          if (nowMins >= targetMins && nowMins <= targetMins + 15) {
            void executeScheduledBroadcast('schedule').catch((err) => {
              console.error('[WhatsApp Auto 09h00 - Legacy] erreur:', err);
            });
          }
        }
      }

      // Cahier des Charges Automation Engine (09h00 Africa/Brazzaville + Retry Queue)
      if (!isAutomationDispatching) {
        const autoData = loadAutomationData();
        if (autoData.settings.enabled && !autoData.settings.paused) {
          const autoClock = getBrazzavilleClock(autoData.settings.timezone);
          if (autoData.lastRunDate !== autoClock.dateKey) {
            const nowMins = autoClock.hour * 60 + autoClock.minute;
            const targetMins = autoData.settings.hour * 60 + autoData.settings.minute;
            if (nowMins >= targetMins && nowMins <= targetMins + 15) {
              void dispatchCampaignNow({
                type: 'scheduled_09h',
                actorName: 'Moteur 09h00 (Africa/Brazzaville)',
                actorRole: 'SYSTEM',
              }).catch((err) => {
                console.error('[WhatsApp Automation 09h00] erreur:', err);
              });
              return;
            }
          }
        }
        // Check progressive retry queue
        if (autoData.settings.autoRetryEnabled && !autoData.settings.paused) {
          const nowTs = Date.now();
          const hasDueRetry = autoData.logs.some(
            (l) =>
              (l.status === 'pending' || l.status === 'failed') &&
              l.retryCount < (autoData.settings.maxRetries || 3) &&
              (!l.nextRetryAt || Date.parse(l.nextRetryAt) <= nowTs)
          );
          if (hasDueRetry) {
            void processRetryQueue({ manual: false }).catch((err) => {
              console.error('[WhatsApp Retry Queue] erreur:', err);
            });
          }
        }
      }
    };
    checkAutoSchedule();
    scheduleTimer = setInterval(checkAutoSchedule, 20_000);
  });

  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection in server:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception in server:', err);
});

void startServer();
