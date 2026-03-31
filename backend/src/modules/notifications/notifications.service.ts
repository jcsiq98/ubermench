import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { QueueService } from '../../common/queues/queue.service';
import { QUEUE_NAMES } from '../../common/queues/queue.constants';

interface SendPushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('NotificationsService');
  private firebaseApp: any = null;
  private messaging: any = null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private queueService: QueueService,
  ) {
    this.initFirebase();
  }

  private async initFirebase() {
    const projectId = this.config.get('FIREBASE_PROJECT_ID');
    const clientEmail = this.config.get('FIREBASE_CLIENT_EMAIL');
    const privateKey = this.config.get('FIREBASE_PRIVATE_KEY');

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn(
        'Firebase credentials not configured — push notifications disabled',
      );
      return;
    }

    try {
      const admin = await import('firebase-admin');

      if (admin.apps.length === 0) {
        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey: privateKey.replace(/\\n/g, '\n'),
          }),
        });
      } else {
        this.firebaseApp = admin.apps[0];
      }

      this.messaging = admin.messaging();
      this.logger.log('Firebase Admin initialized — push notifications enabled');
    } catch (error: any) {
      this.logger.error(`Firebase init failed: ${error.message}`);
    }
  }

  isPushEnabled(): boolean {
    return this.messaging !== null;
  }

  // ─── Device Tokens ──────────────────────────────────────────

  async registerDeviceToken(
    userId: string,
    token: string,
    platform: string = 'web',
  ) {
    return this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, token, platform, isActive: true },
      update: { userId, platform, isActive: true, updatedAt: new Date() },
    });
  }

  async removeDeviceToken(token: string) {
    return this.prisma.deviceToken
      .delete({ where: { token } })
      .catch(() => null);
  }

  async getActiveTokens(userId: string): Promise<string[]> {
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId, isActive: true },
      select: { token: true },
    });
    return tokens.map((t) => t.token);
  }

  // ─── Notification Preferences ───────────────────────────────

  async getPreferences(userId: string) {
    let prefs = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!prefs) {
      prefs = await this.prisma.notificationPreference.create({
        data: { userId },
      });
    }

    return prefs;
  }

  async updatePreferences(
    userId: string,
    data: {
      bookingUpdates?: boolean;
      messages?: boolean;
      promotions?: boolean;
      weeklyReport?: boolean;
      pushEnabled?: boolean;
      whatsappEnabled?: boolean;
    },
  ) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  // ─── In-App Notifications ──────────────────────────────────

  async createNotification(
    userId: string,
    type: string,
    title: string,
    body: string,
    data?: Record<string, any>,
    imageUrl?: string,
  ) {
    return this.prisma.notification.create({
      data: { userId, type, title, body, data, imageUrl },
    });
  }

  async getNotifications(
    userId: string,
    params: { limit?: number; offset?: number; unreadOnly?: boolean } = {},
  ) {
    const { limit = 20, offset = 0, unreadOnly = false } = params;

    const where: any = { userId };
    if (unreadOnly) where.readAt = null;

    const [data, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { userId, readAt: null },
      }),
    ]);

    return { data, total, unreadCount, limit, offset };
  }

  async markAsRead(userId: string, notificationId: string) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, readAt: null },
    });
  }

  // ─── Push Notification Sending ─────────────────────────────

  async sendPushToUser(userId: string, payload: SendPushPayload) {
    if (!this.messaging) {
      this.logger.debug('Push disabled — skipping');
      return;
    }

    const prefs = await this.getPreferences(userId);
    if (!prefs.pushEnabled) {
      this.logger.debug(`Push disabled for user ${userId}`);
      return;
    }

    const tokens = await this.getActiveTokens(userId);
    if (tokens.length === 0) {
      this.logger.debug(`No active tokens for user ${userId}`);
      return;
    }

    await this.sendToTokens(tokens, payload);
  }

  private async sendToTokens(tokens: string[], payload: SendPushPayload) {
    if (!this.messaging || tokens.length === 0) return;

    const message: any = {
      notification: {
        title: payload.title,
        body: payload.body,
      },
      webpush: {
        notification: {
          icon: '/icons/icon-192.svg',
          badge: '/icons/icon-192.svg',
          vibrate: [100, 50, 100],
          ...(payload.imageUrl ? { image: payload.imageUrl } : {}),
        },
        fcmOptions: {
          link: payload.data?.url || '/',
        },
      },
      data: payload.data || {},
    };

    const invalidTokens: string[] = [];

    for (const token of tokens) {
      try {
        await this.messaging.send({ ...message, token });
      } catch (error: any) {
        if (
          error.code === 'messaging/registration-token-not-registered' ||
          error.code === 'messaging/invalid-registration-token'
        ) {
          invalidTokens.push(token);
        } else {
          this.logger.error(`Push send failed: ${error.message}`);
        }
      }
    }

    if (invalidTokens.length > 0) {
      await this.prisma.deviceToken.updateMany({
        where: { token: { in: invalidTokens } },
        data: { isActive: false },
      });
      this.logger.debug(
        `Deactivated ${invalidTokens.length} invalid FCM token(s)`,
      );
    }
  }

  // ─── Hybrid Notification (Push + In-App + optional WA) ─────

  async notifyUser(
    userId: string,
    type: string,
    title: string,
    body: string,
    data?: Record<string, any>,
    imageUrl?: string,
  ) {
    const notification = await this.createNotification(
      userId,
      type,
      title,
      body,
      data,
      imageUrl,
    );

    await this.sendPushToUser(userId, {
      title,
      body,
      data: {
        type,
        notificationId: notification.id,
        ...(data
          ? Object.fromEntries(
              Object.entries(data).map(([k, v]) => [k, String(v)]),
            )
          : {}),
      },
      imageUrl: imageUrl || undefined,
    });

    return notification;
  }

  async shouldUseWhatsApp(userId: string): Promise<boolean> {
    const tokens = await this.getActiveTokens(userId);
    return tokens.length === 0;
  }
}
