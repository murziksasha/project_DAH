import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateFundTransferDto {
  @ApiProperty()
  @IsString()
  fromFundId!: string;

  @ApiProperty()
  @IsString()
  toFundId!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiProperty()
  @IsDateString()
  date!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class VoidFundTransferDto {
  @ApiProperty()
  @IsString()
  reason!: string;
}
