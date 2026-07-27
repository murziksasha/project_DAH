import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateRequestDto {
  @ApiProperty()
  @IsString()
  title!: string;

  @ApiProperty()
  @IsString()
  description!: string;

  @ApiProperty({ example: 'sanitary' })
  @IsString()
  category!: string;

  @ApiPropertyOptional({ description: 'SLA due date ISO' })
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @ApiPropertyOptional({ type: [String], description: 'MinIO photo keys' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoKeys?: string[];
}