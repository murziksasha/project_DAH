import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { MailService } from './mail.service';

@ApiTags('mail')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('mail')
export class MailController {
  constructor(private mail: MailService) {}

  @Roles(UserRole.chairman, UserRole.board, UserRole.super_admin)
  @Get('status')
  status() {
    return {
      smtpConfigured: this.mail.isConfigured(),
      appUrl: this.mail.getAppUrl(),
      mode: this.mail.isConfigured() ? 'smtp' : 'log',
    };
  }

  @Roles(UserRole.chairman, UserRole.board, UserRole.super_admin)
  @Get('logs')
  logs(@Query('limit') limit?: string) {
    return this.mail.listLogs(limit ? Number(limit) : 50);
  }

  @Roles(UserRole.chairman, UserRole.board, UserRole.super_admin)
  @Post('test')
  async test(@CurrentUser() user: AuthUser) {
    const result = await this.mail.sendTemplate(user.email, 'test', {
      firstName: user.email,
    });
    return { ...result, to: user.email };
  }
}
