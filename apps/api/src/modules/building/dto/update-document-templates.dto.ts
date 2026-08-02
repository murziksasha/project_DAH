import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsObject, IsOptional } from 'class-validator';

/**
 * Full document templates config (forms + export profiles).
 * Validated loosely; normalized via @dah/shared on save.
 */
export class UpdateDocumentTemplatesDto {
  @ApiProperty({ description: 'Print / PDF document templates (layout blocks)' })
  @IsArray()
  forms!: unknown[];

  @ApiProperty({ description: 'Excel export column profiles' })
  @IsArray()
  exports!: unknown[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}
