import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

class FundSetupDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ enum: ['maintenance', 'capital_repair', 'special'] })
  @IsString()
  type!: 'maintenance' | 'capital_repair' | 'special';

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  openingBalance?: number;
}

export class SetupBankDto {
  @ApiProperty()
  @IsString()
  bankName!: string;

  @ApiProperty()
  @IsString()
  iban!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ type: [FundSetupDto] })
  @ValidateNested({ each: true })
  @Type(() => FundSetupDto)
  funds!: FundSetupDto[];
}