import {
  Controller,
  Get,
  Put,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ZonesService } from './zones.service';
import { GeocodingService } from './geocoding.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Zones')
@Controller('api/zones')
export class ZonesController {
  constructor(
    private zonesService: ZonesService,
    private geocoding: GeocodingService,
  ) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'List all service zones' })
  @ApiQuery({ name: 'city', required: false, description: 'Filter by city' })
  @ApiQuery({ name: 'state', required: false, description: 'Filter by state' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by name' })
  async listZones(
    @Query('city') city?: string,
    @Query('state') state?: string,
    @Query('search') search?: string,
  ) {
    return this.zonesService.listZones({ city, state, search });
  }

  @Get('cities')
  @Public()
  @ApiOperation({ summary: 'List cities with zone counts' })
  async listCities() {
    return this.zonesService.listCities();
  }

  @Get('nearest')
  @Public()
  @ApiOperation({ summary: 'Find nearest zone to coordinates' })
  @ApiQuery({ name: 'lat', required: true, type: Number })
  @ApiQuery({ name: 'lng', required: true, type: Number })
  async findNearest(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
  ) {
    return this.zonesService.findNearestZone(
      parseFloat(lat),
      parseFloat(lng),
    );
  }

  @Get('providers/:providerId')
  @Public()
  @ApiOperation({ summary: 'Get zones for a provider' })
  async getProviderZones(@Param('providerId') providerId: string) {
    return this.zonesService.getProviderZones(providerId);
  }

  @Put('providers/:providerId')
  @ApiOperation({ summary: 'Update zones for a provider' })
  async updateProviderZones(
    @Param('providerId') providerId: string,
    @Body('zoneIds') zoneIds: string[],
  ) {
    return this.zonesService.updateProviderZones(providerId, zoneIds);
  }

  @Get('geocode')
  @Public()
  @ApiOperation({ summary: 'Geocode a city name (via Nominatim)' })
  @ApiQuery({ name: 'q', required: true, description: 'City name to look up' })
  async geocodeCity(@Query('q') q: string) {
    const result = await this.geocoding.lookupCity(q);
    if (!result) {
      return { found: false, query: q };
    }
    return { found: true, ...result };
  }
}

