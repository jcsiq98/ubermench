import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

interface UserPayload {
  id: string;
  phone: string;
  name: string;
  role: string;
}

@ApiTags('Bookings')
@ApiBearerAuth()
@Controller('api/bookings')
export class BookingsController {
  constructor(private bookingsService: BookingsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new booking / service request' })
  async create(
    @CurrentUser() user: UserPayload,
    @Body() dto: CreateBookingDto,
  ) {
    return this.bookingsService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my bookings (as customer)' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'completed', 'cancelled'],
    description: 'Filter by status group',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async list(
    @CurrentUser() user: UserPayload,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.bookingsService.listByCustomer(user.id, {
      status: status as 'active' | 'completed' | 'cancelled' | undefined,
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get booking detail' })
  async getById(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
  ) {
    return this.bookingsService.getById(id, user.id);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel a booking (only PENDING or ACCEPTED)' })
  async cancel(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() dto: CancelBookingDto,
  ) {
    return this.bookingsService.cancel(id, user.id, dto.reason);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Dismiss/delete a cancelled or rejected booking from history' })
  async dismiss(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
  ) {
    return this.bookingsService.dismiss(id, user.id);
  }
}


