import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MeetingStatus, MeetingType, VoteWeightMode } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class AgendaItemDto {
  @ApiProperty()
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];
}

export class CreateMeetingDto {
  @ApiProperty()
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: MeetingType })
  @IsOptional()
  @IsEnum(MeetingType)
  type?: MeetingType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  buildingId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  quorumPercent?: number;

  @ApiPropertyOptional({ enum: VoteWeightMode })
  @IsOptional()
  @IsEnum(VoteWeightMode)
  voteWeight?: VoteWeightMode;

  @ApiPropertyOptional({ type: [AgendaItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgendaItemDto)
  @ArrayMinSize(0)
  agenda?: AgendaItemDto[];
}

export class UpdateMeetingStatusDto {
  @ApiProperty({ enum: MeetingStatus })
  @IsEnum(MeetingStatus)
  status!: MeetingStatus;
}

export class VoteAgendaDto {
  @ApiProperty({ description: 'Option text, e.g. За' })
  @IsString()
  optionKey!: string;
}

export class SignMeetingDto {
  @ApiPropertyOptional({
    description: 'mock | diia | cloud_kep | cades — default from KEP_PROVIDER',
  })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional({ description: 'Return URL after IdP redirect' })
  @IsOptional()
  @IsString()
  returnUrl?: string;
}
