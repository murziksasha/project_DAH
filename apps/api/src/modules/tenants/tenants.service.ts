import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class TenantsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  list() {
    return this.prisma.tenant.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { buildings: true, users: true } },
      },
    });
  }

  async get(id: string) {
    const t = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        buildings: { select: { id: true, name: true, address: true } },
        _count: { select: { users: true, buildings: true } },
      },
    });
    if (!t) throw new NotFoundException('Tenant не знайдено');
    return t;
  }

  async create(
    dto: { name: string; slug: string; chairmanEmail?: string; chairmanPassword?: string },
    actorId: string,
  ) {
    const slug = dto.slug
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48);
    if (!slug) throw new BadRequestException('Некоректний slug');

    const exists = await this.prisma.tenant.findUnique({ where: { slug } });
    if (exists) throw new BadRequestException('Slug уже зайнятий');

    const tenant = await this.prisma.$transaction(async (tx) => {
      const t = await tx.tenant.create({
        data: {
          name: dto.name.trim(),
          slug,
        },
      });
      await tx.building.create({
        data: {
          tenantId: t.id,
          name: dto.name.trim(),
          address: 'Адресу уточніть у налаштуваннях',
          isInitialized: false,
        },
      });
      if (dto.chairmanEmail && dto.chairmanPassword) {
        const emailTaken = await tx.user.findUnique({ where: { email: dto.chairmanEmail } });
        if (emailTaken) throw new BadRequestException('Email голови вже зайнятий');
        await tx.user.create({
          data: {
            email: dto.chairmanEmail,
            passwordHash: await bcrypt.hash(dto.chairmanPassword, 10),
            firstName: 'Голова',
            lastName: dto.name.trim().slice(0, 40),
            role: UserRole.chairman,
            status: UserStatus.active,
            tenantId: t.id,
          },
        });
      }
      return t;
    });

    await this.audit.log({
      userId: actorId,
      action: 'tenant.created',
      entityType: 'Tenant',
      entityId: tenant.id,
      payload: { slug: tenant.slug, name: tenant.name },
    });
    return this.get(tenant.id);
  }

  async update(
    id: string,
    dto: { name?: string; isActive?: boolean },
    actorId: string,
  ) {
    const t = await this.prisma.tenant.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Tenant не знайдено');
    const updated = await this.prisma.tenant.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'tenant.updated',
      entityType: 'Tenant',
      entityId: id,
      payload: { ...dto },
    });
    return updated;
  }
}
