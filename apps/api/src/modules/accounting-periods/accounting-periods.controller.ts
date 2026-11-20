import { Permission } from '@dah/shared';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccountingPeriodStatus } from '../../prisma/client';
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { TenantAccessService } from '../../common/tenant-access/tenant-access.service';
import { AccountingPeriodsService } from './accounting-periods.service';

class SetPeriodStatusDto {
  @IsString()
  buildingId!: string;

  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period!: string;

  @IsEnum(AccountingPeriodStatus)
  status!: AccountingPeriodStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}


@ApiTags('finance-periods')
@ApiBearerAuth()
@Controller('finance/periods')
export class AccountingPeriodsController {
  constructor(
    private periods: AccountingPeriodsService,
    private access: TenantAccessService,
  ) {}

  @RequirePermissions(Permission.READ_FINANCE)
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @Get()
  async list(@Query('buildingId') buildingId: string, @CurrentUser() user: AuthUser) {
    // L11: only periods of a building in the caller's organization
    const id = await this.access.resolveBuilding(user, buildingId);
    return this.periods.list(id);
  }

  @RequirePermissions(Permission.READ_FINANCE)
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @Get('checklist')
  async checklist(
    @Query('buildingId') buildingId: string,
    @Query('period') period: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.access.assertBuilding(user, buildingId);
    return this.periods.closeChecklist(buildingId, period, user);
  }

  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @RequirePermissions(Permission.MANAGE_FINANCE, Permission.PLATFORM_ADMIN)
  @Patch()
  async setStatus(@Body() dto: SetPeriodStatusDto, @CurrentUser() user: AuthUser) {
    await this.access.assertBuilding(user, dto.buildingId);
    return this.periods.setStatus(
      dto.buildingId,
      dto.period,
      dto.status,
      user.id,
      user.role,
      dto.notes,
      user,
    );
  }
}
