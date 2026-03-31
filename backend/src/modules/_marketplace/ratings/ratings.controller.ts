import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { RatingsService } from './ratings.service';
import { CreateRatingDto } from './dto/create-rating.dto';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

interface UserPayload {
  id: string;
  phone: string;
  name: string;
  role: string;
}

@ApiTags('Ratings')
@ApiBearerAuth()
@Controller('api/bookings')
export class RatingsController {
  constructor(private ratingsService: RatingsService) {}

  @Post(':bookingId/rate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Rate a booking (customer rates provider or provider rates customer)' })
  @ApiResponse({ status: 201, description: 'Rating created successfully' })
  @ApiResponse({ status: 400, description: 'Booking not completed or invalid score' })
  @ApiResponse({ status: 403, description: 'Not a participant in this booking' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  @ApiResponse({ status: 409, description: 'Already rated this booking' })
  async rateBooking(
    @CurrentUser() user: UserPayload,
    @Param('bookingId') bookingId: string,
    @Body() dto: CreateRatingDto,
  ) {
    return this.ratingsService.rateBooking(bookingId, user.id, dto);
  }

  @Get(':bookingId/my-rating')
  @ApiOperation({ summary: 'Check if the current user has rated this booking' })
  @ApiResponse({ status: 200, description: 'Returns the rating if exists, or null' })
  async getMyRating(
    @CurrentUser() user: UserPayload,
    @Param('bookingId') bookingId: string,
  ) {
    const rating = await this.ratingsService.getRatingForBooking(bookingId, user.id);
    return { rated: !!rating, rating };
  }
}

