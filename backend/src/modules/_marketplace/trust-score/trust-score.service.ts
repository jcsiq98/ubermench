import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Trust Score factors and their weights:
 * - Rating average: 30%
 * - Completion rate: 25%
 * - Reports: -20% per report
 * - Cancellations: -15% per cancellation
 * - Response time: 10%
 * - Tenure: 5%
 *
 * Score range: 0-100
 * Thresholds:
 * - <30: automatic suspension
 * - <50: warning + reduced visibility
 * - >80: "Confiable" badge + search priority
 */

const WEIGHTS = {
  ratingAvg: 0.3,
  completionRate: 0.25,
  reports: 0.2,
  cancellations: 0.15,
  responseTime: 0.1,
  tenure: 0.05,
};

@Injectable()
export class TrustScoreService {
  private readonly logger = new Logger(TrustScoreService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async recalculate(providerId: string): Promise<number> {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { id: providerId },
      include: {
        user: { select: { ratingAverage: true, ratingCount: true, phone: true, name: true, createdAt: true } },
        bookings: {
          select: { status: true, createdAt: true, completedAt: true },
        },
      },
    });

    if (!profile) return 50;

    const totalBookings = profile.bookings.length;
    const completed = profile.bookings.filter(
      (b) => b.status === 'COMPLETED' || b.status === 'RATED',
    ).length;
    const cancelled = profile.bookings.filter(
      (b) => b.status === 'CANCELLED',
    ).length;
    const rejected = profile.bookings.filter(
      (b) => b.status === 'REJECTED',
    ).length;

    // Rating component (0-100): 5.0 → 100, 1.0 → 20
    const ratingScore =
      profile.user.ratingCount > 0
        ? (profile.user.ratingAverage / 5) * 100
        : 50;

    // Completion rate (0-100)
    const completionRate =
      totalBookings > 0
        ? (completed / totalBookings) * 100
        : 50;

    // Report penalty (each report deducts from 100)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const reportCount = await this.prisma.report.count({
      where: {
        reportedId: profile.userId,
        createdAt: { gte: thirtyDaysAgo },
        status: { not: 'DISMISSED' },
      },
    });
    const reportScore = Math.max(0, 100 - reportCount * 33);

    // Cancellation penalty
    const cancellationRate =
      totalBookings > 0
        ? ((cancelled + rejected) / totalBookings) * 100
        : 0;
    const cancellationScore = Math.max(0, 100 - cancellationRate);

    // Response time (placeholder: use average acceptance time in the future)
    const responseScore = 70;

    // Tenure: months since registration (caps at 24 months = 100)
    const monthsSinceCreation =
      (Date.now() - profile.user.createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30);
    const tenureScore = Math.min(100, (monthsSinceCreation / 24) * 100);

    const factors = {
      ratingAvg: Math.round(ratingScore * 10) / 10,
      completionRate: Math.round(completionRate * 10) / 10,
      reports: Math.round(reportScore * 10) / 10,
      cancellations: Math.round(cancellationScore * 10) / 10,
      responseTime: Math.round(responseScore * 10) / 10,
      tenure: Math.round(tenureScore * 10) / 10,
    };

    const rawScore =
      factors.ratingAvg * WEIGHTS.ratingAvg +
      factors.completionRate * WEIGHTS.completionRate +
      factors.reports * WEIGHTS.reports +
      factors.cancellations * WEIGHTS.cancellations +
      factors.responseTime * WEIGHTS.responseTime +
      factors.tenure * WEIGHTS.tenure;

    const score = Math.round(Math.max(0, Math.min(100, rawScore)) * 10) / 10;

    // Get previous score for history
    const existing = await this.prisma.trustScore.findUnique({
      where: { providerId },
    });
    const previousScore = existing?.score ?? 50;

    // Upsert trust score
    await this.prisma.trustScore.upsert({
      where: { providerId },
      update: {
        score,
        factors,
        lastCalculated: new Date(),
      },
      create: {
        providerId,
        score,
        factors,
        lastCalculated: new Date(),
      },
    });

    // Record history if score changed
    if (Math.abs(score - previousScore) > 0.5) {
      await this.prisma.trustScoreHistory.create({
        data: {
          providerId,
          previousScore,
          newScore: score,
          reason: 'Recalculation after booking/rating event',
          factors,
        },
      });
    }

    // Check thresholds
    if (score < 30 && previousScore >= 30) {
      this.logger.warn(`Provider ${providerId} trust score dropped below 30 — suspension threshold`);
      this.eventEmitter.emit('trust.suspension', {
        providerId,
        score,
        phone: profile.user.phone,
        name: profile.user.name,
      });
    } else if (score < 50 && previousScore >= 50) {
      this.logger.warn(`Provider ${providerId} trust score dropped below 50 — warning threshold`);
      this.eventEmitter.emit('trust.warning', {
        providerId,
        score,
        phone: profile.user.phone,
        name: profile.user.name,
      });
    }

    // Check tier promotion eligibility
    await this.checkTierPromotion(providerId, profile, score);

    return score;
  }

  private async checkTierPromotion(
    providerId: string,
    profile: any,
    trustScore: number,
  ) {
    const currentTier = profile.tier;
    let eligibleTier = currentTier;

    // Tier 1 → 2: INE validated (isVerified) + completion > 50%
    if (currentTier === 1 && profile.isVerified) {
      eligibleTier = 2;
    }

    // Tier 2 → 3: 10+ jobs completed + trust score > 60
    if (
      currentTier === 2 &&
      profile.totalJobs >= 10 &&
      trustScore > 60
    ) {
      eligibleTier = 3;
    }

    // Tier 3 → 4: rating 4.7+ + trust score > 80 + 50+ jobs
    if (
      currentTier === 3 &&
      profile.user.ratingAverage >= 4.7 &&
      trustScore > 80 &&
      profile.totalJobs >= 50
    ) {
      eligibleTier = 4;
    }

    if (eligibleTier > currentTier) {
      await this.prisma.providerProfile.update({
        where: { id: providerId },
        data: { tier: eligibleTier },
      });

      this.logger.log(
        `Provider ${providerId} auto-promoted from tier ${currentTier} → ${eligibleTier}`,
      );

      this.eventEmitter.emit('provider.tier.upgraded', {
        phone: profile.user.phone,
        name: profile.user.name,
        oldTier: currentTier,
        newTier: eligibleTier,
      });
    }
  }

  // ─── Event handlers ─────────────────────────────────────────

  @OnEvent('booking.status.changed')
  async handleBookingStatusChanged(payload: { bookingId: string }) {
    try {
      const booking = await this.prisma.booking.findUnique({
        where: { id: payload.bookingId },
        select: { providerId: true },
      });
      if (booking?.providerId) {
        await this.recalculate(booking.providerId);
      }
    } catch (error: any) {
      this.logger.error(`Trust score recalc failed: ${error.message}`);
    }
  }

  @OnEvent('rating.created')
  async handleRatingCreated(payload: { providerId: string }) {
    try {
      if (payload.providerId) {
        await this.recalculate(payload.providerId);
      }
    } catch (error: any) {
      this.logger.error(`Trust score recalc on rating failed: ${error.message}`);
    }
  }

  @OnEvent('report.created')
  async handleReportCreated(payload: { providerId: string | null }) {
    try {
      if (payload.providerId) {
        await this.recalculate(payload.providerId);
      }
    } catch (error: any) {
      this.logger.error(`Trust score recalc on report failed: ${error.message}`);
    }
  }
}
