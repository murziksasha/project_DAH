import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class VoidExpenseDto {
  @ApiProperty({ description: 'Причина анулювання' })
  @IsString()
  @MinLength(3)
  reason!: string;
}