import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users.query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Roles(UserRole.super_admin, UserRole.chairman)
  @Get()
  list(@Query() query: ListUsersQueryDto, @TenantId() tenantId?: string | null) {
    return this.users.listUsers(query, tenantId);
  }

  @Roles(UserRole.super_admin)
  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthUser) {
    return this.users.createUser(dto, user.id);
  }

  @Roles(UserRole.super_admin)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.users.updateUser(id, dto, user.id);
  }

  @Roles(UserRole.super_admin, UserRole.chairman)
  @Patch(':id/block')
  block(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.users.blockUser(id, user.id);
  }

  @Roles(UserRole.super_admin)
  @Post(':id/apartments/:apartmentId')
  linkApartment(
    @Param('id') id: string,
    @Param('apartmentId') apartmentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.users.linkApartment(id, apartmentId, user.id);
  }

  @Roles(UserRole.super_admin)
  @Delete(':id/apartments/:apartmentId')
  unlinkApartment(
    @Param('id') id: string,
    @Param('apartmentId') apartmentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.users.unlinkApartment(id, apartmentId, user.id);
  }
}