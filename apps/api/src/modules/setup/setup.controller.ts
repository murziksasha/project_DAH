import { Permission } from '@dah/shared';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';

import { SetupApartmentsDto } from './dto/setup-apartment.dto';
import { SetupBankDto } from './dto/setup-bank.dto';
import { SetupBuildingDto } from './dto/setup-building.dto';
import { SetupUsersDto } from './dto/setup-users.dto';
import { SetupService } from './setup.service';

@ApiTags('setup')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('setup')
export class SetupController {
  constructor(private setup: SetupService) {}

  @RequirePermissions(Permission.MANAGE_SETUP)
  @Get('status')
  status(@TenantId() tenantId?: string | null) {
    return this.setup.getStatus(tenantId);
  }

  @RequirePermissions(Permission.MANAGE_SETUP)
  @Post('building')
  building(
    @Body() dto: SetupBuildingDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId?: string | null,
  ) {
    return this.setup.upsertBuilding(dto, user.id, tenantId);
  }

  @RequirePermissions(Permission.MANAGE_SETUP)
  @Post('bank')
  bank(
    @Body() dto: SetupBankDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId?: string | null,
  ) {
    return this.setup.setupBank(dto, user.id, tenantId);
  }

  @RequirePermissions(Permission.MANAGE_SETUP)
  @Post('apartments')
  apartments(
    @Body() dto: SetupApartmentsDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId?: string | null,
  ) {
    return this.setup.setupApartments(dto, user.id, tenantId);
  }

  @RequirePermissions(Permission.MANAGE_SETUP)
  @Post('users')
  users(
    @Body() dto: SetupUsersDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId?: string | null,
  ) {
    return this.setup.setupUsers(dto, user.id, tenantId);
  }

  @RequirePermissions(Permission.MANAGE_SETUP)
  @Post('complete')
  complete(@CurrentUser() user: AuthUser, @TenantId() tenantId?: string | null) {
    return this.setup.complete(user.id, tenantId);
  }
}