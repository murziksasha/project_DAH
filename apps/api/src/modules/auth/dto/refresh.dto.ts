import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RefreshDto {
  /** Optional when HttpOnly cookie `dah_refresh` is present. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
