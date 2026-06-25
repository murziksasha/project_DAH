import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class VotePollDto {
  @ApiProperty()
  @IsString()
  optionId!: string;
}