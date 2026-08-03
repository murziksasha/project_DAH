import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RequestPriority } from '@prisma/client';
import { IsArray, IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

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

  @ApiPropertyOptional({ enum: RequestPriority, default: RequestPriority.normal })
  @IsOptional()
  @IsEnum(RequestPriority)
  priority?: RequestPriority;

  @ApiPropertyOptional({ description: 'SLA due date ISO (auto from category if omitted)' })
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @ApiPropertyOptional({ type: [String], description: 'MinIO photo keys' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoKeys?: string[];
}