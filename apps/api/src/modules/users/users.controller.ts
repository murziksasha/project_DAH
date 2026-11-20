import { Permission } from '@dah/shared';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';

import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users.query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @RequirePermissions(Permission.MANAGE_USERS)
  @Get()
  list(@Query() query: ListUsersQueryDto, @TenantId() tenantId?: string | null) {
    return this.users.listUsers(query, tenantId);
  }

  @RequirePermissions(Permission.MANAGE_SETUP)
  @Post()
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId?: string | null,
  ) {
    return this.users.createUser(dto, user.id, tenantId);
  }

  @RequirePermissions(Permission.MANAGE_SETUP)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId?: string | null,
  ) {
    return this.users.updateUser(id, dto, user.id, tenantId);
  }

  @RequirePermissions(Permission.MANAGE_USERS)
  @Patch(':id/block')
  block(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId?: string | null,
  ) {
    return this.users.blockUser(id, user.id, tenantId);
  }

  @RequirePermissions(Permission.MANAGE_SETUP)
  @Post(':id/apartments/:apartmentId')
  linkApartment(
    @Param('id') id: string,
    @Param('apartmentId') apartmentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.users.linkApartment(id, apartmentId, user.id);
  }

  @RequirePermissions(Permission.MANAGE_SETUP)
  @Delete(':id/apartments/:apartmentId')
  unlinkApartment(
    @Param('id') id: string,
    @Param('apartmentId') apartmentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.users.unlinkApartment(id, apartmentId, user.id);
  }
}