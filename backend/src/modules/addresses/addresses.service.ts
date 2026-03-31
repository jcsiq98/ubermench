import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AddressesService {
  constructor(private prisma: PrismaService) {}

  async list(userId: string) {
    return this.prisma.savedAddress.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async create(
    userId: string,
    data: { label: string; address: string; lat: number; lng: number; isDefault?: boolean },
  ) {
    if (data.isDefault) {
      await this.prisma.savedAddress.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.savedAddress.create({
      data: { userId, ...data },
    });
  }

  async update(
    userId: string,
    id: string,
    data: { label?: string; address?: string; lat?: number; lng?: number; isDefault?: boolean },
  ) {
    const existing = await this.prisma.savedAddress.findFirst({
      where: { id, userId },
    });
    if (!existing) throw new NotFoundException('Address not found');

    if (data.isDefault) {
      await this.prisma.savedAddress.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.savedAddress.update({
      where: { id },
      data,
    });
  }

  async delete(userId: string, id: string) {
    const existing = await this.prisma.savedAddress.findFirst({
      where: { id, userId },
    });
    if (!existing) throw new NotFoundException('Address not found');

    await this.prisma.savedAddress.delete({ where: { id } });
    return { success: true };
  }
}
