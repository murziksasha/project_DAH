import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

const ORG_ROLES = [
  UserRole.chairman,
  UserRole.accountant,
  UserRole.board,
  UserRole.dispatcher,
  UserRole.crew,
  UserRole.auditor,
  UserRole.resident,
] as const;

export class CreateRoleDto {
  @ApiProperty({ enum: ORG_ROLES })
  @IsEnum(ORG_ROLES)
  code!: (typeof ORG_ROLES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  labelUk?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  labelRu?: string;
}
