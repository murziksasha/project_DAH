import { Permission } from '@dah/shared';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

import { TenantsService } from './tenants.service';
import { CreateTenantDto, DeleteTenantDto, UpdateTenantDto } from './dto/tenant.dto';

@ApiTags('tenants')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private tenants: TenantsService) {}

  @RequirePermissions(Permission.MANAGE_SETUP)
  @Get()
  list() {
    return this.tenants.list();
  }

  @RequirePermissions(Permission.MANAGE_SETUP)
  @Get(':id/delete-check')
  deleteCheck(@Param('id') id: string) {
    return this.tenants.getDeleteCheck(id);
  }

  @RequirePermissions(Permission.MANAGE_SETUP)
  @Get(':id')
  get(@Param('id') id: string) {
    return this.tenants.get(id);
  }

  @RequirePermissions(Permission.MANAGE_SETUP)
  @Post()
  create(
    @Body() body: CreateTenantDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tenants.create(body, user.id);
  }

  @RequirePermissions(Permission.MANAGE_SETUP)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateTenantDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tenants.update(id, body, user.id);
  }

  @RequirePermissions(Permission.MANAGE_SETUP)
  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Body() body: DeleteTenantDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tenants.delete(id, body ?? {}, user.id);
  }
}
