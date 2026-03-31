import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../config/redis.service';

export interface GeocodedCity {
  city: string;
  state: string;
  country: string;
  lat: number;
  lng: number;
}

// Common abbreviations / aliases that Nominatim won't understand directly
const CITY_ALIASES: Record<string, string> = {
  cdmx: 'Ciudad de México',
  df: 'Ciudad de México',
  mty: 'Monterrey',
  gdl: 'Guadalajara',
  tj: 'Tijuana',
  qro: 'Querétaro',
  slp: 'San Luis Potosí',
  ags: 'Aguascalientes',
  'cd juarez': 'Ciudad Juárez',
  'cd. juarez': 'Ciudad Juárez',
  'cd juárez': 'Ciudad Juárez',
  'cd. juárez': 'Ciudad Juárez',
};

const CACHE_PREFIX = 'geocode_city:';
const CACHE_TTL = 60 * 60 * 24 * 30; // 30 days — cities don't move

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  constructor(private redis: RedisService) {}

  /**
   * Look up a Mexican city by name using Nominatim (OpenStreetMap).
   * Returns canonical city name, state, and coordinates.
   * Results are cached in Redis for 30 days.
   */
  async lookupCity(input: string): Promise<GeocodedCity | null> {
    const normalized = input.trim().toLowerCase();
    if (normalized.length < 2) return null;

    // 1. Check alias map first
    const aliasResolved = CITY_ALIASES[normalized] || input.trim();

    // 2. Check cache
    const cacheKey = `${CACHE_PREFIX}${normalized}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as GeocodedCity;
      } catch {
        // Corrupted cache entry — continue to API
      }
    }

    // 3. Query Nominatim
    try {
      const result = await this.queryNominatim(aliasResolved);

      if (result) {
        // Cache the result
        await this.redis.set(cacheKey, JSON.stringify(result), CACHE_TTL);
        this.logger.log(
          `Geocoded "${input}" → ${result.city}, ${result.state}`,
        );
        return result;
      }

      // If alias didn't work, try the raw input
      if (aliasResolved !== input.trim()) {
        const fallback = await this.queryNominatim(input.trim());
        if (fallback) {
          await this.redis.set(cacheKey, JSON.stringify(fallback), CACHE_TTL);
          this.logger.log(
            `Geocoded "${input}" (fallback) → ${fallback.city}, ${fallback.state}`,
          );
          return fallback;
        }
      }

      this.logger.warn(`Could not geocode "${input}" — no results from Nominatim`);
      return null;
    } catch (error: any) {
      this.logger.error(`Nominatim API error for "${input}": ${error.message}`);
      return null;
    }
  }

  private async queryNominatim(query: string): Promise<GeocodedCity | null> {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', `${query}, México`);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('countrycodes', 'mx');
    url.searchParams.set('limit', '3');
    url.searchParams.set('addressdetails', '1');
    // Only look for cities/towns, not streets or buildings
    url.searchParams.set('featuretype', 'city');

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'HandyApp/1.0 (contact@handyapp.mx)',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Nominatim returned ${response.status}`);
    }

    const results: any[] = await response.json();

    if (results.length === 0) {
      // Try without featuretype restriction (smaller towns)
      url.searchParams.delete('featuretype');
      const retryResponse = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'HandyApp/1.0 (contact@handyapp.mx)',
          Accept: 'application/json',
        },
      });
      if (!retryResponse.ok) return null;
      const retryResults: any[] = await retryResponse.json();
      if (retryResults.length === 0) return null;
      return this.parseNominatimResult(retryResults[0]);
    }

    return this.parseNominatimResult(results[0]);
  }

  private parseNominatimResult(result: any): GeocodedCity | null {
    const addr = result.address || {};

    // Nominatim returns different fields depending on the place type
    const city =
      addr.city ||
      addr.town ||
      addr.municipality ||
      addr.village ||
      result.name ||
      null;

    const state =
      addr.state ||
      addr.region ||
      '';

    if (!city) return null;

    return {
      city,
      state,
      country: 'MX',
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
    };
  }
}

