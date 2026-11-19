import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SmsService } from './sms.service';
import { SmsOtpSendDto, SmsOtpVerifyDto, SmsTestDto } from './dto/sms.dto';

@ApiTags('sms')
@Controller('sms')
export class SmsController {
  constructor(private sms: SmsService) {}

  @Get('status')
  status() {
    return this.sms.status();
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.chairman, UserRole.super_admin)
  @Post('test')
  test(@Body() body: SmsTestDto) {
    return this.sms.send(body.to, body.text ?? 'DAH test SMS');
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('otp/send')
  sendOtp(@Body() body: SmsOtpSendDto) {
    return this.sms.sendOtp(body.phone, body.purpose ?? 'login');
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('otp/verify')
  verifyOtp(@Body() body: SmsOtpVerifyDto) {
    const ok = this.sms.verifyOtp(body.phone, body.code, body.purpose ?? 'login');
    return { ok };
  }
}
