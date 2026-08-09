import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import {
  isOrgRoleCode,
  ORG_ROLE_CODES,
  ORG_ROLE_SORT,
  PROTECTED_ORG_ROLES,
} from './org-roles';

const DEFAULT_LABELS: Record<string, { uk: string; ru: string }> = {
  chairman: { uk: 'Голова правління', ru: 'Председатель правления' },
  accountant: { uk: 'Бухгалтер', ru: 'Бухгалтер' },
  board: { uk: 'Член правління', ru: 'Член правления' },
  dispatcher: { uk: 'Диспетчер', ru: 'Диспетчер' },
  crew: { uk: 'Бригада', ru: 'Бригада' },
  auditor: { uk: 'Ревізійна комісія', ru: 'Ревизионная комиссия' },
  resident: { uk: 'Мешканець', ru: 'Жилец' },
};

@Injectable()
export class RolesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /**
   * Seed catalog without undoing intentional deletes of optional roles.
   * - Empty catalog (legacy / pre-catalog tenants) → full ORG_ROLE_CODES.
   * - Otherwise → only PROTECTED roles (chairman, resident) must always exist.
   * Optional roles (accountant, board, …) stay absent until POST /roles.
   */
  async ensureCatalog(tenantId: string) {
    const existing = await this.prisma.tenantRole.findMany({
      where: { tenantId },
      select: { code: true },
    });
    const have = new Set(existing.map((r) => r.code));
    const toSeed =
      existing.length === 0
        ? ORG_ROLE_CODES
        : PROTECTED_ORG_ROLES.filter((c) => !have.has(c));
    if (!toSeed.length) return;
    await this.prisma.tenantRole.createMany({
      data: toSeed.map((code) => ({
        tenantId,
        code,
        isActive: true,
        sortOrder: ORG_ROLE_SORT[code] ?? 100,
      })),
      skipDuplicates: true,
    });
  }

  async listRoles(tenantId: string | null | undefined, activeOnly = false) {
    if (!tenantId) {
      throw new BadRequestException({
        message: 'Оберіть організацію (X-Tenant-Id)',
        code: 'tenant_required',
      });
    }
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Організацію не знайдено');

    await this.ensureCatalog(tenantId);

    const rows = await this.prisma.tenantRole.findMany({
      where: { tenantId, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });

    const counts = await this.prisma.tenantMembership.groupBy({
      by: ['role'],
      where: { tenantId },
      _count: { _all: true },
    });
    const countMap = new Map(counts.map((c) => [c.role, c._count._all]));

    return {
      items: rows.map((r) => {
        const memberCount = countMap.get(r.code) ?? 0;
        const defaults = DEFAULT_LABELS[r.code] ?? { uk: r.code, ru: r.code };
        return {
          code: r.code,
          isActive: r.isActive,
          labelUk: r.labelUk,
          labelRu: r.labelRu,
          labelDefault: defaults,
          sortOrder: r.sortOrder,
          memberCount,
          canDelete:
            memberCount === 0 && !PROTECTED_ORG_ROLES.includes(r.code),
          isProtected: PROTECTED_ORG_ROLES.includes(r.code),
        };
      }),
    };
  }

  async createRole(tenantId: string | null | undefined, dto: CreateRoleDto, actorId: string) {
    if (!tenantId) {
      throw new BadRequestException({
        message: 'Оберіть організацію (X-Tenant-Id)',
        code: 'tenant_required',
      });
    }
    if (!isOrgRoleCode(dto.code)) {
      throw new BadRequestException('Недозволений код ролі');
    }

    // Do not full-seed optional roles here — create only the requested code.
    await this.ensureCatalog(tenantId);

    const existing = await this.prisma.tenantRole.findUnique({
      where: { tenantId_code: { tenantId, code: dto.code } },
    });

    if (existing) {
      // Re-activate / update labels if already in catalog
      const row = await this.prisma.tenantRole.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          ...(dto.labelUk !== undefined ? { labelUk: dto.labelUk || null } : {}),
          ...(dto.labelRu !== undefined ? { labelRu: dto.labelRu || null } : {}),
        },
      });
      await this.audit.log({
        userId: actorId,
        action: 'roles.reactivate',
        entityType: 'TenantRole',
        entityId: row.id,
        payload: { tenantId, code: dto.code },
      });
      return this.listRoles(tenantId);
    }

    await this.prisma.tenantRole.create({
      data: {
        tenantId,
        code: dto.code,
        isActive: true,
        labelUk: dto.labelUk || null,
        labelRu: dto.labelRu || null,
        sortOrder: ORG_ROLE_SORT[dto.code] ?? 100,
      },
    });

    await this.audit.log({
      userId: actorId,
      action: 'roles.create',
      entityType: 'TenantRole',
      entityId: tenantId,
      payload: { tenantId, code: dto.code },
    });

    return this.listRoles(tenantId);
  }

  async updateRole(
    tenantId: string | null | undefined,
    code: string,
    dto: UpdateRoleDto,
    actorId: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException({
        message: 'Оберіть організацію (X-Tenant-Id)',
        code: 'tenant_required',
      });
    }
    if (!isOrgRoleCode(code)) {
      throw new BadRequestException('Недозволений код ролі');
    }

    await this.ensureCatalog(tenantId);

    const existing = await this.prisma.tenantRole.findUnique({
      where: { tenantId_code: { tenantId, code: code as UserRole } },
    });
    if (!existing) throw new NotFoundException('Роль не знайдено в каталозі організації');

    const row = await this.prisma.tenantRole.update({
      where: { id: existing.id },
      data: {
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.labelUk !== undefined ? { labelUk: dto.labelUk } : {}),
        ...(dto.labelRu !== undefined ? { labelRu: dto.labelRu } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });

    await this.audit.log({
      userId: actorId,
      action: 'roles.update',
      entityType: 'TenantRole',
      entityId: row.id,
      payload: {
        tenantId,
        code,
        isActive: row.isActive,
        labelUk: row.labelUk,
        labelRu: row.labelRu,
      },
    });

    return this.listRoles(tenantId);
  }

  async deleteRole(tenantId: string | null | undefined, code: string, actorId: string) {
    if (!tenantId) {
      throw new BadRequestException({
        message: 'Оберіть організацію (X-Tenant-Id)',
        code: 'tenant_required',
      });
    }
    if (!isOrgRoleCode(code)) {
      throw new BadRequestException('Недозволений код ролі');
    }
    if (PROTECTED_ORG_ROLES.includes(code as UserRole)) {
      throw new BadRequestException(
        'Цю роль не можна видалити з каталогу (обовʼязкова). Можна лише деактивувати.',
      );
    }

    const existing = await this.prisma.tenantRole.findUnique({
      where: { tenantId_code: { tenantId, code: code as UserRole } },
    });
    if (!existing) throw new NotFoundException('Роль не знайдено в каталозі організації');

    const memberCount = await this.prisma.tenantMembership.count({
      where: { tenantId, role: code as UserRole },
    });
    if (memberCount > 0) {
      throw new BadRequestException(
        `Неможливо видалити: ${memberCount} користувач(ів) мають цю роль. Деактивуйте роль — вона зникне з меню для нових, існуючі збережуться.`,
      );
    }

    await this.prisma.tenantRole.delete({ where: { id: existing.id } });

    await this.audit.log({
      userId: actorId,
      action: 'roles.delete',
      entityType: 'TenantRole',
      entityId: existing.id,
      payload: { tenantId, code },
    });

    return this.listRoles(tenantId);
  }

  /**
   * Whether a role may be assigned to a new/changed membership.
   * Missing catalog row (optional role deleted) → reject until POST /roles.
   * isActive=false → reject.
   * Protected roles are re-seeded by ensureCatalog if missing.
   */
  async assertRoleAssignable(tenantId: string, role: UserRole) {
    if (role === UserRole.super_admin) {
      throw new BadRequestException('Неможливо призначити роль super_admin');
    }
    if (!isOrgRoleCode(role)) {
      throw new BadRequestException('Недозволена роль');
    }
    await this.ensureCatalog(tenantId);
    const row = await this.prisma.tenantRole.findUnique({
      where: { tenantId_code: { tenantId, code: role } },
    });
    if (!row) {
      throw new BadRequestException(
        'Цієї ролі немає в каталозі організації — додайте її в «Ролі організації»',
      );
    }
    if (!row.isActive) {
      throw new BadRequestException(
        'Цю роль деактивовано для організації — її не можна призначати новим користувачам',
      );
    }
  }
}
