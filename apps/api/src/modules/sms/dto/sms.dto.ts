import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SmsTestDto {
  @ApiProperty()
  @IsString()
  @MinLength(5)
  @MaxLength(32)
  to!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(480)
  text?: string;
}

export class SmsOtpSendDto {
  @ApiProperty()
  @IsString()
  @MinLength(5)
  @MaxLength(32)
  phone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  purpose?: string;
}

export class SmsOtpVerifyDto extends SmsOtpSendDto {
  @ApiProperty()
  @IsString()
  @MaxLength(16)
  code!: string;
}
