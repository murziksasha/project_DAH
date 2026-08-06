import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationType, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

function parseOrgType(value?: string): OrganizationType {
  if (value === 'management_company') return OrganizationType.management_company;
  return OrganizationType.osbb;
}

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
    if (!t) throw new NotFoundException('Організацію не знайдено');
    return t;
  }

  async create(
    dto: {
      name: string;
      slug: string;
      orgType?: string;
      chairmanEmail?: string;
      chairmanPassword?: string;
    },
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

    const orgType = parseOrgType(dto.orgType);
    const isUk = orgType === OrganizationType.management_company;

    const tenant = await this.prisma.$transaction(async (tx) => {
      const t = await tx.tenant.create({
        data: {
          name: dto.name.trim(),
          slug,
          orgType,
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
        if (emailTaken) {
          throw new BadRequestException(
            isUk ? 'Email керівника вже зайнятий' : 'Email голови вже зайнятий',
          );
        }
        await tx.user.create({
          data: {
            email: dto.chairmanEmail,
            passwordHash: await bcrypt.hash(dto.chairmanPassword, 10),
            firstName: isUk ? 'Керівник' : 'Голова',
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
      payload: { slug: tenant.slug, name: tenant.name, orgType: tenant.orgType },
    });
    return this.get(tenant.id);
  }

  async update(
    id: string,
    dto: { name?: string; isActive?: boolean; orgType?: string },
    actorId: string,
  ) {
    const t = await this.prisma.tenant.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Організацію не знайдено');
    const updated = await this.prisma.tenant.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.orgType !== undefined ? { orgType: parseOrgType(dto.orgType) } : {}),
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
