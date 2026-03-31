import {
  Controller,
  Get,
  Patch,
  Put,
  Param,
  Query,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ProviderDashboardService } from './provider-dashboard.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IsString, IsOptional, IsBoolean } from 'class-validator';

class UpdateProfileDto {
  @IsOptional() @IsString()
  name?: string;

  @IsOptional() @IsString()
  bio?: string;

  @IsOptional() @IsBoolean()
  isAvailable?: boolean;
}

@ApiTags('Provider Dashboard')
@ApiBearerAuth()
@Controller('api/provider')
export class ProviderDashboardController {
  constructor(private service: ProviderDashboardService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get provider dashboard with KPIs' })
  async getDashboard(@CurrentUser('id') userId: string) {
    return this.service.getDashboard(userId);
  }

  @Get('jobs')
  @ApiOperation({ summary: 'List provider jobs with filters' })
  @ApiQuery({ name: 'filter', required: false, enum: ['pending', 'active', 'completed', 'rejected', 'all'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async getJobs(
    @CurrentUser('id') userId: string,
    @Query('filter') filter?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.getJobs(
      userId,
      (filter as any) || 'all',
      limit ? parseInt(limit, 10) : 20,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  @Patch('jobs/:id/accept')
  @ApiOperation({ summary: 'Accept a pending booking' })
  async acceptJob(
    @CurrentUser('id') userId: string,
    @Param('id') bookingId: string,
  ) {
    return this.service.updateJobStatus(userId, bookingId, 'accept');
  }

  @Patch('jobs/:id/reject')
  @ApiOperation({ summary: 'Reject a pending booking' })
  async rejectJob(
    @CurrentUser('id') userId: string,
    @Param('id') bookingId: string,
  ) {
    return this.service.updateJobStatus(userId, bookingId, 'reject');
  }

  @Patch('jobs/:id/status')
  @ApiOperation({ summary: 'Update job status (arriving, start, complete)' })
  async updateJobStatus(
    @CurrentUser('id') userId: string,
    @Param('id') bookingId: string,
    @Body('action') action: 'arriving' | 'start' | 'complete',
  ) {
    return this.service.updateJobStatus(userId, bookingId, action);
  }

  @Get('earnings')
  @ApiOperation({ summary: 'Get provider earnings summary' })
  async getEarnings(@CurrentUser('id') userId: string) {
    return this.service.getEarnings(userId);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get provider profile details' })
  async getProfile(@CurrentUser('id') userId: string) {
    return this.service.getProfile(userId);
  }

  @Put('profile')
  @ApiOperation({ summary: 'Update provider profile' })
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.service.updateProfile(userId, dto);
  }
}
