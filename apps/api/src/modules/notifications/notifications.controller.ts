import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { SubscribeDto } from './dto/subscribe.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get('vapid-public-key')
  getVapidKey() {
    return { publicKey: this.notifications.getPublicKey() };
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Post('subscribe')
  subscribe(@Body() dto: SubscribeDto, @CurrentUser() user: AuthUser) {
    return this.notifications.subscribe(user.id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Delete('subscribe')
  unsubscribe(@Body() dto: Pick<SubscribeDto, 'endpoint'>, @CurrentUser() user: AuthUser) {
    return this.notifications.unsubscribe(user.id, dto.endpoint);
  }
}