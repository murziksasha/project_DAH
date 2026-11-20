import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '@dah/shared';
import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { MailService } from './mail.service';

@ApiTags('mail')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('mail')
export class MailController {
  constructor(private mail: MailService) {}

  @RequirePermissions(Permission.MANAGE_COMMUNICATIONS, Permission.PLATFORM_ADMIN)
  @Get('status')
  status() {
    return {
      smtpConfigured: this.mail.isConfigured(),
      appUrl: this.mail.getAppUrl(),
      mode: this.mail.isConfigured() ? 'smtp' : 'log',
    };
  }

  @RequirePermissions(Permission.MANAGE_COMMUNICATIONS, Permission.PLATFORM_ADMIN)
  @Get('logs')
  logs(@Query('limit') limit?: string) {
    return this.mail.listLogs(limit ? Number(limit) : 50);
  }

  @RequirePermissions(Permission.MANAGE_COMMUNICATIONS, Permission.PLATFORM_ADMIN)
  @Post('test')
  async test(@CurrentUser() user: AuthUser) {
    const result = await this.mail.sendTemplate(user.email, 'test', {
      firstName: user.email,
    });
    return { ...result, to: user.email };
  }
}
