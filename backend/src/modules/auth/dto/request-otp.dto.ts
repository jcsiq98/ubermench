import { IsString, IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RequestOtpDto {
  @ApiProperty({
    example: '+5215551234567',
    description: 'Phone number with country code',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+\d{10,15}$/, {
    message: 'Phone must be in international format: +[country code][number]',
  })
  phone: string;
}

