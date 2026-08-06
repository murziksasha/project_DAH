import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { ConfigService } from '@nestjs/config';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { verifyFileDownload } from '../../common/utils/file-download-token';
import { StorageService } from './storage.service';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const STAFF_ROLES = [
  UserRole.chairman,
  UserRole.accountant,
  UserRole.board,
  UserRole.dispatcher,
  UserRole.crew,
];

@ApiTags('files')
@Controller('files')
export class FilesController {
  constructor(
    private storage: StorageService,
    private config: ConfigService,
  ) {}

  /**
   * Stream object from MinIO. Auth via HMAC query (for <img>) — not public MinIO.
   */
  @Get('download')
  async download(
    @Query('key') key: string | undefined,
    @Query('exp') expRaw: string | undefined,
    @Query('sig') sig: string | undefined,
    @Res() res: Response,
  ) {
    if (!key || !expRaw || !sig) {
      throw new BadRequestException('key, exp, sig required');
    }
    const exp = Number(expRaw);
    const secret =
      this.config.get<string>('FILE_DOWNLOAD_SECRET') ||
      this.config.get<string>('JWT_SECRET') ||
      'dev-only-insecure-file-secret';

    if (!verifyFileDownload(key, exp, sig, secret)) {
      throw new ForbiddenException('Invalid or expired download link');
    }

    try {
      const obj = await this.storage.getObject(key);
      res.setHeader('Content-Type', obj.contentType || 'application/octet-stream');
      if (obj.contentLength != null) {
        res.setHeader('Content-Length', String(obj.contentLength));
      }
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      obj.body.pipe(res);
    } catch {
      throw new NotFoundException('File not found');
    }
  }

  @Post('upload')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...STAFF_ROLES, UserRole.resident)
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
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Query('folder') folder: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) throw new BadRequestException('Файл не передано');

    const isResident = user.role === UserRole.resident;
    // Residents may only attach photos to requests
    if (isResident) {
      if (folder && folder !== 'requests') {
        throw new BadRequestException('Мешканцям дозволено лише папку requests');
      }
      folder = 'requests';
    }

    const staffFolders = new Set(['expenses', 'documents', 'requests']);
    const targetFolder = staffFolders.has(folder ?? '') ? folder! : 'expenses';

    try {
      const result = await this.storage.upload(targetFolder, file);
      const url = await this.storage.getDownloadUrl(result.key);
      return { ...result, url };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Помилка завантаження';
      throw new BadRequestException(message);
    }
  }
}
