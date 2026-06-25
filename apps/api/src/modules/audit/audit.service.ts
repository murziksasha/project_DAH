import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  payload?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  log(entry: AuditEntry) {
    return this.prisma.auditLog.create({
      data: {
        userId: entry.userId ?? undefined,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        payload: entry.payload,
      },
    });
  }

  async list(params: {
    limit?: number;
    cursor?: string;
    entityType?: string;
    action?: string;
  }) {
    const limit = Math.min(params.limit ?? 50, 200);
    const items = await this.prisma.auditLog.findMany({
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      where: {
        ...(params.entityType ? { entityType: params.entityType } : {}),
        ...(params.action ? { action: { contains: params.action } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
      },
    });

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;

    return {
      items: page,
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    };
  }
}