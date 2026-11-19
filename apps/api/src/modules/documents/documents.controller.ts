import { Permission } from '@dah/shared';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { CreateDocumentDto } from './dto/create-document.dto';
import { DocumentsService } from './documents.service';

class UpdateDocumentVisibilityDto {
  @ApiProperty()
  @IsBoolean()
  isPublic!: boolean;
}

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('documents')
export class DocumentsController {
  constructor(private documents: DocumentsService) {}

  @Get('public')
  listPublic(@CurrentUser() user: AuthUser) {
    return this.documents.listPublic(
      user.role === UserRole.super_admin ? null : user.tenantId,
    );
  }

  @RequirePermissions(Permission.MANAGE_FINANCE)
  @UseGuards(PermissionsGuard)
  @Get()
  listAll(@CurrentUser() user: AuthUser) {
    return this.documents.listAll(
      user.role === UserRole.super_admin ? null : user.tenantId,
    );
  }

  @RequirePermissions(Permission.MANAGE_FINANCE)
  @UseGuards(PermissionsGuard)
  @Post()
  create(@Body() dto: CreateDocumentDto, @CurrentUser() user: AuthUser) {
    return this.documents.create(dto, user.id, user.tenantId);
  }

  @RequirePermissions(Permission.MANAGE_FINANCE)
  @UseGuards(PermissionsGuard)
  @Patch(':id/visibility')
  setVisibility(
    @Param('id') id: string,
    @Body() dto: UpdateDocumentVisibilityDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.documents.setPublic(
      id,
      dto.isPublic,
      user.id,
      user.role === UserRole.super_admin ? null : user.tenantId,
    );
  }

  @RequirePermissions(Permission.FINANCE_ADMIN)
  @UseGuards(PermissionsGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.documents.remove(
      id,
      user.id,
      user.role === UserRole.super_admin ? null : user.tenantId,
    );
  }
}