import { Permission } from '@dah/shared';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';

import { CreateRoleDto } from './dto/create-role.dto';
import { ListRolesQueryDto } from './dto/list-roles.query.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';

@ApiTags('roles')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('roles')
export class RolesController {
  constructor(private roles: RolesService) {}

  @RequirePermissions(Permission.MANAGE_USERS)
  @Get()
  list(@Query() query: ListRolesQueryDto, @TenantId() tenantId?: string | null) {
    return this.roles.listRoles(tenantId, Boolean(query.activeOnly));
  }

  @RequirePermissions(Permission.MANAGE_SETUP)
  @Post()
  create(
    @Body() dto: CreateRoleDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId?: string | null,
  ) {
    return this.roles.createRole(tenantId, dto, user.id);
  }

  @RequirePermissions(Permission.MANAGE_SETUP)
  @Patch(':code')
  update(
    @Param('code') code: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId?: string | null,
  ) {
    return this.roles.updateRole(tenantId, code, dto, user.id);
  }

  @RequirePermissions(Permission.MANAGE_SETUP)
  @Delete(':code')
  remove(
    @Param('code') code: string,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId?: string | null,
  ) {
    return this.roles.deleteRole(tenantId, code, user.id);
  }
}
