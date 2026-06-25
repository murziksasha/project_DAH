import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccrualDistribution } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateAccrualTemplateDto {
  @ApiProperty()
  @IsString()
  fundId!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ enum: AccrualDistribution })
  @IsEnum(AccrualDistribution)
  distribution!: AccrualDistribution;

  @ApiPropertyOptional({ description: 'Тариф грн/м² для by_area' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rate?: number;

  @ApiPropertyOptional({ description: 'Фікс. сума для fixed_per_apartment' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  fixedAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}