import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({
    description: 'Message content',
    example: '¿A qué hora puedes venir?',
    maxLength: 2000,
  })
  @IsString()
  @IsNotEmpty({ message: 'Message content cannot be empty' })
  @MaxLength(2000, { message: 'Message too long (max 2000 characters)' })
  content: string;
}

