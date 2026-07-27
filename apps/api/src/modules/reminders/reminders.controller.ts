import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { RemindersService } from './reminders.service';

const WRITE = [UserRole.chairman, UserRole.accountant, UserRole.board];

@ApiTags('reminders')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('reminders')
export class RemindersController {
  constructor(private reminders: RemindersService) {}

  @Roles(...WRITE, UserRole.auditor)
  @Get()
  list(@Query('includeSent') includeSent?: string) {
    return this.reminders.list(includeSent === '1' || includeSent === 'true');
  }

  @Roles(...WRITE)
  @Post()
  create(@Body() dto: CreateReminderDto, @CurrentUser() user: AuthUser) {
    return this.reminders.create(dto, user.id);
  }

  @Roles(...WRITE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.reminders.remove(id);
  }

  @Roles(...WRITE)
  @Post('process')
  process() {
    return this.reminders.processDue();
  }

  @Roles(...WRITE)
  @Post('notify-debtors')
  notifyDebtors() {
    return this.reminders.notifyAllDebtors();
  }
}
