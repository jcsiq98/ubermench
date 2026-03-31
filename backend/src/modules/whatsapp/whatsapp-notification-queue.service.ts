import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../config/redis.service';

/**
 * Tracks failed WhatsApp notifications and provides an in-app fallback.
 *
 * When a WhatsApp message fails to send (token expired, network error, etc.),
 * the notification is stored in Redis so the provider can see it when they
 * open the app or hit the API.
 *
 * This ensures that even if WhatsApp is down, providers still receive
 * their booking notifications through the app.
 */
@Injectable()
export class WhatsAppNotificationQueueService {
  private readonly logger = new Logger(WhatsAppNotificationQueueService.name);

  private static readonly QUEUE_PREFIX = 'wa_failed_notif:';
  private static readonly QUEUE_TTL = 86400; // 24h

  constructor(
    private redis: RedisService,
    private prisma: PrismaService,
  ) {}

  // ─── Listen for failed sends ──────────────────────────────

  @OnEvent('whatsapp.send.failed')
  async handleSendFailed(payload: {
    payload: Record<string, any>;
    error: any;
    description: string;
    timestamp: string;
  }) {
    const to = payload.payload?.to;
    if (!to) return;

    this.logger.warn(
      `📋 Queuing failed notification for ${to}: ${payload.description}`,
    );

    // Store the failed notification
    const notification = {
      to,
      message: payload.payload?.text?.body || payload.description,
      error: typeof payload.error === 'string' ? payload.error : JSON.stringify(payload.error),
      timestamp: payload.timestamp,
      type: payload.payload?.type || 'text',
    };

    try {
      const key = `${WhatsAppNotificationQueueService.QUEUE_PREFIX}${to}`;
      const existing = await this.redis.get(key);
      const queue: any[] = existing ? JSON.parse(existing) : [];
      queue.push(notification);

      // Keep only last 20 notifications
      while (queue.length > 20) queue.shift();

      await this.redis.set(
        key,
        JSON.stringify(queue),
        WhatsAppNotificationQueueService.QUEUE_TTL,
      );
    } catch (err: any) {
      this.logger.error(`Failed to queue notification: ${err.message}`);
    }
  }

  // ─── Listen for token invalidation ────────────────────────

  @OnEvent('whatsapp.token.invalid')
  async handleTokenInvalid(payload: {
    error: string;
    status: number;
    timestamp: string;
  }) {
    this.logger.error(
      `🔴 WhatsApp token invalid event received: ${payload.error}`,
    );

    // Find all providers and create in-app alerts
    try {
      const providers = await this.prisma.user.findMany({
        where: { role: 'PROVIDER' },
        select: { id: true, phone: true },
      });

      this.logger.warn(
        `⚠️  ${providers.length} providers may miss WhatsApp notifications until the token is renewed.`,
      );
    } catch (err: any) {
      this.logger.error(`Error checking providers: ${err.message}`);
    }
  }

  // ─── Public API ───────────────────────────────────────────

  /**
   * Get pending/failed notifications for a phone number.
   * Used by the health endpoint and potentially by the app.
   */
  async getPendingNotifications(phone: string): Promise<any[]> {
    try {
      const normalized = phone.replace(/\D/g, '');
      const key = `${WhatsAppNotificationQueueService.QUEUE_PREFIX}${normalized}`;
      const raw = await this.redis.get(key);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /**
   * Clear pending notifications for a phone number.
   */
  async clearPendingNotifications(phone: string): Promise<void> {
    const normalized = phone.replace(/\D/g, '');
    await this.redis.del(
      `${WhatsAppNotificationQueueService.QUEUE_PREFIX}${normalized}`,
    );
  }
}

