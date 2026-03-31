import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import axios, { AxiosInstance, AxiosError } from 'axios';

// ─── Types ───────────────────────────────────────────────────

export interface WASendResult {
  success: boolean;
  data?: any;
  error?: any;
  /** True if failure was due to an invalid/expired token */
  tokenExpired?: boolean;
}

export type WAHealthStatus = {
  enabled: boolean;
  tokenValid: boolean | null; // null = not checked yet
  lastTokenCheck: string | null;
  lastError: string | null;
  messagesSent: number;
  messagesFailed: number;
  consecutiveFailures: number;
};

// ─── Constants ───────────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1_000; // 1s, 2s, 4s exponential
const TOKEN_CHECK_INTERVAL_MS = 30 * 60 * 1000; // Check token every 30 min

/**
 * Core WhatsApp Cloud API service with:
 * - Token validation on startup
 * - Automatic retries with exponential backoff
 * - Token expiration detection (401)
 * - Health status tracking
 * - Periodic token health checks
 */
@Injectable()
export class WhatsAppService implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly client: AxiosInstance;
  private readonly phoneNumberId: string;
  private readonly verifyToken: string;
  private readonly accessToken: string;
  private readonly apiUrl: string;
  private readonly isEnabled: boolean;

  // ─── Health tracking ─────────────────────────────────────
  private tokenValid: boolean | null = null;
  private lastTokenCheck: string | null = null;
  private lastError: string | null = null;
  private messagesSent = 0;
  private messagesFailed = 0;
  private consecutiveFailures = 0;
  private tokenCheckInterval: NodeJS.Timeout | null = null;

  constructor(
    private config: ConfigService,
    private eventEmitter: EventEmitter2,
  ) {
    this.apiUrl =
      config.get<string>('WHATSAPP_API_URL') ||
      'https://graph.facebook.com/v21.0';
    this.accessToken = config.get<string>('WHATSAPP_TOKEN') || '';
    this.phoneNumberId =
      config.get<string>('WHATSAPP_PHONE_NUMBER_ID') || '';
    this.verifyToken =
      config.get<string>('WHATSAPP_VERIFY_TOKEN') || 'handy-verify-token';

    // Only enable WA sending if we have real credentials
    this.isEnabled =
      !!this.accessToken &&
      this.accessToken !== 'your_whatsapp_token' &&
      !!this.phoneNumberId &&
      this.phoneNumberId !== 'your_phone_number_id';

    this.client = axios.create({
      baseURL: `${this.apiUrl}/${this.phoneNumberId}`,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 15_000,
    });
  }

  // ─── Lifecycle: validate token on startup ────────────────

  async onModuleInit() {
    if (!this.isEnabled) {
      this.logger.warn(
        '⚠️  WhatsApp Cloud API DISABLED — set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID in .env',
      );
      return;
    }

    this.logger.log('WhatsApp Cloud API enabled — validating token...');
    await this.validateToken();

    // Periodic token health check
    this.tokenCheckInterval = setInterval(async () => {
      await this.validateToken();
    }, TOKEN_CHECK_INTERVAL_MS);
  }

  /**
   * Validate the token by making a lightweight API call.
   * Updates health status accordingly.
   */
  async validateToken(): Promise<boolean> {
    if (!this.isEnabled) return false;

    try {
      // GET /{phone-number-id} — lightweight call to check credentials
      await this.client.get('', { timeout: 10_000 });
      this.tokenValid = true;
      this.lastTokenCheck = new Date().toISOString();
      this.lastError = null;
      this.logger.log('✅ WhatsApp token is valid');
      return true;
    } catch (error: any) {
      this.tokenValid = false;
      this.lastTokenCheck = new Date().toISOString();

      const status = error.response?.status;
      const errMsg = error.response?.data?.error?.message || error.message;
      this.lastError = errMsg;

      if (status === 401 || status === 190) {
        this.logger.error(
          '🔴 TOKEN EXPIRADO O INVÁLIDO — Los mensajes de WhatsApp NO se enviarán.',
        );
        this.logger.error(
          '   → Ve a developers.facebook.com → Tu App → WhatsApp → API Setup → Genera un nuevo token',
        );
        this.logger.error(
          '   → Actualiza WHATSAPP_TOKEN en backend/.env y reinicia el backend',
        );
      } else {
        this.logger.error(
          `🔴 Error validando token de WhatsApp (HTTP ${status}): ${errMsg}`,
        );
      }

      // Emit event so other parts of the system can react
      this.eventEmitter.emit('whatsapp.token.invalid', {
        error: errMsg,
        status,
        timestamp: new Date().toISOString(),
      });

      return false;
    }
  }

  // ─── Public getters ──────────────────────────────────────

  getVerifyToken(): string {
    return this.verifyToken;
  }

  isWhatsAppEnabled(): boolean {
    return this.isEnabled;
  }

  isTokenValid(): boolean {
    return this.tokenValid === true;
  }

  getHealthStatus(): WAHealthStatus {
    return {
      enabled: this.isEnabled,
      tokenValid: this.tokenValid,
      lastTokenCheck: this.lastTokenCheck,
      lastError: this.lastError,
      messagesSent: this.messagesSent,
      messagesFailed: this.messagesFailed,
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  // ─── Phone normalization ─────────────────────────────────

  /**
   * Normalize phone numbers for the WhatsApp Cloud API.
   * Mexican numbers: WA sometimes sends "521XXXXXXXXXX" (13 digits)
   * but the API expects "52XXXXXXXXXX" (12 digits) — removes the extra "1".
   */
  normalizePhone(phone: string): string {
    if (!phone) return phone;
    let cleaned = phone.replace(/\D/g, '');
    // Mexican numbers: if starts with "521" followed by 10 digits → remove the "1"
    if (cleaned.length === 13 && cleaned.startsWith('521')) {
      cleaned = '52' + cleaned.slice(3);
      this.logger.debug(`Normalized MX phone: ${phone} → ${cleaned}`);
    }
    return cleaned;
  }

  // ─── Sending methods ────────────────────────────────────

  /**
   * Send a plain text message with automatic retries.
   */
  async sendTextMessage(
    to: string,
    text: string,
  ): Promise<WASendResult> {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.normalizePhone(to),
      type: 'text',
      text: { body: text },
    };
    return this.sendWithRetry(payload, `text to ${to}`);
  }

  /**
   * Send interactive reply buttons (max 3 buttons).
   */
  async sendInteractiveButtons(
    to: string,
    bodyText: string,
    buttons: { id: string; title: string }[],
  ): Promise<WASendResult> {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.normalizePhone(to),
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: {
          buttons: buttons.map((btn) => ({
            type: 'reply',
            reply: { id: btn.id, title: btn.title },
          })),
        },
      },
    };
    return this.sendWithRetry(payload, `interactive to ${to}`);
  }

  /**
   * Send an interactive list message.
   */
  async sendInteractiveList(
    to: string,
    headerText: string,
    bodyText: string,
    footerText: string,
    buttonText: string,
    sections: {
      title: string;
      rows: { id: string; title: string; description?: string }[];
    }[],
  ): Promise<WASendResult> {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.normalizePhone(to),
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: headerText },
        body: { text: bodyText },
        footer: { text: footerText },
        action: { button: buttonText, sections },
      },
    };
    return this.sendWithRetry(payload, `list to ${to}`);
  }

  /**
   * Send a location message (pin on map).
   * WhatsApp Cloud API supports type "location" natively.
   */
  async sendLocationMessage(
    to: string,
    lat: number,
    lng: number,
    name: string,
    address: string,
  ): Promise<WASendResult> {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.normalizePhone(to),
      type: 'location',
      location: {
        latitude: lat,
        longitude: lng,
        name,
        address,
      },
    };
    return this.sendWithRetry(payload, `location to ${to}`);
  }

  /**
   * Mark a message as read.
   */
  async markAsRead(
    messageId: string,
  ): Promise<WASendResult> {
    const payload = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    };
    // markAsRead doesn't need retries — it's best-effort
    return this.sendMessage(payload);
  }

  // ─── Core sender with retry logic ────────────────────────

  /**
   * Send a message with automatic retry on transient failures.
   * Uses exponential backoff: 1s, 2s, 4s.
   *
   * Does NOT retry on:
   * - Token expired (401) — marks token as invalid
   * - Rate limiting (429) — waits and retries once
   * - Client errors (4xx except 429) — fails immediately
   */
  private async sendWithRetry(
    payload: Record<string, any>,
    description: string,
  ): Promise<WASendResult> {
    let lastError: any;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const result = await this.sendMessage(payload);

      if (result.success) {
        // Reset consecutive failures on success
        if (this.consecutiveFailures > 0) {
          this.logger.log(
            `✅ Message recovered after ${this.consecutiveFailures} consecutive failures`,
          );
        }
        this.consecutiveFailures = 0;
        return result;
      }

      // Check if this is a non-retryable error
      if (result.tokenExpired) {
        this.logger.error(
          `🔴 Token expired — NOT retrying [${description}]`,
        );
        return result;
      }

      const httpStatus = result.error?.status || result.error?.code;
      const isClientError =
        typeof httpStatus === 'number' && httpStatus >= 400 && httpStatus < 500;

      // Rate limited — wait longer
      if (httpStatus === 429) {
        const waitMs = 5_000; // 5 seconds
        this.logger.warn(
          `⚠️  Rate limited — waiting ${waitMs / 1000}s before retry [${description}]`,
        );
        await this.sleep(waitMs);
        continue;
      }

      // Other client errors — don't retry
      if (isClientError) {
        this.logger.error(
          `❌ Client error (${httpStatus}) — NOT retrying [${description}]`,
        );
        return result;
      }

      lastError = result.error;

      // Transient error — retry with backoff
      if (attempt < MAX_RETRIES) {
        const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        this.logger.warn(
          `⚠️  Attempt ${attempt}/${MAX_RETRIES} failed for [${description}] — retrying in ${delayMs}ms`,
        );
        await this.sleep(delayMs);
      }
    }

    // All retries exhausted
    this.logger.error(
      `🔴 All ${MAX_RETRIES} attempts failed for [${description}]: ${JSON.stringify(lastError)}`,
    );

    // Emit event for failed notification
    this.eventEmitter.emit('whatsapp.send.failed', {
      payload,
      error: lastError,
      description,
      timestamp: new Date().toISOString(),
    });

    return { success: false, error: lastError };
  }

  /**
   * Core message sender — single attempt.
   */
  private async sendMessage(payload: Record<string, any>): Promise<WASendResult> {
    // In dev/disabled mode, just log the message
    if (!this.isEnabled) {
      this.logger.log(
        `[WA-DEV] Would send to ${payload.to}: ${JSON.stringify(payload).slice(0, 300)}`,
      );
      return { success: true, data: { dev: true } };
    }

    // If we know the token is expired, fail fast but still try
    // (in case the token was refreshed externally)
    if (this.tokenValid === false) {
      this.logger.warn(
        `⚠️  Sending with potentially expired token to ${payload.to}`,
      );
    }

    try {
      const response = await this.client.post('/messages', payload);
      const msgId = response.data?.messages?.[0]?.id || 'ok';
      this.logger.log(`📤 Message sent to ${payload.to}: ${msgId}`);
      this.messagesSent++;

      // If we thought the token was expired but it worked, update status
      if (this.tokenValid === false) {
        this.tokenValid = true;
        this.lastError = null;
        this.logger.log('✅ Token appears valid again!');
      }

      return { success: true, data: response.data };
    } catch (error: any) {
      this.messagesFailed++;
      this.consecutiveFailures++;

      const axiosErr = error as AxiosError<any>;
      const status = axiosErr.response?.status;
      const errData = axiosErr.response?.data || error.message;
      const errMsg =
        axiosErr.response?.data?.error?.message || error.message;

      // Detect token expiration
      const isAuthError = status === 401;
      const isOAuthError =
        axiosErr.response?.data?.error?.code === 190 ||
        axiosErr.response?.data?.error?.type === 'OAuthException';

      if (isAuthError || isOAuthError) {
        this.tokenValid = false;
        this.lastError = `Token expired/invalid: ${errMsg}`;
        this.lastTokenCheck = new Date().toISOString();

        this.logger.error(
          '\n' +
            '╔══════════════════════════════════════════════════════════════╗\n' +
            '║  🔴 WHATSAPP TOKEN EXPIRADO O INVÁLIDO                     ║\n' +
            '║                                                            ║\n' +
            '║  Los mensajes NO se están enviando.                        ║\n' +
            '║                                                            ║\n' +
            '║  → Ve a developers.facebook.com                            ║\n' +
            '║  → Tu App → WhatsApp → API Setup                          ║\n' +
            '║  → Genera un nuevo token                                   ║\n' +
            '║  → Actualiza WHATSAPP_TOKEN en backend/.env                ║\n' +
            '║  → Reinicia el backend                                     ║\n' +
            '╚══════════════════════════════════════════════════════════════╝',
        );

        this.eventEmitter.emit('whatsapp.token.invalid', {
          error: errMsg,
          status,
          timestamp: new Date().toISOString(),
        });

        return { success: false, error: errData, tokenExpired: true };
      }

      // Log other errors clearly
      this.lastError = errMsg;
      this.logger.error(
        `❌ Error sending to ${payload.to} (HTTP ${status}): ${errMsg}`,
      );

      // Alert if we're seeing many consecutive failures
      if (this.consecutiveFailures === 5) {
        this.logger.error(
          '🔴 5 CONSECUTIVE FAILURES — WhatsApp may be experiencing issues!',
        );
      }

      return {
        success: false,
        error: { ...errData, status },
      };
    }
  }

  // ─── Media download (for voice notes, images, etc.) ─────

  /**
   * Resolve a WhatsApp media ID to a download URL.
   * GET https://graph.facebook.com/v21.0/{media-id}
   */
  async getMediaUrl(mediaId: string): Promise<string | null> {
    if (!this.isEnabled || !this.accessToken) return null;

    try {
      const response = await axios.get(`${this.apiUrl}/${mediaId}`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
        timeout: 10_000,
      });
      return response.data?.url || null;
    } catch (error: any) {
      this.logger.error(
        `Failed to resolve media URL for ${mediaId}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Download media bytes from a WhatsApp media URL.
   * The URL comes from getMediaUrl() and requires the same bearer token.
   */
  async downloadMedia(url: string): Promise<Buffer | null> {
    if (!this.accessToken) return null;

    try {
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
        responseType: 'arraybuffer',
        timeout: 30_000,
      });
      return Buffer.from(response.data);
    } catch (error: any) {
      this.logger.error(`Failed to download media: ${error.message}`);
      return null;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
