import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FundType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateFundDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ enum: FundType })
  @IsEnum(FundType)
  type!: FundType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  openingBalance?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankAccountId?: string | null;

  @ApiPropertyOptional({ description: 'Target building (defaults to first)' })
  @IsOptional()
  @IsString()
  buildingId?: string;
}
