import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentSource } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

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
}