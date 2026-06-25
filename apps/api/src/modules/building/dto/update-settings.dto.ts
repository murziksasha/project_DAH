import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateBuildingSettingsDto {
  @ApiProperty()
  @IsBoolean()
  showDebtorsToResidents!: boolean;
}