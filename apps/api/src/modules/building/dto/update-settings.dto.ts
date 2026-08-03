import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class SlaHoursByCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  sanitary?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  electric?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  cleaning?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  elevator?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  heating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  other?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  default?: number;
}

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

  @ApiPropertyOptional({ description: 'Days before due date for debt email reminders' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  reminderDaysBeforeDue?: number;

  @ApiPropertyOptional({ enum: ['uk', 'ru'] })
  @IsOptional()
  @IsIn(['uk', 'ru'])
  locale?: 'uk' | 'ru';

  @ApiPropertyOptional({
    description: 'SLA hours per request category (dispatcher)',
    type: SlaHoursByCategoryDto,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SlaHoursByCategoryDto)
  slaHoursByCategory?: SlaHoursByCategoryDto;
}