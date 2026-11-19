import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class IdentityAuthorizeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  returnTo?: string;
}

export class IdentityCallbackDto {
  @ApiProperty()
  @IsString()
  @MaxLength(512)
  state!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(254)
  email?: string;
}
