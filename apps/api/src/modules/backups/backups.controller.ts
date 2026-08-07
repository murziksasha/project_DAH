import {
  Controller,
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

/** Read/list/download: board + auditor */
const READ_ROLES = [
  UserRole.super_admin,
  UserRole.chairman,
  UserRole.board,
  UserRole.accountant,
  UserRole.auditor,
] as const;

/** Create/upload: no auditor, no resident */
const WRITE_ROLES = [
  UserRole.super_admin,
  UserRole.chairman,
  UserRole.board,
  UserRole.accountant,
] as const;

@ApiTags('backups')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('backups')
export class BackupsController {
  constructor(private backups: BackupsService) {}

  @Roles(...READ_ROLES)
  @Get('status')
  status() {
    return this.backups.getStatus();
  }

  @Roles(...READ_ROLES)
  @Get()
  list() {
    return this.backups.list();
  }

  @Roles(...WRITE_ROLES)
  @Post()
  createManual(@CurrentUser() user: AuthUser) {
    return this.backups.createManualBackup({ source: 'api', userId: user.id });
  }

  @Roles(...WRITE_ROLES)
  @Post('weekly')
  ensureWeekly(@CurrentUser() user: AuthUser) {
    return this.backups.ensureWeeklyBackup({ source: 'api', userId: user.id });
  }

  @Roles(...READ_ROLES)
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

  @Roles(...WRITE_ROLES)
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
      // Default unlimited; optional BACKUP_UPLOAD_MAX_MB enforced in service
      limits: { fileSize: Number.MAX_SAFE_INTEGER },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    return this.backups.uploadFromPc(file, user.id);
  }
}
