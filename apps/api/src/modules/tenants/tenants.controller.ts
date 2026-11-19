import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantsService } from './tenants.service';

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
    @Body()
    body: {
      name: string;
      slug: string;
      /** osbb | management_company */
      orgType?: string;
      chairmanEmail?: string;
      chairmanPassword?: string;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.tenants.create(body, user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: { name?: string; isActive?: boolean; orgType?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.tenants.update(id, body, user.id);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Body() body: { confirmSlug?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.tenants.delete(id, body ?? {}, user.id);
  }
}
