import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { UserRole } from '@prisma/client';

const SETUP_ROLES = [
  UserRole.chairman,
  UserRole.accountant,
  UserRole.auditor,
  UserRole.board,
] as const;

class SetupUserItemDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

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

  @ApiProperty({ enum: SETUP_ROLES })
  @IsIn(SETUP_ROLES)
  role!: (typeof SETUP_ROLES)[number];
}

export class SetupUsersDto {
  @ApiProperty({ type: [SetupUserItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetupUserItemDto)
  users!: SetupUserItemDto[];
}