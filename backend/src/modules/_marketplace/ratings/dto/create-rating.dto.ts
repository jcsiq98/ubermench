import { IsInt, Min, Max, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRatingDto {
  @ApiProperty({
    description: 'Rating score from 1 to 5',
    minimum: 1,
    maximum: 5,
    example: 5,
  })
  @IsInt()
  @Min(1, { message: 'Score must be at least 1' })
  @Max(5, { message: 'Score must be at most 5' })
  score: number;

  @ApiPropertyOptional({
    description: 'Optional comment about the service',
    maxLength: 500,
    example: 'Excelente servicio, muy puntual y profesional.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Comment must be at most 500 characters' })
  comment?: string;
}

