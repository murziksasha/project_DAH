import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccrualDistribution, MeterType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

export class ManualAccrualLineDto {
  @ApiProperty()
  @IsString()
  apartmentId!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;
}

export class CreateAccrualDto {
  @ApiProperty()
  @IsString()
  fundId!: string;

  @ApiProperty({ example: '2026-06' })
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'Період у форматі YYYY-MM' })
  period!: string;

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  templateId?: string;

  @ApiProperty({ enum: AccrualDistribution })
  @IsEnum(AccrualDistribution)
  distribution!: AccrualDistribution;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  fixedAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ type: [ManualAccrualLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualAccrualLineDto)
  manualLines?: ManualAccrualLineDto[];

  /** For by_meter: filter meters by type (optional = all types). */
  @ApiPropertyOptional({ enum: MeterType })
  @IsOptional()
  @IsEnum(MeterType)
  meterType?: MeterType;
}