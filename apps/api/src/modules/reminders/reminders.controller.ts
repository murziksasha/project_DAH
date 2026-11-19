import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { RemindersService } from './reminders.service';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { TenantAccessService } from '../../common/tenant-access/tenant-access.service';

const WRITE = [UserRole.chairman, UserRole.accountant, UserRole.board];

@ApiTags('reminders')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('reminders')
export class RemindersController {
  constructor(
    private reminders: RemindersService,
    private access: TenantAccessService,
  ) {}

  @Roles(...WRITE, UserRole.auditor, UserRole.super_admin)
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
    @Query('includeSent') includeSent?: string,
  ) {
    return this.reminders.list(
      includeSent === '1' || includeSent === 'true',
      this.access.effectiveTenantId(user, tenantId),
    );
  }

  @Roles(...WRITE)
  @Post()
  async create(
    @Body() dto: CreateReminderDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
  ) {
    const scope = this.access.effectiveTenantId(user, tenantId);
    if (dto.apartmentId) await this.access.assertApartment(user, dto.apartmentId, tenantId);
    return this.reminders.create(dto, user.id, scope);
  }

  @Roles(...WRITE)
  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
  ) {
    return this.reminders.remove(id, this.access.effectiveTenantId(user, tenantId));
  }

  /** Runs only for the caller's organization (worker processes all tenants). */
  @Roles(...WRITE, UserRole.super_admin)
  @Post('process')
  process(@CurrentUser() user: AuthUser, @TenantId() tenantId: string | null) {
    return this.reminders.processDue(this.access.effectiveTenantId(user, tenantId));
  }

  @Roles(...WRITE)
  @Post('notify-debtors')
  notifyDebtors(@CurrentUser() user: AuthUser, @TenantId() tenantId: string | null) {
    return this.reminders.notifyAllDebtors(this.access.effectiveTenantId(user, tenantId));
  }
}
