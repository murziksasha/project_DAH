import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateOnlinePaymentIntentDto {
  @ApiProperty()
  @IsString()
  apartmentId!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class OnlinePaymentWebhookDto {
  @ApiProperty({ description: 'Provider payment/order id' })
  @IsString()
  orderId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  signature?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({ description: 'Opaque payload from intent (JSON string or object)' })
  @IsOptional()
  payload?: unknown;
}
