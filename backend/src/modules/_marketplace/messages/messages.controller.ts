import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { SendMessageDto } from './dto/send-message.dto';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

interface UserPayload {
  id: string;
  phone: string;
  name: string;
  role: string;
}

@ApiTags('Messages')
@ApiBearerAuth()
@Controller('api')
export class MessagesController {
  constructor(private messagesService: MessagesService) {}

  @Post('bookings/:bookingId/messages')
  @ApiOperation({ summary: 'Send a message in a booking chat' })
  async send(
    @CurrentUser() user: UserPayload,
    @Param('bookingId') bookingId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagesService.sendFromApp(bookingId, user.id, dto.content);
  }

  @Get('bookings/:bookingId/messages')
  @ApiOperation({ summary: 'Get chat message history for a booking' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Max messages to return (default 50)',
  })
  @ApiQuery({
    name: 'before',
    required: false,
    type: String,
    description: 'ISO date — fetch messages before this timestamp (pagination)',
  })
  async getHistory(
    @CurrentUser() user: UserPayload,
    @Param('bookingId') bookingId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.messagesService.getHistory(bookingId, user.id, {
      limit: limit ? parseInt(limit, 10) : 50,
      before,
    });
  }

  @Get('messages/unread')
  @ApiOperation({ summary: 'Get total unread message count for the current user' })
  async getUnreadCount(@CurrentUser() user: UserPayload) {
    const count = await this.messagesService.countUnread(user.id);
    return { count };
  }

  @Get('bookings/:bookingId/messages/unread')
  @ApiOperation({ summary: 'Get unread message count for a specific booking' })
  async getBookingUnreadCount(
    @CurrentUser() user: UserPayload,
    @Param('bookingId') bookingId: string,
  ) {
    const count = await this.messagesService.countUnreadForBooking(
      bookingId,
      user.id,
    );
    return { count };
  }
}

