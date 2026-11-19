import { Permission } from '@dah/shared';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { createReadStream } from 'fs';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BackupsService } from './backups.service';
import { PrismaService } from '../../prisma/prisma.service';

/** Read/list/download: board + auditor */

/** Create/upload: no auditor, no resident */
const WRITE_ROLES = [
  UserRole.super_admin,
  UserRole.chairman,
  UserRole.board,
  UserRole.accountant,
] as const;

@ApiTags('backups')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard, PermissionsGuard)
@Controller('backups')
export class BackupsController {
  constructor(
    private backups: BackupsService,
    private prisma: PrismaService,
  ) {}

  /**
   * Backups are whole-database dumps (all organizations). Organization roles may see /
   * trigger them only on a single-organization install; on shared installs — platform
   * admin only (H4).
   */
  private async assertInstallLevel(user: AuthUser) {
    if (user.role === UserRole.super_admin) return;
    const tenants = await this.prisma.tenant.count();
    if (tenants > 1) {
      throw new ForbiddenException(
        'Резервні копії спільної інсталяції доступні лише адміністратору платформи',
      );
    }
  }

  @RequirePermissions(Permission.READ_FINANCE)
  @Get('status')
  async status(@CurrentUser() user: AuthUser) {
    await this.assertInstallLevel(user);
    return this.backups.getStatus();
  }

  @RequirePermissions(Permission.READ_FINANCE)
  @Get()
  async list(@CurrentUser() user: AuthUser) {
    await this.assertInstallLevel(user);
    return this.backups.list();
  }

  @Roles(...WRITE_ROLES)
  @Post()
  async createManual(@CurrentUser() user: AuthUser) {
    await this.assertInstallLevel(user);
    return this.backups.createManualBackup({ source: 'api', userId: user.id });
  }

  @Roles(...WRITE_ROLES)
  @Post('weekly')
  async ensureWeekly(@CurrentUser() user: AuthUser) {
    await this.assertInstallLevel(user);
    return this.backups.ensureWeeklyBackup({ source: 'api', userId: user.id });
  }

  @RequirePermissions(Permission.MANAGE_SETUP)
  @Get(':kind/:id/download')
  async download(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    await this.backups.assertCanDownload(user.id);
    const { dumpPath, filename } = await this.backups.openDownload(kind, id, user.id);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    createReadStream(dumpPath).pipe(res);
  }

  @RequirePermissions(Permission.MANAGE_SETUP)
  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      // 512 MB ceiling aligned with edge nginx client_max_body_size (optional BACKUP_UPLOAD_MAX_MB further limits in service)
      limits: { fileSize: 512 * 1024 * 1024 },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    return this.backups.uploadFromPc(file, user.id);
  }
}
