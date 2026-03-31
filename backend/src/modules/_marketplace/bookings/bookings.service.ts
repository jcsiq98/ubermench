import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { BookingStatus } from '@prisma/client';
import { CreateBookingDto } from './dto/create-booking.dto';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Create a new booking / service request.
   */
  async create(customerId: string, dto: CreateBookingDto) {
    // Validate provider exists
    const provider = await this.prisma.providerProfile.findUnique({
      where: { id: dto.providerId },
      include: {
        user: { select: { id: true, name: true, isActive: true } },
      },
    });

    if (!provider || !provider.user.isActive) {
      throw new NotFoundException('Provider not found');
    }

    // Validate category exists
    const category = await this.prisma.serviceCategory.findUnique({
      where: { id: dto.categoryId },
    });

    if (!category || !category.isActive) {
      throw new NotFoundException('Service category not found');
    }

    // Prevent duplicate: check if customer has a PENDING booking for same provider
    const existing = await this.prisma.booking.findFirst({
      where: {
        customerId,
        providerId: dto.providerId,
        status: BookingStatus.PENDING,
      },
    });

    if (existing) {
      throw new ConflictException(
        'You already have a pending request to this provider',
      );
    }

    // Create booking
    const booking = await this.prisma.booking.create({
      data: {
        customerId,
        providerId: dto.providerId,
        categoryId: dto.categoryId,
        description: dto.description,
        address: dto.address,
        locationLat: dto.lat,
        locationLng: dto.lng,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        status: BookingStatus.PENDING,
      },
      include: {
        provider: {
          include: {
            user: {
              select: { id: true, name: true, avatarUrl: true, phone: true },
            },
          },
        },
        category: true,
        customer: {
          select: { id: true, name: true, avatarUrl: true, phone: true },
        },
      },
    });

    // Emit event so the WhatsApp module can notify the provider
    this.eventEmitter.emit('booking.created', { bookingId: booking.id });
    this.logger.log(`Booking ${booking.id} created, event emitted`);

    return this.formatBooking(booking);
  }

  /**
   * List bookings for a user (as customer by default).
   * Supports filtering by status.
   */
  async listByCustomer(
    customerId: string,
    filter?: {
      status?: 'active' | 'completed' | 'cancelled';
      limit?: number;
      offset?: number;
    },
  ) {
    const { status, limit = 20, offset = 0 } = filter || {};

    // Map UI filter to DB statuses
    let statusFilter: BookingStatus[] | undefined;
    switch (status) {
      case 'active':
        statusFilter = [
          BookingStatus.PENDING,
          BookingStatus.ACCEPTED,
          BookingStatus.PROVIDER_ARRIVING,
          BookingStatus.IN_PROGRESS,
        ];
        break;
      case 'completed':
        statusFilter = [BookingStatus.COMPLETED, BookingStatus.RATED];
        break;
      case 'cancelled':
        statusFilter = [BookingStatus.CANCELLED, BookingStatus.REJECTED];
        break;
    }

    const where = {
      customerId,
      ...(statusFilter ? { status: { in: statusFilter } } : {}),
    };

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        include: {
          provider: {
            include: {
              user: {
                select: { id: true, name: true, avatarUrl: true },
              },
            },
          },
          category: true,
          customer: {
            select: { id: true, name: true, avatarUrl: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.booking.count({ where }),
    ]);

    return {
      data: bookings.map((b) => this.formatBooking(b)),
      total,
      limit,
      offset,
    };
  }

  /**
   * Get a single booking by ID — only if the requester is a participant.
   */
  async getById(bookingId: string, userId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        provider: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatarUrl: true,
                phone: true,
                ratingAverage: true,
                ratingCount: true,
              },
            },
          },
        },
        category: true,
        customer: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            phone: true,
            ratingAverage: true,
            ratingCount: true,
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // Only the customer or the provider user can view this booking
    const providerUserId = booking.provider?.user?.id;
    if (booking.customerId !== userId && providerUserId !== userId) {
      throw new ForbiddenException('You are not a participant of this booking');
    }

    return this.formatBooking(booking);
  }

  /**
   * Cancel a booking — only the customer can cancel, and only from PENDING or ACCEPTED.
   */
  async cancel(bookingId: string, userId: string, reason?: string) {
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

    if (booking.customerId !== userId) {
      throw new ForbiddenException('Only the customer can cancel a booking');
    }

    const cancellableStatuses: BookingStatus[] = [
      BookingStatus.PENDING,
      BookingStatus.ACCEPTED,
    ];

    if (!cancellableStatuses.includes(booking.status)) {
      throw new BadRequestException(
        `Cannot cancel a booking with status "${booking.status}". Only PENDING or ACCEPTED bookings can be cancelled.`,
      );
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: reason || null,
      },
      include: {
        provider: {
          include: {
            user: {
              select: { id: true, name: true, avatarUrl: true },
            },
          },
        },
        category: true,
        customer: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
    });

    return this.formatBooking(updated);
  }

  /**
   * Dismiss (soft-delete) a cancelled or rejected booking from the customer's history.
   */
  async dismiss(bookingId: string, userId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.customerId !== userId) {
      throw new ForbiddenException('Only the customer can dismiss a booking');
    }

    const dismissableStatuses: BookingStatus[] = [
      BookingStatus.CANCELLED,
      BookingStatus.REJECTED,
      BookingStatus.COMPLETED,
      BookingStatus.RATED,
    ];

    if (!dismissableStatuses.includes(booking.status)) {
      throw new BadRequestException(
        'Solo puedes eliminar solicitudes canceladas, rechazadas o completadas.',
      );
    }

    await this.prisma.booking.delete({
      where: { id: bookingId },
    });

    return { success: true, message: 'Solicitud eliminada' };
  }

  /**
   * Update booking status (used internally and by WebSocket gateway).
   */
  async updateStatus(bookingId: string, status: BookingStatus) {
    const data: Record<string, unknown> = { status };

    if (status === BookingStatus.COMPLETED) {
      data.completedAt = new Date();
    }
    if (status === BookingStatus.CANCELLED) {
      data.cancelledAt = new Date();
    }

    const booking = await this.prisma.booking.update({
      where: { id: bookingId },
      data,
      include: {
        provider: {
          include: {
            user: {
              select: { id: true, name: true, avatarUrl: true },
            },
          },
        },
        category: true,
        customer: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
    });

    return this.formatBooking(booking);
  }

  /**
   * Format a booking record into a clean API response.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private formatBooking(booking: any) {
    return {
      id: booking.id,
      status: booking.status,
      description: booking.description,
      address: booking.address,
      locationLat: booking.locationLat,
      locationLng: booking.locationLng,
      scheduledAt: booking.scheduledAt,
      price: booking.price,
      completedAt: booking.completedAt,
      cancelledAt: booking.cancelledAt,
      cancelReason: booking.cancelReason,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
      category: booking.category
        ? {
            id: booking.category.id,
            name: booking.category.name,
            slug: booking.category.slug,
            icon: booking.category.icon,
          }
        : null,
      provider: booking.provider
        ? {
            id: booking.provider.id,
            name: booking.provider.user?.name,
            avatarUrl: booking.provider.user?.avatarUrl,
            userId: booking.provider.user?.id,
            ratingAverage: booking.provider.user?.ratingAverage,
            ratingCount: booking.provider.user?.ratingCount,
            phone: booking.provider.user?.phone,
          }
        : null,
      customer: booking.customer
        ? {
            id: booking.customer.id,
            name: booking.customer.name,
            avatarUrl: booking.customer.avatarUrl,
            ratingAverage: booking.customer.ratingAverage,
            ratingCount: booking.customer.ratingCount,
            phone: booking.customer.phone,
          }
        : null,
    };
  }
}


