import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BookingStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class ProviderDashboardService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async getDashboard(userId: string) {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId },
      include: {
        user: { select: { ratingAverage: true, ratingCount: true, name: true } },
        serviceZones: { include: { zone: { select: { name: true, city: true } } } },
      },
    });

    if (!profile) throw new NotFoundException('Provider profile not found');

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const weeks: { start: Date; end: Date }[] = [];
    for (let i = 3; i >= 0; i--) {
      const wStart = new Date(now);
      wStart.setDate(now.getDate() - now.getDay() - i * 7);
      wStart.setHours(0, 0, 0, 0);
      const wEnd = new Date(wStart);
      wEnd.setDate(wStart.getDate() + 7);
      weeks.push({ start: wStart, end: wEnd });
    }

    const [weekJobs, monthJobs, pendingJobs, activeJobs, weeklyBreakdown] = await Promise.all([
      this.prisma.booking.count({
        where: { providerId: profile.id, status: 'COMPLETED', completedAt: { gte: startOfWeek } },
      }),
      this.prisma.booking.count({
        where: { providerId: profile.id, status: 'COMPLETED', completedAt: { gte: startOfMonth } },
      }),
      this.prisma.booking.findMany({
        where: { providerId: profile.id, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          customer: { select: { id: true, name: true, avatarUrl: true, ratingAverage: true } },
          category: { select: { id: true, name: true, slug: true, icon: true } },
        },
      }),
      this.prisma.booking.findMany({
        where: {
          providerId: profile.id,
          status: { in: ['ACCEPTED', 'PROVIDER_ARRIVING', 'IN_PROGRESS'] },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, name: true, avatarUrl: true, ratingAverage: true } },
          category: { select: { id: true, name: true, slug: true, icon: true } },
        },
      }),
      Promise.all(
        weeks.map(async (w) => ({
          weekStart: w.start.toISOString(),
          jobs: await this.prisma.booking.count({
            where: {
              providerId: profile.id,
              status: 'COMPLETED',
              completedAt: { gte: w.start, lt: w.end },
            },
          }),
        })),
      ),
    ]);

    return {
      profile: {
        id: profile.id,
        name: profile.user.name,
        bio: profile.bio,
        isVerified: profile.isVerified,
        isAvailable: profile.isAvailable,
        serviceTypes: profile.serviceTypes,
        zones: profile.serviceZones.map((z) => ({
          id: z.zoneId,
          name: z.zone.name,
          city: z.zone.city,
        })),
      },
      stats: {
        totalJobs: profile.totalJobs,
        weekJobs,
        monthJobs,
        ratingAverage: profile.user.ratingAverage,
        ratingCount: profile.user.ratingCount,
      },
      weeklyBreakdown,
      pendingJobs,
      activeJobs,
    };
  }

  async getJobs(
    userId: string,
    filter: 'pending' | 'active' | 'completed' | 'rejected' | 'all',
    limit = 20,
    offset = 0,
  ) {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId },
    });
    if (!profile) throw new NotFoundException('Provider profile not found');

    const statusMap: Record<string, BookingStatus[]> = {
      pending: ['PENDING'],
      active: ['ACCEPTED', 'PROVIDER_ARRIVING', 'IN_PROGRESS'],
      completed: ['COMPLETED', 'RATED'],
      rejected: ['REJECTED', 'CANCELLED'],
      all: [],
    };

    const where: any = { providerId: profile.id };
    if (filter !== 'all') {
      where.status = { in: statusMap[filter] };
    }

    const [data, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          customer: { select: { id: true, name: true, avatarUrl: true, ratingAverage: true, ratingCount: true, phone: true } },
          category: { select: { id: true, name: true, slug: true, icon: true } },
        },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return { data, total, limit, offset };
  }

  async updateJobStatus(
    userId: string,
    bookingId: string,
    action: 'accept' | 'reject' | 'arriving' | 'start' | 'complete',
  ) {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId },
    });
    if (!profile) throw new NotFoundException('Provider profile not found');

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: { select: { id: true, name: true } },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.providerId !== profile.id) throw new ForbiddenException('Not your booking');

    const transitions: Record<string, { from: BookingStatus[]; to: BookingStatus; extra?: any }> = {
      accept: { from: ['PENDING'], to: 'ACCEPTED' },
      reject: { from: ['PENDING'], to: 'REJECTED' },
      arriving: { from: ['ACCEPTED'], to: 'PROVIDER_ARRIVING' },
      start: { from: ['ACCEPTED', 'PROVIDER_ARRIVING'], to: 'IN_PROGRESS' },
      complete: { from: ['IN_PROGRESS'], to: 'COMPLETED', extra: { completedAt: new Date() } },
    };

    const transition = transitions[action];
    if (!transition.from.includes(booking.status)) {
      throw new BadRequestException(
        `Cannot ${action} a booking with status ${booking.status}`,
      );
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: transition.to, ...transition.extra },
      include: {
        customer: { select: { id: true, name: true, avatarUrl: true } },
        category: { select: { id: true, name: true, slug: true, icon: true } },
        provider: { include: { user: { select: { name: true } } } },
      },
    });

    if (action === 'complete') {
      await this.prisma.providerProfile.update({
        where: { id: profile.id },
        data: { totalJobs: { increment: 1 } },
      });
    }

    if (action === 'accept') {
      this.eventEmitter.emit('booking.responded', { bookingId });
    }
    if (action === 'reject') {
      this.eventEmitter.emit('booking.responded', { bookingId });
    }

    // Emit event for WebSocket updates
    this.eventEmitter.emit('booking.status.changed', {
      bookingId,
      status: updated.status,
      customerId: booking.customer?.id,
      providerName: updated.provider?.user?.name,
    });

    return updated;
  }

  async getEarnings(userId: string) {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId },
    });
    if (!profile) throw new NotFoundException('Provider profile not found');

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [thisMonthJobs, lastMonthJobs, allCompleted] = await Promise.all([
      this.prisma.booking.findMany({
        where: {
          providerId: profile.id,
          status: { in: ['COMPLETED', 'RATED'] },
          completedAt: { gte: startOfMonth },
        },
        select: { price: true, completedAt: true },
        orderBy: { completedAt: 'desc' },
      }),
      this.prisma.booking.findMany({
        where: {
          providerId: profile.id,
          status: { in: ['COMPLETED', 'RATED'] },
          completedAt: { gte: startOfLastMonth, lt: startOfMonth },
        },
        select: { price: true },
      }),
      this.prisma.booking.count({
        where: { providerId: profile.id, status: { in: ['COMPLETED', 'RATED'] } },
      }),
    ]);

    const thisMonthTotal = thisMonthJobs.reduce((sum, j) => sum + (j.price || 0), 0);
    const lastMonthTotal = lastMonthJobs.reduce((sum, j) => sum + (j.price || 0), 0);

    return {
      thisMonth: { total: thisMonthTotal, jobs: thisMonthJobs.length },
      lastMonth: { total: lastMonthTotal, jobs: lastMonthJobs.length },
      allTimeJobs: allCompleted,
    };
  }

  async getProfile(userId: string) {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true, name: true, phone: true, email: true, avatarUrl: true,
            ratingAverage: true, ratingCount: true, createdAt: true,
          },
        },
        serviceZones: { include: { zone: { select: { id: true, name: true, city: true, state: true } } } },
        trustScore: { select: { score: true } },
      },
    });

    if (!profile) throw new NotFoundException('Provider profile not found');

    return {
      id: profile.id,
      userId: profile.userId,
      name: profile.user.name,
      phone: profile.user.phone,
      email: profile.user.email,
      avatarUrl: profile.user.avatarUrl,
      bio: profile.bio,
      serviceTypes: profile.serviceTypes,
      totalJobs: profile.totalJobs,
      tier: profile.tier,
      isVerified: profile.isVerified,
      isAvailable: profile.isAvailable,
      ratingAverage: profile.user.ratingAverage,
      ratingCount: profile.user.ratingCount,
      memberSince: profile.user.createdAt,
      trustScore: profile.trustScore?.score ?? null,
      zones: profile.serviceZones.map((z) => ({
        id: z.zone.id,
        name: z.zone.name,
        city: z.zone.city,
        state: z.zone.state,
      })),
    };
  }

  async updateProfile(
    userId: string,
    data: { name?: string; bio?: string; isAvailable?: boolean },
  ) {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId },
    });
    if (!profile) throw new NotFoundException('Provider profile not found');

    if (data.name) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { name: data.name },
      });
    }

    const updated = await this.prisma.providerProfile.update({
      where: { id: profile.id },
      data: {
        ...(data.bio !== undefined ? { bio: data.bio } : {}),
        ...(data.isAvailable !== undefined ? { isAvailable: data.isAvailable } : {}),
      },
      include: { user: { select: { name: true } } },
    });

    return updated;
  }
}
