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
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StorageService } from './storage.service';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

@ApiTags('files')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.chairman, UserRole.accountant, UserRole.board)
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
    @Query('folder') folder?: string,
  ) {
    if (!file) throw new BadRequestException('Файл не передано');

    const allowedFolders = new Set(['expenses', 'documents']);
    const targetFolder = allowedFolders.has(folder ?? '') ? folder! : 'expenses';

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