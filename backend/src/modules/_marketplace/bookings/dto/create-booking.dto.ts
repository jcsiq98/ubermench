import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBookingDto {
  @ApiProperty({ description: 'Provider profile ID' })
  @IsString()
  @IsNotEmpty()
  providerId: string;

  @ApiProperty({ description: 'Service category ID' })
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @ApiProperty({ description: 'Description of the service needed' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({ description: 'Address where service is needed' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ description: 'Latitude' })
  @IsNumber()
  @IsOptional()
  lat?: number;

  @ApiPropertyOptional({ description: 'Longitude' })
  @IsNumber()
  @IsOptional()
  lng?: number;

  @ApiPropertyOptional({ description: 'Scheduled date/time (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  scheduledAt?: string;
}


