import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateRequestDto {
  @ApiProperty()
  @IsString()
  title!: string;

  @ApiProperty()
  @IsString()
  description!: string;

  @ApiProperty({ example: 'sanitary' })
  @IsString()
  category!: string;
}