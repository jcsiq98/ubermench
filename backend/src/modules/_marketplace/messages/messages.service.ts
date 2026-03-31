import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { WhatsAppService } from '../../whatsapp/whatsapp.service';
import { MessagesGateway } from './messages.gateway';
import { BookingStatus, SenderType, MessageChannel } from '@prisma/client';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private prisma: PrismaService,
    private whatsapp: WhatsAppService,
    private messagesGateway: MessagesGateway,
  ) {}

  /**
   * Send a message from the app (customer → provider via WhatsApp bridge).
   */
  async sendFromApp(bookingId: string, senderId: string, content: string) {
    // 1. Load booking and validate
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        provider: {
          include: {
            user: { select: { id: true, name: true, phone: true } },
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // 2. Verify the sender is a participant
    const providerUserId = booking.provider?.user?.id;
    const isCustomer = booking.customerId === senderId;
    const isProvider = providerUserId === senderId;

    if (!isCustomer && !isProvider) {
      throw new ForbiddenException('You are not a participant in this booking');
    }

    // 3. Booking must be active to chat
    const chatAllowed: BookingStatus[] = [
      BookingStatus.ACCEPTED,
      BookingStatus.PROVIDER_ARRIVING,
      BookingStatus.IN_PROGRESS,
    ];

    if (!chatAllowed.includes(booking.status)) {
      throw new BadRequestException(
        `Cannot send messages when booking status is "${booking.status}". Chat is only available for active bookings.`,
      );
    }

    // 4. Save message in DB
    const senderType = isCustomer ? SenderType.CUSTOMER : SenderType.PROVIDER;

    const message = await this.prisma.message.create({
      data: {
        bookingId,
        senderId,
        senderType,
        content,
        channel: MessageChannel.APP,
      },
      include: {
        sender: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
    });

    const formattedMessage = this.formatMessage(message);

    // 5. Emit via WebSocket for real-time delivery
    this.messagesGateway.sendNewMessage(bookingId, formattedMessage);

    // Also send to the other participant's user room (in case they're not in the booking room)
    if (isCustomer && providerUserId) {
      this.messagesGateway.sendMessageToUser(providerUserId, formattedMessage);
    } else if (isProvider) {
      this.messagesGateway.sendMessageToUser(booking.customerId, formattedMessage);
    }

    // 6. Bridge to WhatsApp: forward to the other party
    if (isCustomer && booking.provider?.user?.phone) {
      // Customer → Provider via WhatsApp
      const customerName = booking.customer?.name || 'Cliente';
      const waText = `💬 *${customerName}* dice:\n"${content}"`;
      await this.whatsapp.sendTextMessage(
        booking.provider.user.phone,
        waText,
      );
      this.logger.log(
        `Bridged app→WA: customer ${senderId} → provider ${booking.provider.user.phone}`,
      );
    }

    return formattedMessage;
  }

  /**
   * Save a message from WhatsApp (provider → customer via app bridge).
   * Called by the WhatsApp webhook handler.
   */
  async saveFromWhatsApp(
    bookingId: string,
    senderUserId: string,
    content: string,
    waMessageId?: string,
  ) {
    const message = await this.prisma.message.create({
      data: {
        bookingId,
        senderId: senderUserId,
        senderType: SenderType.PROVIDER,
        content,
        channel: MessageChannel.WHATSAPP,
        waMessageId,
      },
      include: {
        sender: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
    });

    const formatted = this.formatMessage(message);

    // Emit via WebSocket so the customer sees the message in real-time
    this.messagesGateway.sendNewMessage(bookingId, formatted);

    // Also send to the customer's user room
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { customerId: true },
    });
    if (booking) {
      this.messagesGateway.sendMessageToUser(booking.customerId, formatted);
    }

    return formatted;
  }

  /**
   * Create a system message (e.g. "Chat started", "Service completed").
   */
  async createSystemMessage(bookingId: string, content: string) {
    // Use the first participant as sender for system messages
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { customerId: true },
    });

    if (!booking) return null;

    const message = await this.prisma.message.create({
      data: {
        bookingId,
        senderId: booking.customerId,
        senderType: SenderType.SYSTEM,
        content,
        channel: MessageChannel.APP,
      },
      include: {
        sender: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
    });

    return this.formatMessage(message);
  }

  /**
   * Get message history for a booking.
   */
  async getHistory(
    bookingId: string,
    userId: string,
    options?: { limit?: number; before?: string },
  ) {
    const { limit = 50, before } = options || {};

    // 1. Verify booking exists and user is participant
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        provider: {
          include: {
            user: { select: { id: true } },
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const providerUserId = booking.provider?.user?.id;
    if (booking.customerId !== userId && providerUserId !== userId) {
      throw new ForbiddenException('You are not a participant in this booking');
    }

    // 2. Query messages (newest first, then reverse for display)
    const where: Record<string, unknown> = { bookingId };
    if (before) {
      where.createdAt = { lt: new Date(before) };
    }

    const messages = await this.prisma.message.findMany({
      where,
      include: {
        sender: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // 3. Mark unread messages as read
    const unreadIds = messages
      .filter((m) => m.senderId !== userId && !m.readAt)
      .map((m) => m.id);

    if (unreadIds.length > 0) {
      await this.prisma.message.updateMany({
        where: { id: { in: unreadIds } },
        data: { readAt: new Date() },
      });
    }

    // Return in chronological order
    const sorted = messages.reverse();

    return {
      data: sorted.map((m) => this.formatMessage(m)),
      hasMore: messages.length === limit,
    };
  }

  /**
   * Count unread messages for a user across all their bookings.
   */
  async countUnread(userId: string): Promise<number> {
    // Get all bookings the user is involved in
    const bookings = await this.prisma.booking.findMany({
      where: {
        OR: [
          { customerId: userId },
          { provider: { user: { id: userId } } },
        ],
      },
      select: { id: true },
    });

    const bookingIds = bookings.map((b) => b.id);

    return this.prisma.message.count({
      where: {
        bookingId: { in: bookingIds },
        senderId: { not: userId },
        readAt: null,
      },
    });
  }

  /**
   * Count unread messages for a specific booking.
   */
  async countUnreadForBooking(
    bookingId: string,
    userId: string,
  ): Promise<number> {
    return this.prisma.message.count({
      where: {
        bookingId,
        senderId: { not: userId },
        readAt: null,
      },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private formatMessage(message: any) {
    return {
      id: message.id,
      bookingId: message.bookingId,
      senderId: message.senderId,
      senderType: message.senderType,
      senderName: message.sender?.name || null,
      senderAvatar: message.sender?.avatarUrl || null,
      content: message.content,
      channel: message.channel,
      readAt: message.readAt,
      createdAt: message.createdAt,
    };
  }
}

