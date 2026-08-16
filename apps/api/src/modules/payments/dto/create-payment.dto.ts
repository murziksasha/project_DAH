import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentSource } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ManualPaymentAllocationDto {
  @ApiProperty()
  @IsString()
  accrualLineId!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;
}

export class CreatePaymentDto {
  @ApiProperty()
  @IsString()
  apartmentId!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiProperty()
  @IsDateString()
  date!: string;

  @ApiProperty({ enum: PaymentSource })
  @IsEnum(PaymentSource)
  source!: PaymentSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reference?: string;

  /**
   * Optional manual allocation (override FIFO).
   * Remaining amount after allocations becomes advance.
   */
  @ApiPropertyOptional({ type: [ManualPaymentAllocationDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualPaymentAllocationDto)
  allocations?: ManualPaymentAllocationDto[];
}