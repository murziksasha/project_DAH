import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class SelectTenantDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  tenantId!: string;

  /** Required when the user has multiple roles in the same organization. */
  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
