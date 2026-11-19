import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ImportApartmentsCsvDto {
  @ApiProperty({ description: 'CSV: number,entrance,floor,area[,residents]' })
  @IsString()
  @MaxLength(2_000_000)
  csv!: string;

  @ApiPropertyOptional({ description: 'Target building (default: first building of the organization)' })
  @IsOptional()
  @IsString()
  buildingId?: string;
}
