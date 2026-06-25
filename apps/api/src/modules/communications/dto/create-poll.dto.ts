import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class CreatePollDto {
  @ApiProperty()
  @IsString()
  question!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  options!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string;
}