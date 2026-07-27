import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateBankAccountDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  bankName!: string;

  @ApiProperty({ example: 'UA123456789012345678901234567' })
  @IsString()
  @MinLength(10)
  @MaxLength(34)
  iban!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({ description: 'Target building (defaults to first)' })
  @IsOptional()
  @IsString()
  buildingId?: string;
}

export class UpdateBankAccountDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(34)
  iban?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string | null;
}
