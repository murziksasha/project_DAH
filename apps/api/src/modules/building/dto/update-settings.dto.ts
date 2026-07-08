import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateBuildingSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showDebtorsToResidents?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  registrationEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showBankDetailsToResidents?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  defaultAccrualDueDays?: number;

  @ApiPropertyOptional({ enum: ['uk', 'ru'] })
  @IsOptional()
  @IsIn(['uk', 'ru'])
  locale?: 'uk' | 'ru';
}