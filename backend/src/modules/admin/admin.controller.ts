import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { QueueService } from '../../common/queues/queue.service';
import { QUEUE_NAMES } from '../../common/queues/queue.constants';

@ApiTags('Admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('api/admin')
export class AdminController {
  constructor(
    private service: AdminService,
    private queueService: QueueService,
  ) {}

  // ─── Applications ─────────────────────────────────────────

  @Get('applications')
  @ApiOperation({ summary: 'List provider applications (paginated, filterable)' })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'DOCS_SUBMITTED', 'APPROVED', 'REJECTED'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async getApplications(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.getApplications({
      status,
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @Get('applications/:id')
  @ApiOperation({ summary: 'Get application detail with photos' })
  async getApplication(@Param('id') id: string) {
    return this.service.getApplicationById(id);
  }

  @Patch('applications/:id/approve')
  @ApiOperation({ summary: 'Approve application and specify tier' })
  async approveApplication(
    @Param('id') id: string,
    @CurrentUser('id') adminUserId: string,
    @Body('tier') tier?: number,
  ) {
    return this.service.approveApplication(id, adminUserId, tier || 1);
  }

  @Patch('applications/:id/reject')
  @ApiOperation({ summary: 'Reject application with reason' })
  async rejectApplication(
    @Param('id') id: string,
    @CurrentUser('id') adminUserId: string,
    @Body('reason') reason: string,
  ) {
    return this.service.rejectApplication(id, adminUserId, reason);
  }

  // ─── Stats ────────────────────────────────────────────────

  @Get('stats')
  @ApiOperation({ summary: 'Get admin dashboard stats' })
  async getStats() {
    return this.service.getStats();
  }

  // ─── Providers ────────────────────────────────────────────

  @Get('providers')
  @ApiOperation({ summary: 'List active providers with management info' })
  @ApiQuery({ name: 'tier', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async getProviders(
    @Query('tier') tier?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.getProviders({
      tier: tier ? parseInt(tier, 10) : undefined,
      search,
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @Patch('providers/:id/tier')
  @ApiOperation({ summary: 'Update provider tier' })
  async updateProviderTier(
    @Param('id') id: string,
    @CurrentUser('id') adminUserId: string,
    @Body('tier') tier: number,
  ) {
    return this.service.updateProviderTier(id, tier, adminUserId);
  }

  // ─── Queue Monitoring ─────────────────────────────────────

  @Get('queues/stats')
  @ApiOperation({ summary: 'Get BullMQ queue statistics' })
  async getQueueStats() {
    const stats: Record<string, any> = {
      enabled: this.queueService.isEnabled(),
    };

    if (!this.queueService.isEnabled()) return stats;

    for (const [key, name] of Object.entries(QUEUE_NAMES)) {
      stats[key.toLowerCase()] = await this.queueService.getQueueStats(name);
    }

    return stats;
  }
}
