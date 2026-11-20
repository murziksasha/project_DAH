import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../prisma/client';
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

  listAll(tenantId?: string | null) {
    // M8: documents without tenant are not shared across organizations
    const where: Prisma.DocumentWhereInput = tenantId ? { tenantId } : {};
    return this.enrichDocuments(
      this.prisma.document.findMany({ where, orderBy: { createdAt: 'desc' } }),
    );
  }

  listPublic(tenantId?: string | null) {
    const where: Prisma.DocumentWhereInput = {
      isPublic: true,
      ...(tenantId ? { tenantId } : {}),
    };
    return this.enrichDocuments(
      this.prisma.document.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async create(dto: CreateDocumentDto, userId: string, tenantId?: string | null) {
    const doc = await this.prisma.document.create({
      data: {
        title: dto.title,
        description: dto.description,
        fileKey: dto.fileKey,
        isPublic: dto.isPublic ?? true,
        tenantId: tenantId ?? null,
      },
    });
    await this.audit.log({
      userId,
      tenantId,
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

  async setPublic(
    id: string,
    isPublic: boolean,
    userId: string,
    tenantId?: string | null,
  ) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Документ не знайдено');
    if (tenantId && doc.tenantId !== tenantId) {
      throw new ForbiddenException('Немає доступу до документу іншої організації');
    }
    const updated = await this.prisma.document.update({
      where: { id },
      data: { isPublic },
    });
    await this.audit.log({
      userId,
      tenantId,
      action: 'document.updated',
      entityType: 'Document',
      entityId: id,
      payload: { isPublic },
    });
    return {
      ...updated,
      fileUrl: await this.storage.getDownloadUrl(updated.fileKey),
    };
  }

  async remove(id: string, userId: string, tenantId?: string | null) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Документ не знайдено');
    if (tenantId && doc.tenantId !== tenantId) {
      throw new ForbiddenException('Немає доступу до документу іншої організації');
    }
    await this.storage.delete(doc.fileKey).catch(() => undefined);
    await this.prisma.document.delete({ where: { id } });
    await this.audit.log({
      userId,
      tenantId,
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