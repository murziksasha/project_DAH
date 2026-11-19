import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MeterType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class CreateMeterDto {
  @ApiProperty()
  @IsString()
  apartmentId!: string;

  @ApiProperty({ enum: MeterType })
  @IsEnum(MeterType)
  type!: MeterType;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  serialNumber?: string;

  /** Sent by the admin UI building switcher; the apartment defines the building. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  buildingId?: string;
}

export class MeterReadingDto {
  @ApiProperty({ example: '2026-06' })
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Період у форматі YYYY-MM' })
  period!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(1e9)
  value!: number;
}
