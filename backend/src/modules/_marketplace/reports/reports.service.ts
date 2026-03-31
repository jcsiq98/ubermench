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
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async createReport(
    reporterId: string,
    data: {
      bookingId: string;
      category: string;
      description: string;
      evidenceUrls?: string[];
      isSafety?: boolean;
    },
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: data.bookingId },
      include: {
        provider: { include: { user: { select: { id: true } } } },
        customer: { select: { id: true } },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const completedStatuses = ['COMPLETED', 'RATED', 'IN_PROGRESS'];
    if (!completedStatuses.includes(booking.status)) {
      throw new BadRequestException(
        'Can only report bookings that are in progress or completed',
      );
    }

    // Determine who is being reported
    const isCustomer = booking.customerId === reporterId;
    const isProvider = booking.provider?.user?.id === reporterId;

    if (!isCustomer && !isProvider) {
      throw new ForbiddenException('You are not a participant of this booking');
    }

    const reportedId = isCustomer
      ? booking.provider!.user.id
      : booking.customerId;

    // Prevent duplicate reports
    const existingReport = await this.prisma.report.findFirst({
      where: {
        bookingId: data.bookingId,
        reporterId,
      },
    });

    if (existingReport) {
      throw new BadRequestException(
        'You have already reported this booking',
      );
    }

    const report = await this.prisma.report.create({
      data: {
        bookingId: data.bookingId,
        reporterId,
        reportedId,
        category: data.category as any,
        description: data.description,
        evidenceUrls: data.evidenceUrls || [],
        isSafety: data.isSafety || data.category === 'SAFETY' || data.category === 'HARASSMENT' || data.category === 'THEFT',
        status: data.isSafety ? 'UNDER_REVIEW' : 'OPEN',
      },
      include: {
        reporter: { select: { id: true, name: true } },
        reported: { select: { id: true, name: true, phone: true } },
        booking: { select: { id: true, description: true } },
      },
    });

    this.logger.log(
      `Report ${report.id} created by ${reporterId} against ${reportedId} (category: ${data.category})`,
    );

    // Check auto-suspension: 3+ reports in 30 days
    await this.checkAutoSuspension(reportedId);

    // Safety reports trigger immediate review
    if (report.isSafety) {
      this.eventEmitter.emit('report.safety', {
        reportId: report.id,
        reportedId,
        reportedName: report.reported.name,
        reportedPhone: report.reported.phone,
        category: data.category,
      });
    }

    // Recalculate trust score
    this.eventEmitter.emit('report.created', {
      reportId: report.id,
      reportedId,
      providerId: isCustomer ? booking.providerId : null,
    });

    return report;
  }

  private async checkAutoSuspension(userId: string) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentReports = await this.prisma.report.count({
      where: {
        reportedId: userId,
        createdAt: { gte: thirtyDaysAgo },
        status: { not: 'DISMISSED' },
      },
    });

    if (recentReports >= 3) {
      this.logger.warn(
        `User ${userId} has ${recentReports} reports in 30 days — auto-suspending`,
      );

      // Suspend the user
      await this.prisma.user.update({
        where: { id: userId },
        data: { isActive: false },
      });

      // If they're a provider, mark unavailable
      const profile = await this.prisma.providerProfile.findUnique({
        where: { userId },
        include: { user: { select: { phone: true, name: true } } },
      });

      if (profile) {
        await this.prisma.providerProfile.update({
          where: { id: profile.id },
          data: { isAvailable: false },
        });

        this.eventEmitter.emit('provider.suspended', {
          providerId: profile.id,
          phone: profile.user.phone,
          name: profile.user.name,
          reason: `${recentReports} reportes en los últimos 30 días`,
        });
      }
    }
  }

  async getReportsForBooking(bookingId: string, userId: string) {
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

    return this.prisma.report.findMany({
      where: { bookingId },
      include: {
        reporter: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMyReportForBooking(bookingId: string, userId: string) {
    const report = await this.prisma.report.findFirst({
      where: { bookingId, reporterId: userId },
    });
    return { reported: !!report, report };
  }

  // Admin methods
  async getReports(params: {
    status?: string;
    category?: string;
    limit?: number;
    offset?: number;
  }) {
    const { status, category, limit = 20, offset = 0 } = params;

    const where: any = {};
    if (status) where.status = status;
    if (category) where.category = category;

    const [data, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        include: {
          reporter: { select: { id: true, name: true, phone: true } },
          reported: { select: { id: true, name: true, phone: true } },
          booking: { select: { id: true, description: true, status: true } },
        },
        orderBy: [{ isSafety: 'desc' }, { createdAt: 'desc' }],
        skip: offset,
        take: limit,
      }),
      this.prisma.report.count({ where }),
    ]);

    return { data, total, limit, offset };
  }

  async resolveReport(
    reportId: string,
    adminUserId: string,
    resolution: string,
    action: 'resolve' | 'dismiss',
  ) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });

    if (!report) throw new NotFoundException('Report not found');
    if (report.status === 'RESOLVED' || report.status === 'DISMISSED') {
      throw new BadRequestException('Report already resolved');
    }

    return this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: action === 'resolve' ? 'RESOLVED' : 'DISMISSED',
        resolution,
        resolvedBy: adminUserId,
        resolvedAt: new Date(),
      },
    });
  }

  async getReportCountForUser(userId: string) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return this.prisma.report.count({
      where: {
        reportedId: userId,
        createdAt: { gte: thirtyDaysAgo },
        status: { not: 'DISMISSED' },
      },
    });
  }
}
