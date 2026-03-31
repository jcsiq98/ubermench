import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CancelBookingDto {
  @ApiPropertyOptional({ description: 'Reason for cancellation' })
  @IsString()
  @IsOptional()
  reason?: string;
}


