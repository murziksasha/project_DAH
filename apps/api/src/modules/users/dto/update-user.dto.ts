import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, UserStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

const UPDATABLE_ROLES = [
  UserRole.chairman,
  UserRole.accountant,
  UserRole.board,
  UserRole.auditor,
  UserRole.resident,
] as const;

export class UpdateUserDto {
  @ApiPropertyOptional({ enum: UPDATABLE_ROLES })
  @IsOptional()
  @IsEnum(UPDATABLE_ROLES)
  role?: (typeof UPDATABLE_ROLES)[number];

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}