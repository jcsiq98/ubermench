import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class SafetyService {
  private readonly logger = new Logger(SafetyService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  // ─── Service Photos ────────────────────────────────────────

  async uploadServicePhoto(
    userId: string,
    bookingId: string,
    data: { type: 'BEFORE' | 'AFTER' | 'EVIDENCE'; url: string; caption?: string },
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        provider: { include: { user: { select: { id: true } } } },
      },
    });

    if (!booking) throw new NotFoundException('Booking not found');

    const isProvider = booking.provider?.user?.id === userId;
    const isCustomer = booking.customerId === userId;

    if (!isProvider && !isCustomer) {
      throw new ForbiddenException('Not a participant');
    }

    // BEFORE photos only when IN_PROGRESS, AFTER only when completing
    if (data.type === 'BEFORE') {
      const validStatuses = ['ACCEPTED', 'PROVIDER_ARRIVING', 'IN_PROGRESS'];
      if (!validStatuses.includes(booking.status)) {
        throw new BadRequestException(
          'Before photos can only be uploaded when the job is active',
        );
      }
    }

    if (data.type === 'AFTER') {
      const validStatuses = ['IN_PROGRESS', 'COMPLETED', 'RATED'];
      if (!validStatuses.includes(booking.status)) {
        throw new BadRequestException(
          'After photos can only be uploaded when the job is in progress or completed',
        );
      }
    }

    const photo = await this.prisma.servicePhoto.create({
      data: {
        bookingId,
        uploaderId: userId,
        type: data.type,
        url: data.url,
        caption: data.caption,
      },
    });

    this.logger.log(
      `Service photo uploaded: ${data.type} for booking ${bookingId} by ${userId}`,
    );

    return photo;
  }

  async getServicePhotos(bookingId: string, userId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { provider: { include: { user: { select: { id: true } } } } },
    });

    if (!booking) throw new NotFoundException('Booking not found');

    const isParticipant =
      booking.customerId === userId ||
      booking.provider?.user?.id === userId;

    if (!isParticipant) {
      throw new ForbiddenException('Not a participant');
    }

    return this.prisma.servicePhoto.findMany({
      where: { bookingId },
      orderBy: { createdAt: 'asc' },
      include: {
        uploader: { select: { id: true, name: true } },
      },
    });
  }

  // ─── GPS Tracking ──────────────────────────────────────────

  async updateProviderLocation(
    userId: string,
    data: { lat: number; lng: number; accuracy?: number; bookingId?: string },
  ) {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId },
    });

    if (!profile) throw new NotFoundException('Provider profile not found');

    const location = await this.prisma.providerLocation.upsert({
      where: { providerId: profile.id },
      update: {
        lat: data.lat,
        lng: data.lng,
        accuracy: data.accuracy,
        bookingId: data.bookingId,
        updatedAt: new Date(),
      },
      create: {
        providerId: profile.id,
        lat: data.lat,
        lng: data.lng,
        accuracy: data.accuracy,
        bookingId: data.bookingId,
      },
    });

    // Also update the provider profile coordinates
    await this.prisma.providerProfile.update({
      where: { id: profile.id },
      data: { locationLat: data.lat, locationLng: data.lng },
    });

    // Emit for real-time updates via WebSocket
    if (data.bookingId) {
      this.eventEmitter.emit('provider.location.updated', {
        bookingId: data.bookingId,
        providerId: profile.id,
        lat: data.lat,
        lng: data.lng,
      });
    }

    return location;
  }

  async getProviderLocation(bookingId: string, userId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        provider: { select: { id: true, userId: true } },
      },
    });

    if (!booking) throw new NotFoundException('Booking not found');

    if (booking.customerId !== userId) {
      throw new ForbiddenException('Only the customer can track the provider');
    }

    const activeStatuses = ['ACCEPTED', 'PROVIDER_ARRIVING', 'IN_PROGRESS'];
    if (!activeStatuses.includes(booking.status)) {
      throw new BadRequestException(
        'Location tracking is only available during active service',
      );
    }

    if (!booking.provider) {
      throw new NotFoundException('No provider assigned');
    }

    const location = await this.prisma.providerLocation.findUnique({
      where: { providerId: booking.provider.id },
    });

    if (!location) {
      return { available: false, message: 'Provider location not available yet' };
    }

    return {
      available: true,
      lat: location.lat,
      lng: location.lng,
      accuracy: location.accuracy,
      updatedAt: location.updatedAt,
    };
  }

  // ─── Emergency Contacts ────────────────────────────────────

  async getEmergencyContacts(userId: string) {
    return this.prisma.emergencyContact.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addEmergencyContact(
    userId: string,
    data: { name: string; phone: string; relation?: string },
  ) {
    const count = await this.prisma.emergencyContact.count({
      where: { userId },
    });

    if (count >= 3) {
      throw new BadRequestException('Maximum 3 emergency contacts allowed');
    }

    return this.prisma.emergencyContact.create({
      data: {
        userId,
        name: data.name,
        phone: data.phone,
        relation: data.relation,
      },
    });
  }

  async removeEmergencyContact(userId: string, contactId: string) {
    const contact = await this.prisma.emergencyContact.findUnique({
      where: { id: contactId },
    });

    if (!contact || contact.userId !== userId) {
      throw new NotFoundException('Emergency contact not found');
    }

    await this.prisma.emergencyContact.delete({
      where: { id: contactId },
    });

    return { success: true };
  }

  // ─── SOS Alert ─────────────────────────────────────────────

  async triggerSos(
    userId: string,
    data: { bookingId: string; lat?: number; lng?: number },
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: data.bookingId },
      include: {
        provider: {
          include: { user: { select: { id: true, name: true, phone: true } } },
        },
        customer: { select: { id: true, name: true, phone: true } },
      },
    });

    if (!booking) throw new NotFoundException('Booking not found');

    const isParticipant =
      booking.customerId === userId ||
      booking.provider?.user?.id === userId;

    if (!isParticipant) {
      throw new ForbiddenException('Not a participant');
    }

    const alert = await this.prisma.sosAlert.create({
      data: {
        bookingId: data.bookingId,
        triggeredBy: userId,
        lat: data.lat,
        lng: data.lng,
        status: 'active',
      },
    });

    this.logger.warn(
      `SOS ALERT triggered by ${userId} for booking ${data.bookingId}`,
    );

    // Get emergency contacts
    const contacts = await this.prisma.emergencyContact.findMany({
      where: { userId },
    });

    const triggerUser =
      booking.customerId === userId
        ? booking.customer
        : booking.provider?.user;

    // Emit event for notifications
    this.eventEmitter.emit('sos.triggered', {
      alertId: alert.id,
      bookingId: data.bookingId,
      triggeredBy: userId,
      triggerUserName: triggerUser?.name,
      triggerUserPhone: triggerUser?.phone,
      lat: data.lat,
      lng: data.lng,
      emergencyContacts: contacts,
      booking: {
        address: booking.address,
        description: booking.description,
        customerName: booking.customer.name,
        providerName: booking.provider?.user?.name,
      },
    });

    return {
      alertId: alert.id,
      status: 'active',
      contactsNotified: contacts.length,
    };
  }

  async resolveSos(alertId: string, userId: string) {
    const alert = await this.prisma.sosAlert.findUnique({
      where: { id: alertId },
    });

    if (!alert) throw new NotFoundException('SOS alert not found');
    if (alert.triggeredBy !== userId) {
      throw new ForbiddenException('Only the person who triggered the alert can resolve it');
    }

    return this.prisma.sosAlert.update({
      where: { id: alertId },
      data: { status: 'resolved', resolvedAt: new Date() },
    });
  }
}
