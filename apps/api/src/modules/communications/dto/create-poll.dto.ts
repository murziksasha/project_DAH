import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VoteWeightMode } from '@prisma/client';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

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

  @ApiPropertyOptional({ enum: VoteWeightMode, default: VoteWeightMode.one_per_user })
  @IsOptional()
  @IsEnum(VoteWeightMode)
  voteWeight?: VoteWeightMode;

  @ApiPropertyOptional({ description: 'Quorum percent of eligible weight (0-100)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  quorumPercent?: number;
}