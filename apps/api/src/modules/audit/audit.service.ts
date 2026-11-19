import { Injectable } from '@nestjs/common';
import { Prisma } from '../../prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  userId?: string | null;
  tenantId?: string | null;
  isPlatform?: boolean;
  action: string;
  entityType: string;
  entityId: string;
  payload?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(entry: AuditEntry) {
    let tenantId = entry.tenantId ?? null;
    if (!tenantId && entry.userId && !entry.isPlatform) {
      const u = await this.prisma.user.findUnique({
        where: { id: entry.userId },
        select: { tenantId: true },
      });
      tenantId = u?.tenantId ?? null;
    }
    return this.prisma.auditLog.create({
      data: {
        userId: entry.userId ?? undefined,
        tenantId: tenantId ?? undefined,
        isPlatform: entry.isPlatform ?? false,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        payload: entry.payload,
      },
    });
  }

  async list(
    params: {
      limit?: number;
      cursor?: string;
      entityType?: string;
      action?: string;
      from?: string;
      to?: string;
      tenantId?: string | null;
    },
    user?: { role: string; tenantId?: string | null },
  ) {
    const limit = Math.min(params.limit ?? 50, 200);
    const createdAt: Prisma.DateTimeFilter = {};
    if (params.from) createdAt.gte = new Date(params.from);
    if (params.to) {
      const end = new Date(params.to);
      end.setHours(23, 59, 59, 999);
      createdAt.lte = end;
    }

    const tenantFilter: Prisma.AuditLogWhereInput = {};
    if (user && user.role !== 'super_admin') {
      tenantFilter.tenantId = user.tenantId ?? undefined;
      tenantFilter.isPlatform = false;
    } else if (params.tenantId) {
      tenantFilter.tenantId = params.tenantId;
    }

    const items = await this.prisma.auditLog.findMany({
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      where: {
        ...tenantFilter,
        ...(params.entityType ? { entityType: params.entityType } : {}),
        ...(params.action ? { action: { contains: params.action } } : {}),
        ...(Object.keys(createdAt).length ? { createdAt } : {}),
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