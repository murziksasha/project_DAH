import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SmsLoginRequestDto {
  @ApiProperty()
  @IsString()
  @MinLength(5)
  @MaxLength(32)
  phone!: string;
}

export class SmsLoginVerifyDto extends SmsLoginRequestDto {
  @ApiProperty()
  @IsString()
  @MaxLength(16)
  code!: string;
}

export class EmailNotifyDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}

export class RejectUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
