import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ZonesService {
  private readonly logger = new Logger(ZonesService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * List all active zones, optionally filtered by city or state.
   */
  async listZones(filters?: { city?: string; state?: string; search?: string }) {
    const where: any = { isActive: true };

    if (filters?.city) {
      where.city = { equals: filters.city, mode: 'insensitive' };
    }
    if (filters?.state) {
      where.state = { equals: filters.state, mode: 'insensitive' };
    }
    if (filters?.search) {
      where.name = { contains: filters.search, mode: 'insensitive' };
    }

    const zones = await this.prisma.serviceZone.findMany({
      where,
      orderBy: [{ city: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { providers: true } },
      },
    });

    return zones.map((z) => ({
      id: z.id,
      name: z.name,
      city: z.city,
      state: z.state,
      country: z.country,
      lat: z.lat,
      lng: z.lng,
      providerCount: z._count.providers,
    }));
  }

  /**
   * List distinct cities with zone counts.
   */
  async listCities() {
    const zones = await this.prisma.serviceZone.findMany({
      where: { isActive: true },
      select: { city: true, state: true },
    });

    // Group by city
    const cityMap = new Map<string, { city: string; state: string; zoneCount: number }>();
    for (const z of zones) {
      const existing = cityMap.get(z.city);
      if (existing) {
        existing.zoneCount++;
      } else {
        cityMap.set(z.city, { city: z.city, state: z.state, zoneCount: 1 });
      }
    }

    return Array.from(cityMap.values()).sort((a, b) => a.city.localeCompare(b.city));
  }

  /**
   * Get zones for a specific provider.
   */
  async getProviderZones(providerId: string) {
    const assignments = await this.prisma.providerServiceZone.findMany({
      where: { providerId },
      include: {
        zone: true,
      },
    });

    return assignments.map((a) => ({
      id: a.zone.id,
      name: a.zone.name,
      city: a.zone.city,
      state: a.zone.state,
      lat: a.zone.lat,
      lng: a.zone.lng,
    }));
  }

  /**
   * Update zones for a provider (replaces all current assignments).
   */
  async updateProviderZones(providerId: string, zoneIds: string[]) {
    // Verify provider exists
    const provider = await this.prisma.providerProfile.findUnique({
      where: { id: providerId },
    });
    if (!provider) {
      throw new NotFoundException('Proveedor no encontrado');
    }

    // Verify all zones exist
    const zones = await this.prisma.serviceZone.findMany({
      where: { id: { in: zoneIds }, isActive: true },
    });
    if (zones.length !== zoneIds.length) {
      throw new NotFoundException('Una o más zonas no son válidas');
    }

    // Replace all assignments in a transaction
    await this.prisma.$transaction([
      this.prisma.providerServiceZone.deleteMany({
        where: { providerId },
      }),
      ...zoneIds.map((zoneId) =>
        this.prisma.providerServiceZone.create({
          data: { providerId, zoneId },
        }),
      ),
    ]);

    this.logger.log(`Updated zones for provider ${providerId}: ${zoneIds.length} zones`);

    return this.getProviderZones(providerId);
  }

  /**
   * Find the closest zone to a given lat/lng.
   */
  async findNearestZone(lat: number, lng: number) {
    const zones = await this.prisma.serviceZone.findMany({
      where: { isActive: true, lat: { not: null }, lng: { not: null } },
    });

    if (zones.length === 0) return null;

    let nearest = zones[0];
    let minDist = Infinity;

    for (const zone of zones) {
      if (zone.lat === null || zone.lng === null) continue;
      const dist = this.haversineDistance(lat, lng, zone.lat, zone.lng);
      if (dist < minDist) {
        minDist = dist;
        nearest = zone;
      }
    }

    return {
      id: nearest.id,
      name: nearest.name,
      city: nearest.city,
      state: nearest.state,
      distance: Math.round(minDist * 10) / 10, // km, 1 decimal
    };
  }

  /**
   * Find zones by text names (fuzzy match for onboarding).
   * Returns matching zone IDs.
   */
  async findZonesByNames(names: string[], city?: string, state?: string): Promise<string[]> {
    const zoneIds: string[] = [];

    for (const name of names) {
      const trimmed = name.trim();
      if (!trimmed) continue;

      const where: any = {
        isActive: true,
        name: { contains: trimmed, mode: 'insensitive' },
      };
      if (city) {
        where.city = { equals: city, mode: 'insensitive' };
      }

      const matches = await this.prisma.serviceZone.findMany({ where, take: 1 });

      if (matches.length > 0) {
        zoneIds.push(matches[0].id);
      } else {
        // Auto-create the zone if it doesn't exist and we have a city
        if (city) {
          const newZone = await this.prisma.serviceZone.create({
            data: {
              name: trimmed,
              city,
              state: state || '',
              country: 'MX',
            },
          });
          zoneIds.push(newZone.id);
          this.logger.log(`Auto-created zone "${trimmed}" in ${city}, ${state || '?'}`);
        }
      }
    }

    return zoneIds;
  }

  private haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}

