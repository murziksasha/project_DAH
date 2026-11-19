import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantsService } from './tenants.service';
import { CreateTenantDto, DeleteTenantDto, UpdateTenantDto } from './dto/tenant.dto';

@ApiTags('tenants')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.super_admin)
@Controller('tenants')
export class TenantsController {
  constructor(private tenants: TenantsService) {}

  @Get()
  list() {
    return this.tenants.list();
  }

  @Get(':id/delete-check')
  deleteCheck(@Param('id') id: string) {
    return this.tenants.getDeleteCheck(id);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.tenants.get(id);
  }

  @Post()
  create(
    @Body() body: CreateTenantDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tenants.create(body, user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateTenantDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tenants.update(id, body, user.id);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Body() body: DeleteTenantDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tenants.delete(id, body ?? {}, user.id);
  }
}
