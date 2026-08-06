import {
  BadRequestException,
  Controller,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { memoryStorage } from 'multer';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
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
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(...STAFF_ROLES, UserRole.resident)
@Controller('files')
export class FilesController {
  constructor(private storage: StorageService) {}

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
