import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class SetupBuildingDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  address!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  edrpou?: string;
}