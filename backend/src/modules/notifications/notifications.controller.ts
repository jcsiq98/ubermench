import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('api/notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  // ─── Device Tokens ──────────────────────────────────────────

  @Post('device-token')
  @ApiOperation({ summary: 'Register FCM device token' })
  async registerToken(
    @Req() req: any,
    @Body() body: { token: string; platform?: string },
  ) {
    await this.notificationsService.registerDeviceToken(
      req.user.id,
      body.token,
      body.platform || 'web',
    );
    return { success: true };
  }

  @Delete('device-token')
  @ApiOperation({ summary: 'Remove FCM device token' })
  async removeToken(@Body() body: { token: string }) {
    await this.notificationsService.removeDeviceToken(body.token);
    return { success: true };
  }

  // ─── Preferences ────────────────────────────────────────────

  @Get('preferences')
  @ApiOperation({ summary: 'Get notification preferences' })
  async getPreferences(@Req() req: any) {
    return this.notificationsService.getPreferences(req.user.id);
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Update notification preferences' })
  async updatePreferences(
    @Req() req: any,
    @Body()
    body: {
      bookingUpdates?: boolean;
      messages?: boolean;
      promotions?: boolean;
      weeklyReport?: boolean;
      pushEnabled?: boolean;
      whatsappEnabled?: boolean;
    },
  ) {
    return this.notificationsService.updatePreferences(req.user.id, body);
  }

  // ─── Notifications List ────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Get notifications for current user' })
  async getNotifications(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.notificationsService.getNotifications(req.user.id, {
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
      unreadOnly: unreadOnly === 'true',
    });
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  async getUnreadCount(@Req() req: any) {
    const count = await this.notificationsService.getUnreadCount(req.user.id);
    return { count };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  async markAsRead(@Req() req: any, @Param('id') id: string) {
    await this.notificationsService.markAsRead(req.user.id, id);
    return { success: true };
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllAsRead(@Req() req: any) {
    await this.notificationsService.markAllAsRead(req.user.id);
    return { success: true };
  }
}
