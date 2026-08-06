import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { KEP_PROVIDERS } from '../kep.types';

export class StartKepSignDto {
  @ApiPropertyOptional({ enum: KEP_PROVIDERS })
  @IsOptional()
  @IsIn(KEP_PROVIDERS as unknown as string[])
  provider?: string;

  @ApiPropertyOptional({ description: 'Browser return URL after IdP' })
  @IsOptional()
  @IsString()
  returnUrl?: string;
}

export class CompleteKepSignDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ description: 'Base64 CAdES/CMS detached signature' })
  @IsOptional()
  @IsString()
  @MinLength(32)
  signatureCms?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  certificateSubject?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  certificateSerial?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  providerPayload?: Record<string, unknown>;
}
