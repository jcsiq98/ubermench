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
        providerProfile: true,
        savedAddresses: { orderBy: { createdAt: 'desc' } },
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
      isActive: user.isActive,
      createdAt: user.createdAt,
      providerProfile: user.providerProfile,
      savedAddresses: user.savedAddresses,
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
