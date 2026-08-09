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
import { UserRole } from '@prisma/client';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateRoleDto } from './dto/create-role.dto';
import { ListRolesQueryDto } from './dto/list-roles.query.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';

@ApiTags('roles')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('roles')
export class RolesController {
  constructor(private roles: RolesService) {}

  @Roles(UserRole.super_admin, UserRole.chairman)
  @Get()
  list(@Query() query: ListRolesQueryDto, @TenantId() tenantId?: string | null) {
    return this.roles.listRoles(tenantId, Boolean(query.activeOnly));
  }

  @Roles(UserRole.super_admin)
  @Post()
  create(
    @Body() dto: CreateRoleDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId?: string | null,
  ) {
    return this.roles.createRole(tenantId, dto, user.id);
  }

  @Roles(UserRole.super_admin)
  @Patch(':code')
  update(
    @Param('code') code: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId?: string | null,
  ) {
    return this.roles.updateRole(tenantId, code, dto, user.id);
  }

  @Roles(UserRole.super_admin)
  @Delete(':code')
  remove(
    @Param('code') code: string,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId?: string | null,
  ) {
    return this.roles.deleteRole(tenantId, code, user.id);
  }
}
