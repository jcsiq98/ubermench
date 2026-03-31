import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('api')
export class ReportsController {
  constructor(private service: ReportsService) {}

  @Post('bookings/:bookingId/report')
  @ApiOperation({ summary: 'Report a problem with a booking' })
  async createReport(
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') userId: string,
    @Body()
    body: {
      category: string;
      description: string;
      evidenceUrls?: string[];
      isSafety?: boolean;
    },
  ) {
    return this.service.createReport(userId, {
      bookingId,
      ...body,
    });
  }

  @Get('bookings/:bookingId/reports')
  @ApiOperation({ summary: 'Get reports for a booking' })
  async getReportsForBooking(
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.getReportsForBooking(bookingId, userId);
  }

  @Get('bookings/:bookingId/my-report')
  @ApiOperation({ summary: 'Check if current user reported this booking' })
  async getMyReport(
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.getMyReportForBooking(bookingId, userId);
  }

  // Admin endpoints
  @Get('admin/reports')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List all reports (admin)' })
  async getReports(
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.getReports({
      status,
      category,
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @Patch('admin/reports/:id/resolve')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Resolve a report (admin)' })
  async resolveReport(
    @Param('id') id: string,
    @CurrentUser('id') adminUserId: string,
    @Body() body: { resolution: string; action: 'resolve' | 'dismiss' },
  ) {
    return this.service.resolveReport(
      id,
      adminUserId,
      body.resolution,
      body.action,
    );
  }
}
