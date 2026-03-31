import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIs...',
    description: 'Refresh token obtained during login',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

