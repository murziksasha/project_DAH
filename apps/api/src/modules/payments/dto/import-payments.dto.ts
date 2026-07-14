import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentSource } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ImportPreviewDto {
  @ApiProperty({ description: 'CSV text of bank statement' })
  @IsString()
  csv!: string;
}

export class ImportPaymentRowDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reference?: string;
}

export class ImportPaymentsDto {
  @ApiProperty({ type: [ImportPaymentRowDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ImportPaymentRowDto)
  rows!: ImportPaymentRowDto[];

  @ApiPropertyOptional({ enum: PaymentSource, default: PaymentSource.bank })
  @IsOptional()
  @IsEnum(PaymentSource)
  source?: PaymentSource;
}
