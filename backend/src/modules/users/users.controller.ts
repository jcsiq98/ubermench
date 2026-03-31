import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Req,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';

@ApiTags('Users')
@Controller('api/users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me/profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get full profile of current user' })
  async getMyProfile(@Req() req: any) {
    const profile = await this.usersService.getFullProfile(req.user.id);
    if (!profile) throw new NotFoundException('User not found');
    return profile;
  }

  @Put('me/profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user profile' })
  async updateMyProfile(
    @Req() req: any,
    @Body() body: { name?: string; email?: string; avatarUrl?: string },
  ) {
    return this.usersService.updateProfile(req.user.id, body);
  }

  @Get('me/history')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get booking history for current user' })
  async getMyHistory(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('status') status?: string,
  ) {
    return this.usersService.getBookingHistory(req.user.id, {
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
      status,
    });
  }

  @Delete('me/account')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete current user account (ARCO compliance)' })
  async deleteMyAccount(@Req() req: any) {
    return this.usersService.deleteAccount(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  async getUser(@Param('id') id: string) {
    const user = await this.usersService.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
