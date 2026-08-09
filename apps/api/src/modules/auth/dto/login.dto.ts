import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  /** Optional TOTP when 2FA is already known (skip second step). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(6, 6)
  code?: string;

  /** Prefer this organization when the user has multiple memberships. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantId?: string;

  /** Prefer this role (with tenantId) when multiple roles exist in one org. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  role?: string;
}
