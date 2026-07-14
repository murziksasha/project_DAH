import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'utilities' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_]+$/i, { message: 'Код: лише літери, цифри, _' })
  @MaxLength(64)
  code?: string;
}
