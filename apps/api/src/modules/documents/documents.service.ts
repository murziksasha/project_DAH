import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../files/storage.service';
import { CreateDocumentDto } from './dto/create-document.dto';

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private audit: AuditService,
  ) {}

  listAll() {
    return this.enrichDocuments(
      this.prisma.document.findMany({ orderBy: { createdAt: 'desc' } }),
    );
  }

  listPublic() {
    return this.enrichDocuments(
      this.prisma.document.findMany({
        where: { isPublic: true },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async create(dto: CreateDocumentDto, userId: string) {
    const doc = await this.prisma.document.create({
      data: {
        title: dto.title,
        description: dto.description,
        fileKey: dto.fileKey,
        isPublic: dto.isPublic ?? true,
      },
    });
    await this.audit.log({
      userId,
      action: 'document.created',
      entityType: 'Document',
      entityId: doc.id,
      payload: { title: dto.title, isPublic: dto.isPublic ?? true },
    });
    return {
      ...doc,
      fileUrl: await this.storage.getDownloadUrl(doc.fileKey),
    };
  }

  async remove(id: string, userId: string) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Документ не знайдено');
    await this.storage.delete(doc.fileKey).catch(() => undefined);
    await this.prisma.document.delete({ where: { id } });
    await this.audit.log({
      userId,
      action: 'document.deleted',
      entityType: 'Document',
      entityId: id,
      payload: { title: doc.title },
    });
    return { id, deleted: true };
  }

  private async enrichDocuments(promise: Promise<{ fileKey: string }[]>) {
    const docs = await promise;
    return Promise.all(
      docs.map(async (doc) => ({
        ...doc,
        fileUrl: await this.storage.getDownloadUrl(doc.fileKey),
      })),
    );
  }
}