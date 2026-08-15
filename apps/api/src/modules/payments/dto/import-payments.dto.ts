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
  @ApiProperty({
    description: 'Bank statement text (CSV / TSV / MT940). Field name kept as csv for API compatibility.',
  })
  @IsString()
  csv!: string;

  @ApiPropertyOptional({
    description:
      'Statement format: auto | generic_csv | privatbank | monobank | oschadbank | mt940',
    default: 'auto',
  })
  @IsOptional()
  @IsString()
  format?: string;

  @ApiPropertyOptional({ description: 'Limit apartment matching to building' })
  @IsOptional()
  @IsString()
  buildingId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceFileName?: string;
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

  @ApiPropertyOptional({ description: 'BankStatementLine id from preview' })
  @IsOptional()
  @IsString()
  lineId?: string;
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

  @ApiPropertyOptional({ description: 'BankStatement id from preview' })
  @IsOptional()
  @IsString()
  statementId?: string;
}

export class AssignStatementLineDto {
  @ApiProperty()
  @IsString()
  apartmentId!: string;
}
