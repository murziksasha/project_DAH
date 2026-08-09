import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const CREATABLE_ROLES = [
  UserRole.chairman,
  UserRole.accountant,
  UserRole.board,
  UserRole.dispatcher,
  UserRole.crew,
  UserRole.auditor,
  /** Secondary persona: same person as staff + resident in one org */
  UserRole.resident,
] as const;

export class CreateUserDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  /** Required for new identity; optional when adding membership to existing email. */
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((o: CreateUserDto) => o.password !== undefined && o.password !== '')
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;

  @ApiProperty()
  @IsString()
  firstName!: string;

  @ApiProperty()
  @IsString()
  lastName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ enum: CREATABLE_ROLES })
  @IsEnum(CREATABLE_ROLES)
  role!: (typeof CREATABLE_ROLES)[number];
}