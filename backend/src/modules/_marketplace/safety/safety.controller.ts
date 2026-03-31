import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SafetyService } from './safety.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('Safety')
@ApiBearerAuth()
@Controller('api')
export class SafetyController {
  constructor(private service: SafetyService) {}

  // ─── Service Photos ────────────────────────────────────────

  @Post('bookings/:bookingId/photos')
  @ApiOperation({ summary: 'Upload a service photo (before/after)' })
  async uploadPhoto(
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') userId: string,
    @Body() body: { type: 'BEFORE' | 'AFTER' | 'EVIDENCE'; url: string; caption?: string },
  ) {
    return this.service.uploadServicePhoto(userId, bookingId, body);
  }

  @Get('bookings/:bookingId/photos')
  @ApiOperation({ summary: 'Get service photos for a booking' })
  async getPhotos(
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.getServicePhotos(bookingId, userId);
  }

  // ─── GPS Tracking ──────────────────────────────────────────

  @Post('provider/location')
  @ApiOperation({ summary: 'Update provider GPS location' })
  async updateLocation(
    @CurrentUser('id') userId: string,
    @Body() body: { lat: number; lng: number; accuracy?: number; bookingId?: string },
  ) {
    return this.service.updateProviderLocation(userId, body);
  }

  @Get('bookings/:bookingId/provider-location')
  @ApiOperation({ summary: 'Get provider location during active service' })
  async getProviderLocation(
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.getProviderLocation(bookingId, userId);
  }

  // ─── Emergency Contacts ────────────────────────────────────

  @Get('emergency-contacts')
  @ApiOperation({ summary: 'Get emergency contacts' })
  async getContacts(@CurrentUser('id') userId: string) {
    return this.service.getEmergencyContacts(userId);
  }

  @Post('emergency-contacts')
  @ApiOperation({ summary: 'Add emergency contact' })
  async addContact(
    @CurrentUser('id') userId: string,
    @Body() body: { name: string; phone: string; relation?: string },
  ) {
    return this.service.addEmergencyContact(userId, body);
  }

  @Delete('emergency-contacts/:id')
  @ApiOperation({ summary: 'Remove emergency contact' })
  async removeContact(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.removeEmergencyContact(userId, id);
  }

  // ─── SOS ───────────────────────────────────────────────────

  @Post('sos')
  @ApiOperation({ summary: 'Trigger SOS alert' })
  async triggerSos(
    @CurrentUser('id') userId: string,
    @Body() body: { bookingId: string; lat?: number; lng?: number },
  ) {
    return this.service.triggerSos(userId, body);
  }

  @Post('sos/:alertId/resolve')
  @ApiOperation({ summary: 'Resolve SOS alert' })
  async resolveSos(
    @Param('alertId') alertId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.resolveSos(alertId, userId);
  }
}
