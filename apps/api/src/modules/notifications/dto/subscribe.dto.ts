import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class SubscribeDto {
  @ApiProperty()
  @IsString()
  endpoint!: string;

  @ApiProperty()
  @IsString()
  p256dh!: string;

  @ApiProperty()
  @IsString()
  auth!: string;
}