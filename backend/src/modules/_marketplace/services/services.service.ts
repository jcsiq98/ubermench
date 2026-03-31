import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class ServicesService {
  constructor(private prisma: PrismaService) {}

  async getCategories() {
    return this.prisma.serviceCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getCategoryBySlug(slug: string) {
    return this.prisma.serviceCategory.findUnique({
      where: { slug },
    });
  }

  async getProvidersByCategory(categorySlug: string, limit = 20, offset = 0) {
    // Find providers whose serviceTypes JSON array contains the category slug
    const providers = await this.prisma.providerProfile.findMany({
      where: {
        isAvailable: true,
        user: { isActive: true },
        // Prisma JSON filtering: check if serviceTypes array contains the slug
        serviceTypes: { array_contains: [categorySlug] },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            ratingAverage: true,
            ratingCount: true,
          },
        },
      },
      orderBy: [
        { isVerified: 'desc' },
        { user: { ratingAverage: 'desc' } },
      ],
      take: limit,
      skip: offset,
    });

    return providers.map((p) => ({
      providerId: p.id,
      userId: p.user.id,
      name: p.user.name,
      avatarUrl: p.user.avatarUrl,
      bio: p.bio,
      serviceTypes: p.serviceTypes,
      ratingAverage: p.user.ratingAverage,
      ratingCount: p.user.ratingCount,
      totalJobs: p.totalJobs,
      isVerified: p.isVerified,
      isAvailable: p.isAvailable,
    }));
  }

  async getProviderDetail(providerId: string) {
    const provider = await this.prisma.providerProfile.findUnique({
      where: { id: providerId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            ratingAverage: true,
            ratingCount: true,
            createdAt: true,
          },
        },
      },
    });

    if (!provider) return null;

    // Get recent reviews
    const reviews = await this.prisma.rating.findMany({
      where: { toUserId: provider.user.id },
      include: {
        fromUser: {
          select: { name: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      ...provider,
      reviews: reviews.map((r) => ({
        id: r.id,
        score: r.score,
        comment: r.comment,
        customerName: r.fromUser.name,
        customerAvatar: r.fromUser.avatarUrl,
        createdAt: r.createdAt,
      })),
    };
  }
}

