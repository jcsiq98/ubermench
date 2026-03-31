import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger('UsersService');

  constructor(private prisma: PrismaService) {}

  async findByPhone(phone: string) {
    return this.prisma.user.findUnique({ where: { phone } });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { providerProfile: true },
    });
  }

  async createCustomer(phone: string, name?: string) {
    return this.prisma.user.create({
      data: {
        phone,
        name,
        role: 'CUSTOMER',
      },
    });
  }

  async updateProfile(id: string, data: { name?: string; email?: string; avatarUrl?: string }) {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async getFullProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        providerProfile: {
          include: {
            serviceZones: { include: { zone: true } },
            trustScore: { select: { score: true } },
          },
        },
        savedAddresses: { orderBy: { createdAt: 'desc' } },
        _count: {
          select: {
            bookingsAsCustomer: true,
            ratingsGiven: true,
            ratingsReceived: true,
          },
        },
      },
    });

    if (!user) return null;

    return {
      id: user.id,
      phone: user.phone,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      role: user.role,
      ratingAverage: user.ratingAverage,
      ratingCount: user.ratingCount,
      isActive: user.isActive,
      createdAt: user.createdAt,
      providerProfile: user.providerProfile,
      savedAddresses: user.savedAddresses,
      stats: {
        totalBookings: user._count.bookingsAsCustomer,
        ratingsGiven: user._count.ratingsGiven,
        ratingsReceived: user._count.ratingsReceived,
      },
    };
  }

  async getBookingHistory(
    userId: string,
    params: { limit?: number; offset?: number; status?: string } = {},
  ) {
    const { limit = 20, offset = 0, status } = params;

    const where: any = { customerId: userId };
    if (status === 'completed') {
      where.status = { in: ['COMPLETED', 'RATED'] };
    } else if (status === 'cancelled') {
      where.status = { in: ['CANCELLED', 'REJECTED'] };
    } else if (status === 'active') {
      where.status = {
        in: ['PENDING', 'ACCEPTED', 'PROVIDER_ARRIVING', 'IN_PROGRESS'],
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, slug: true, icon: true } },
          provider: {
            include: {
              user: {
                select: { id: true, name: true, avatarUrl: true },
              },
            },
          },
          ratings: {
            where: { fromUserId: userId },
            select: { score: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.booking.count({ where }),
    ]);

    return {
      data: data.map((b) => ({
        id: b.id,
        status: b.status,
        description: b.description,
        address: b.address,
        price: b.price,
        createdAt: b.createdAt,
        completedAt: b.completedAt,
        category: b.category,
        provider: b.provider
          ? {
              id: b.provider.id,
              name: b.provider.user.name,
              avatarUrl: b.provider.user.avatarUrl,
            }
          : null,
        myRating: b.ratings[0]?.score || null,
      })),
      total,
      limit,
      offset,
    };
  }

  async deleteAccount(userId: string) {
    this.logger.warn(`Account deletion requested for user ${userId}`);

    await this.prisma.$transaction([
      this.prisma.deviceToken.deleteMany({ where: { userId } }),
      this.prisma.notificationPreference.deleteMany({ where: { userId } }),
      this.prisma.notification.deleteMany({ where: { userId } }),
      this.prisma.savedAddress.deleteMany({ where: { userId } }),
      this.prisma.emergencyContact.deleteMany({ where: { userId } }),
      this.prisma.otpCode.deleteMany({ where: { userId } }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),

      this.prisma.user.update({
        where: { id: userId },
        data: {
          isActive: false,
          name: 'Usuario eliminado',
          email: null,
          avatarUrl: null,
          phone: `deleted_${userId}_${Date.now()}`,
        },
      }),
    ]);

    return { success: true };
  }
}
