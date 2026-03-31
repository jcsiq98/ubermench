import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AddressesService } from './addresses.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IsString, IsNotEmpty, IsNumber, IsOptional, IsBoolean } from 'class-validator';

export class CreateAddressDto {
  @IsString() @IsNotEmpty()
  label: string;

  @IsString() @IsNotEmpty()
  address: string;

  @IsNumber()
  lat: number;

  @IsNumber()
  lng: number;

  @IsOptional() @IsBoolean()
  isDefault?: boolean;
}

export class UpdateAddressDto {
  @IsOptional() @IsString()
  label?: string;

  @IsOptional() @IsString()
  address?: string;

  @IsOptional() @IsNumber()
  lat?: number;

  @IsOptional() @IsNumber()
  lng?: number;

  @IsOptional() @IsBoolean()
  isDefault?: boolean;
}

@ApiTags('Addresses')
@ApiBearerAuth()
@Controller('api/addresses')
export class AddressesController {
  constructor(private addressesService: AddressesService) {}

  @Get()
  @ApiOperation({ summary: 'List saved addresses for the current user' })
  async list(@CurrentUser('id') userId: string) {
    return this.addressesService.list(userId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new saved address' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAddressDto,
  ) {
    return this.addressesService.create(userId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a saved address' })
  async update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressesService.update(userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a saved address' })
  async delete(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.addressesService.delete(userId, id);
  }
}
