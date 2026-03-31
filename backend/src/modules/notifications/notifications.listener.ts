import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

/**
 * Listens for domain events and sends push + in-app notifications.
 * Works alongside the existing WhatsApp listeners — push for users with
 * the app installed, WhatsApp for those without.
 */
@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger('NotificationsListener');

  constructor(
    private notifications: NotificationsService,
    private prisma: PrismaService,
  ) {}

  @OnEvent('booking.created')
  async onBookingCreated(payload: { bookingId: string }) {
    try {
      const booking = await this.prisma.booking.findUnique({
        where: { id: payload.bookingId },
        include: {
          category: { select: { name: true, icon: true } },
          customer: { select: { id: true, name: true } },
          provider: {
            select: { userId: true, user: { select: { name: true } } },
          },
        },
      });
      if (!booking?.provider) return;

      await this.notifications.notifyUser(
        booking.provider.userId,
        'booking_update',
        'Nuevo trabajo disponible',
        `${booking.customer?.name || 'Un cliente'} solicita ${booking.category?.name || 'un servicio'}`,
        {
          bookingId: booking.id,
          url: `/provider/jobs`,
        },
      );
    } catch (error: any) {
      this.logger.error(`onBookingCreated push failed: ${error.message}`);
    }
  }

  @OnEvent('booking.responded')
  async onBookingResponded(payload: {
    bookingId: string;
    status?: string;
    providerName?: string;
  }) {
    try {
      const booking = await this.prisma.booking.findUnique({
        where: { id: payload.bookingId },
        include: {
          customer: { select: { id: true } },
          provider: {
            select: { user: { select: { name: true } } },
          },
          category: { select: { name: true } },
        },
      });
      if (!booking) return;

      const providerName =
        payload.providerName ||
        booking.provider?.user?.name ||
        'Tu proveedor';

      if (payload.status === 'ACCEPTED' || booking.status === 'ACCEPTED') {
        await this.notifications.notifyUser(
          booking.customerId,
          'booking_update',
          'Trabajo aceptado',
          `${providerName} aceptó tu solicitud de ${booking.category?.name || 'servicio'}`,
          { bookingId: booking.id, url: `/bookings/${booking.id}` },
        );
      } else if (
        payload.status === 'REJECTED' ||
        booking.status === 'REJECTED'
      ) {
        await this.notifications.notifyUser(
          booking.customerId,
          'booking_update',
          'Solicitud rechazada',
          `${providerName} no puede tomar tu solicitud en este momento`,
          { bookingId: booking.id, url: `/bookings` },
        );
      }
    } catch (error: any) {
      this.logger.error(`onBookingResponded push failed: ${error.message}`);
    }
  }

  @OnEvent('booking.status.changed')
  async onBookingStatusChanged(payload: {
    bookingId: string;
    status: string;
    customerId?: string;
    providerName?: string;
  }) {
    try {
      const booking = await this.prisma.booking.findUnique({
        where: { id: payload.bookingId },
        include: {
          customer: { select: { id: true, name: true } },
          provider: {
            select: {
              userId: true,
              user: { select: { name: true } },
            },
          },
        },
      });
      if (!booking) return;

      const providerName =
        payload.providerName ||
        booking.provider?.user?.name ||
        'Tu proveedor';

      const statusNotifications: Record<
        string,
        { title: string; body: string }
      > = {
        PROVIDER_ARRIVING: {
          title: 'Proveedor en camino',
          body: `${providerName} va en camino a tu ubicación`,
        },
        IN_PROGRESS: {
          title: 'Trabajo en progreso',
          body: `${providerName} ha iniciado el trabajo`,
        },
        COMPLETED: {
          title: 'Trabajo completado',
          body: `${providerName} terminó el trabajo. ¡No olvides calificar!`,
        },
        CANCELLED: {
          title: 'Solicitud cancelada',
          body: 'Tu solicitud de servicio fue cancelada',
        },
      };

      const notifData = statusNotifications[payload.status];
      if (notifData) {
        await this.notifications.notifyUser(
          booking.customerId,
          'booking_update',
          notifData.title,
          notifData.body,
          { bookingId: booking.id, url: `/bookings/${booking.id}` },
        );
      }
    } catch (error: any) {
      this.logger.error(
        `onBookingStatusChanged push failed: ${error.message}`,
      );
    }
  }

  @OnEvent('message.created')
  async onNewMessage(payload: {
    bookingId: string;
    senderId: string;
    recipientId: string;
    senderName?: string;
    content?: string;
  }) {
    try {
      const prefs = await this.notifications.getPreferences(
        payload.recipientId,
      );
      if (!prefs.messages) return;

      const preview =
        payload.content && payload.content.length > 60
          ? payload.content.substring(0, 60) + '...'
          : payload.content || 'Nuevo mensaje';

      await this.notifications.notifyUser(
        payload.recipientId,
        'message',
        payload.senderName || 'Nuevo mensaje',
        preview,
        { bookingId: payload.bookingId, url: `/chat/${payload.bookingId}` },
      );
    } catch (error: any) {
      this.logger.error(`onNewMessage push failed: ${error.message}`);
    }
  }

  @OnEvent('rating.created')
  async onRatingCreated(payload: {
    toUserId: string;
    fromUserName?: string;
    score: number;
  }) {
    try {
      await this.notifications.notifyUser(
        payload.toUserId,
        'rating',
        'Nueva calificación',
        `${payload.fromUserName || 'Un usuario'} te calificó con ${payload.score} estrella${payload.score !== 1 ? 's' : ''}`,
        { url: '/profile' },
      );
    } catch (error: any) {
      this.logger.error(`onRatingCreated push failed: ${error.message}`);
    }
  }
}
