import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccrualDistribution, PaymentSource } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

export class CreateWriteOffDto {
  @ApiProperty() @IsString() @IsNotEmpty() apartmentId!: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.01) amount!: number;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(1000) reason!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accrualLineId?: string;
}

export class CreateTariffDto {
  @ApiProperty() @IsString() @IsNotEmpty() buildingId!: string;
  @ApiProperty() @IsString() @IsNotEmpty() fundId!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @ApiPropertyOptional({ enum: AccrualDistribution })
  @IsOptional()
  @IsEnum(AccrualDistribution)
  distribution?: AccrualDistribution;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) rate?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) fixedAmount?: number;
  @ApiProperty() @IsString() @IsNotEmpty() effectiveFrom!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() effectiveTo?: string;
}

export class UpdateTariffDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) rate?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) fixedAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() effectiveTo?: string | null;
}

export class CreateSupplierInvoiceDto {
  @ApiProperty() @IsString() @IsNotEmpty() buildingId!: string;
  @ApiProperty() @IsString() @IsNotEmpty() supplierId!: string;
  @ApiProperty() @IsString() @IsNotEmpty() fundId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) number?: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.01) amount!: number;
  @ApiProperty() @IsString() @IsNotEmpty() date!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() documentKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() approve?: boolean;
}

export class PaySupplierInvoiceDto {
  @ApiProperty() @IsString() @IsNotEmpty() invoiceId!: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.01) amount!: number;
  @ApiProperty() @IsString() @IsNotEmpty() date!: string;
  @ApiPropertyOptional({ enum: PaymentSource }) @IsOptional() @IsEnum(PaymentSource) source?: PaymentSource;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
}

export class CreateBankReconciliationDto {
  @ApiProperty() @IsString() @IsNotEmpty() buildingId!: string;
  @ApiProperty() @IsString() @IsNotEmpty() bankAccountId!: string;
  @ApiProperty() @Matches(PERIOD) period!: string;
  @ApiProperty() @Type(() => Number) @IsNumber() statementBalance!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class CloseSnapshotDto {
  @ApiProperty() @IsString() @IsNotEmpty() buildingId!: string;
  @ApiProperty() @Matches(PERIOD) period!: string;
}

export class RunTariffsDto {
  @ApiProperty() @IsString() @IsNotEmpty() buildingId!: string;
  @ApiProperty() @Matches(PERIOD) period!: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tariffIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() dryRun?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() dueDate?: string;
}

export class YearEndDto {
  @ApiProperty() @IsString() @IsNotEmpty() buildingId!: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(2000) @Max(2100) year!: number;
}

export class AdjustmentLineDto {
  @ApiProperty() @IsString() @IsNotEmpty() account!: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) debit?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) credit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() fundId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() apartmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() supplierId?: string;
}

export class ManualAdjustmentDto {
  @ApiProperty() @IsString() @IsNotEmpty() buildingId!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(1000) description!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() valueDate?: string;
  @ApiProperty({ type: [AdjustmentLineDto] })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AdjustmentLineDto)
  lines!: AdjustmentLineDto[];
}
