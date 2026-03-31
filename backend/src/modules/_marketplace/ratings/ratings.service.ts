import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { BookingStatus } from '@prisma/client';
import { CreateRatingDto } from './dto/create-rating.dto';

@Injectable()
export class RatingsService {
  private readonly logger = new Logger(RatingsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Rate a booking participant (customer rates provider, or provider rates customer).
   */
  async rateBooking(bookingId: string, fromUserId: string, dto: CreateRatingDto) {
    // 1. Load booking with participants
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: { select: { id: true, name: true } },
        provider: {
          include: {
            user: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // 2. Only completed or rated bookings can be rated
    if (booking.status !== BookingStatus.COMPLETED && booking.status !== BookingStatus.RATED) {
      throw new BadRequestException(
        `Cannot rate a booking with status "${booking.status}". Booking must be completed first.`,
      );
    }

    // 3. Determine who is rating whom
    const providerUserId = booking.provider?.user?.id;
    const isCustomer = booking.customerId === fromUserId;
    const isProvider = providerUserId === fromUserId;

    if (!isCustomer && !isProvider) {
      throw new ForbiddenException('You are not a participant in this booking');
    }

    // Customer rates provider, provider rates customer
    const toUserId = isCustomer ? providerUserId! : booking.customerId;

    // 4. Check for duplicate rating
    const existingRating = await this.prisma.rating.findUnique({
      where: {
        bookingId_fromUserId: {
          bookingId,
          fromUserId,
        },
      },
    });

    if (existingRating) {
      throw new ConflictException('You have already rated this booking');
    }

    // 5. Create the rating
    const rating = await this.prisma.rating.create({
      data: {
        bookingId,
        fromUserId,
        toUserId,
        score: dto.score,
        comment: dto.comment || null,
      },
      include: {
        fromUser: { select: { id: true, name: true } },
        toUser: { select: { id: true, name: true } },
      },
    });

    // 6. Recalculate rating average for the rated user
    await this.recalculateRating(toUserId);

    // 7. Update booking status to RATED if both parties have rated (or just keep it as a convenience status)
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.RATED },
    });

    this.logger.log(
      `Rating created: ${fromUserId} → ${toUserId} (score: ${dto.score}) for booking ${bookingId}`,
    );

    return {
      id: rating.id,
      bookingId: rating.bookingId,
      score: rating.score,
      comment: rating.comment,
      fromUser: rating.fromUser,
      toUser: rating.toUser,
      createdAt: rating.createdAt,
    };
  }

  /**
   * Rate from WhatsApp (provider rates customer).
   * Called by WhatsAppProviderHandler.
   */
  async rateFromWhatsApp(
    bookingId: string,
    providerUserId: string,
    score: number,
    comment?: string,
  ) {
    return this.rateBooking(bookingId, providerUserId, { score, comment });
  }

  /**
   * Check if a user has already rated a specific booking.
   */
  async hasRated(bookingId: string, userId: string): Promise<boolean> {
    const rating = await this.prisma.rating.findUnique({
      where: {
        bookingId_fromUserId: {
          bookingId,
          fromUserId: userId,
        },
      },
    });
    return !!rating;
  }

  /**
   * Get the rating a user gave for a specific booking.
   */
  async getRatingForBooking(bookingId: string, userId: string) {
    const rating = await this.prisma.rating.findUnique({
      where: {
        bookingId_fromUserId: {
          bookingId,
          fromUserId: userId,
        },
      },
    });

    if (!rating) return null;

    return {
      id: rating.id,
      score: rating.score,
      comment: rating.comment,
      createdAt: rating.createdAt,
    };
  }

  /**
   * Recalculate and update a user's average rating and count.
   */
  private async recalculateRating(userId: string) {
    const aggregate = await this.prisma.rating.aggregate({
      where: { toUserId: userId },
      _avg: { score: true },
      _count: { score: true },
    });

    const avg = aggregate._avg.score || 0;
    const count = aggregate._count.score || 0;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ratingAverage: Math.round(avg * 100) / 100, // 2 decimal places
        ratingCount: count,
      },
    });

    this.logger.log(
      `Updated rating for user ${userId}: avg=${avg.toFixed(2)}, count=${count}`,
    );
  }
}

