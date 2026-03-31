import { IsString, IsNotEmpty, Matches, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyOtpDto {
  @ApiProperty({
    example: '+5215551234567',
    description: 'Phone number used to request the OTP',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+\d{10,15}$/, {
    message: 'Phone must be in international format: +[country code][number]',
  })
  phone: string;

  @ApiProperty({
    example: '123456',
    description: '6-digit OTP code',
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'OTP code must be exactly 6 digits' })
  @Matches(/^\d{6}$/, { message: 'OTP code must be numeric' })
  code: string;
}

