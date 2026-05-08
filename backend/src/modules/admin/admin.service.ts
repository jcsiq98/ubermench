import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { canonicalizePhoneE164, phoneLookupVariants } from '../../common/utils/phone.utils';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  @OnEvent('verification.auto_approved')
  async handleAutoApproval(payload: {
    applicationId: string;
    phone: string;
    name: string | null;
    tier: number;
    faceMatchScore: number;
  }) {
    try {
      this.logger.log(
        `Auto-approval triggered for application ${payload.applicationId} (face: ${payload.faceMatchScore}%)`,
      );
      await this.approveApplication(
        payload.applicationId,
        'system',
        payload.tier,
      );
    } catch (error: any) {
      this.logger.error(`Auto-approval failed: ${error.message}`);
    }
  }

  // ─── Applications ───────────────────────────────────────────

  async getApplications(params: {
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    const { status, limit = 20, offset = 0 } = params;

    const where: any = {};
    if (status) {
      where.verificationStatus = status;
    }

    const [data, total] = await Promise.all([
      this.prisma.providerApplication.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.providerApplication.count({ where }),
    ]);

    return { data, total, limit, offset };
  }

  async getApplicationById(id: string) {
    const application = await this.prisma.providerApplication.findUnique({
      where: { id },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    return application;
  }

  async approveApplication(id: string, adminUserId: string, tier: number = 1) {
    const application = await this.prisma.providerApplication.findUnique({
      where: { id },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    if (application.verificationStatus === 'APPROVED') {
      throw new BadRequestException('Application already approved');
    }

    if (tier < 1 || tier > 4) {
      throw new BadRequestException('Tier must be between 1 and 4');
    }

    // Check if user already exists
    const applicationPhone = canonicalizePhoneE164(application.phone);

    const existingUser = await this.prisma.user.findFirst({
      where: { OR: phoneLookupVariants(applicationPhone).map((p) => ({ phone: p })) },
    });

    if (existingUser?.role === 'PROVIDER') {
      throw new BadRequestException('A provider with this phone already exists');
    }

    // Update application status
    await this.prisma.providerApplication.update({
      where: { id },
      data: {
        verificationStatus: 'APPROVED',
        approvedTier: tier,
        reviewedBy: adminUserId,
        reviewedAt: new Date(),
      },
    });

    // Create User + ProviderProfile (or upgrade existing customer)
    let user;
    if (existingUser) {
      user = await this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          role: 'PROVIDER',
          name: existingUser.name || application.name,
          providerProfile: {
            create: {
              bio: application.bio,
              serviceTypes: application.categories || [],
              isVerified: true,
              isAvailable: true,
              tier,
            },
          },
        },
        include: { providerProfile: true },
      });
    } else {
      user = await this.prisma.user.create({
        data: {
          phone: applicationPhone,
          name: application.name,
          role: 'PROVIDER',
          providerProfile: {
            create: {
              bio: application.bio,
              serviceTypes: application.categories || [],
              isVerified: true,
              isAvailable: true,
              tier,
            },
          },
        },
        include: { providerProfile: true },
      });
    }

    // Link service zones
    if (user.providerProfile && application.serviceZones?.length > 0) {
      const zones = await this.prisma.serviceZone.findMany({
        where: { name: { in: application.serviceZones } },
      });
      if (zones.length > 0) {
        await this.prisma.providerServiceZone.createMany({
          data: zones.map((zone) => ({
            providerId: user.providerProfile!.id,
            zoneId: zone.id,
          })),
          skipDuplicates: true,
        });
      }
    }

    // Initialize trust score
    if (user.providerProfile) {
      await this.prisma.trustScore.upsert({
        where: { providerId: user.providerProfile.id },
        update: {},
        create: {
          providerId: user.providerProfile.id,
          score: 50,
          factors: {
            ratingAvg: 0,
            completionRate: 0,
            reports: 0,
            cancellations: 0,
            responseTime: 0,
            tenure: 0,
          },
        },
      });
    }

    this.logger.log(
      `Application ${id} approved by admin ${adminUserId} — tier ${tier}`,
    );

    // Emit event for WhatsApp notification
    this.eventEmitter.emit('application.approved', {
      phone: applicationPhone,
      name: application.name,
      tier,
    });

    return { success: true, userId: user.id, tier };
  }

  async rejectApplication(id: string, adminUserId: string, reason: string) {
    if (!reason?.trim()) {
      throw new BadRequestException('Rejection reason is required');
    }

    const application = await this.prisma.providerApplication.findUnique({
      where: { id },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    if (application.verificationStatus === 'APPROVED') {
      throw new BadRequestException('Cannot reject an already approved application');
    }

    await this.prisma.providerApplication.update({
      where: { id },
      data: {
        verificationStatus: 'REJECTED',
        rejectionReason: reason,
        reviewedBy: adminUserId,
        reviewedAt: new Date(),
      },
    });

    this.logger.log(
      `Application ${id} rejected by admin ${adminUserId}: ${reason}`,
    );

    this.eventEmitter.emit('application.rejected', {
      phone: application.phone,
      name: application.name,
      reason,
    });

    return { success: true };
  }

  // ─── Stats ──────────────────────────────────────────────────

  async getStats() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(todayStart.getDate() - todayStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      pendingApplications,
      totalApplications,
      approvedApplications,
      rejectedApplications,
      totalProviders,
      tier1,
      tier2,
      tier3,
      tier4,
      totalBookings,
      todayBookings,
      weekBookings,
      monthBookings,
      completedBookings,
      totalCustomers,
    ] = await Promise.all([
      this.prisma.providerApplication.count({ where: { verificationStatus: 'PENDING' } }),
      this.prisma.providerApplication.count(),
      this.prisma.providerApplication.count({ where: { verificationStatus: 'APPROVED' } }),
      this.prisma.providerApplication.count({ where: { verificationStatus: 'REJECTED' } }),
      this.prisma.providerProfile.count(),
      this.prisma.providerProfile.count({ where: { tier: 1 } }),
      this.prisma.providerProfile.count({ where: { tier: 2 } }),
      this.prisma.providerProfile.count({ where: { tier: 3 } }),
      this.prisma.providerProfile.count({ where: { tier: 4 } }),
      this.prisma.booking.count(),
      this.prisma.booking.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.booking.count({ where: { createdAt: { gte: weekStart } } }),
      this.prisma.booking.count({ where: { createdAt: { gte: monthStart } } }),
      this.prisma.booking.count({ where: { status: { in: ['COMPLETED', 'RATED'] } } }),
      this.prisma.user.count({ where: { role: 'CUSTOMER' } }),
    ]);

    return {
      applications: {
        pending: pendingApplications,
        total: totalApplications,
        approved: approvedApplications,
        rejected: rejectedApplications,
      },
      providers: {
        total: totalProviders,
        byTier: { tier1, tier2, tier3, tier4 },
      },
      bookings: {
        total: totalBookings,
        today: todayBookings,
        thisWeek: weekBookings,
        thisMonth: monthBookings,
        completed: completedBookings,
      },
      customers: { total: totalCustomers },
    };
  }

  // ─── Providers ──────────────────────────────────────────────

  async getProviders(params: {
    tier?: number;
    search?: string;
    limit?: number;
    offset?: number;
  }) {
    const { tier, search, limit = 20, offset = 0 } = params;

    const where: any = {};
    if (tier) {
      where.tier = tier;
    }
    if (search) {
      where.user = {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
        ],
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.providerProfile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              ratingAverage: true,
              ratingCount: true,
              isActive: true,
              createdAt: true,
            },
          },
          trustScore: { select: { score: true } },
          _count: { select: { bookings: true } },
        },
      }),
      this.prisma.providerProfile.count({ where }),
    ]);

    return { data, total, limit, offset };
  }

  async updateProviderTier(providerId: string, tier: number, adminUserId: string) {
    if (tier < 1 || tier > 4) {
      throw new BadRequestException('Tier must be between 1 and 4');
    }

    const profile = await this.prisma.providerProfile.findUnique({
      where: { id: providerId },
      include: { user: { select: { phone: true, name: true } } },
    });

    if (!profile) {
      throw new NotFoundException('Provider not found');
    }

    const oldTier = profile.tier;

    await this.prisma.providerProfile.update({
      where: { id: providerId },
      data: { tier },
    });

    this.logger.log(
      `Provider ${providerId} tier changed ${oldTier} → ${tier} by admin ${adminUserId}`,
    );

    if (tier > oldTier) {
      this.eventEmitter.emit('provider.tier.upgraded', {
        phone: profile.user.phone,
        name: profile.user.name,
        oldTier,
        newTier: tier,
      });
    }

    return { success: true, oldTier, newTier: tier };
  }

  async updateUserByPhone(
    phone: string,
    data: { name?: string },
  ): Promise<{ success: boolean; user: { id: string; phone: string; name: string | null } }> {
    const variants = phoneLookupVariants(phone);

    const user = await this.prisma.user.findFirst({
      where: {
        OR: variants.map((variant) => ({ phone: variant })),
      },
    });

    if (!user) {
      throw new NotFoundException(`User not found with phone: ${phone}`);
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { name: data.name },
      select: { id: true, phone: true, name: true },
    });

    this.logger.log(`User ${updated.id} name updated to "${data.name}"`);
    return { success: true, user: updated };
  }
}
