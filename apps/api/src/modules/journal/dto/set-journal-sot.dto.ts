import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** Phase 3: per-building Journal-SoT switch (reversible; enabling is guarded by the readiness streak). */
export class SetJournalSotDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  buildingId!: string;

  @ApiProperty({ description: 'true = reads from journal projectors, false = legacy reads (rollback)' })
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional({ description: 'super_admin only: switch before the streak is reached' })
  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @ApiPropertyOptional({ description: 'Required with force (audited)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
