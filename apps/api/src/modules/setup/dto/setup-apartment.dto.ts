import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

class ApartmentItemDto {
  @ApiProperty()
  @IsString()
  number!: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  entrance?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  floor?: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  area!: number;
}

export class SetupApartmentsDto {
  @ApiProperty({ type: [ApartmentItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApartmentItemDto)
  apartments!: ApartmentItemDto[];
}