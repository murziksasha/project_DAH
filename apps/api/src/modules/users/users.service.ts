import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { clearDeferredSetupRole, parseBuildingSettings } from '../building/building-settings';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto, UserSortField } from './dto/list-users.query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { RolesService } from '../roles/roles.service';
import {
  addUserApartmentLink,
  removeUserApartmentLink,
  syncUserApartments,
} from './user-apartments.util';

const ADMIN_CREATABLE_ROLES: UserRole[] = [
  UserRole.chairman,
  UserRole.accountant,
  UserRole.board,
  UserRole.dispatcher,
  UserRole.crew,
  UserRole.auditor,
  UserRole.resident,
];

const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  status: true,
  tenantId: true,
  apartmentId: true,
  createdAt: true,
  approvedAt: true,
  approvedById: true,
  approvedBy: {
    select: { id: true, email: true, firstName: true, lastName: true, role: true },
  },
  tenant: {
    select: { id: true, name: true, slug: true, orgType: true },
  },
  apartmentLinks: {
    select: {
      isPrimary: true,
      apartment: {
        select: {
          id: true,
          number: true,
          entrance: true,
          building: { select: { tenantId: true } },
        },
      },
    },
    orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }],
  },
} satisfies Prisma.UserSelect;

type UserSelected = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

function mapUserRow(
  user: UserSelected,
  opts?: {
    role?: UserRole;
    status?: UserStatus;
    tenant?: { id: string; name: string; slug: string; orgType?: string } | null;
    scopeTenantId?: string | null;
  },
) {
  const scopeTenantId = opts?.scopeTenantId ?? opts?.tenant?.id ?? user.tenantId;
  const apartments = user.apartmentLinks
    .filter((l) => !scopeTenantId || l.apartment.building.tenantId === scopeTenantId)
    .map((l) => ({
      id: l.apartment.id,
      number: l.apartment.number,
      entrance: l.apartment.entrance,
      isPrimary: l.isPrimary,
    }));
  const primary = apartments.find((a) => a.isPrimary) ?? apartments[0] ?? null;
  const tenant =
    opts?.tenant ??
    (user.tenant
      ? {
          id: user.tenant.id,
          name: user.tenant.name,
          slug: user.tenant.slug,
          orgType: user.tenant.orgType,
        }
      : null);

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: opts?.role ?? user.role,
    status: opts?.status ?? user.status,
    tenantId: tenant?.id ?? user.tenantId ?? null,
    tenant,
    apartmentId: primary?.id ?? user.apartmentId,
    createdAt: user.createdAt,
    approvedAt: user.approvedAt,
    approvedBy: user.approvedBy
      ? {
          id: user.approvedBy.id,
          email: user.approvedBy.email,
          firstName: user.approvedBy.firstName,
          lastName: user.approvedBy.lastName,
          role: user.approvedBy.role,
        }
      : null,
    apartments,
    apartment: primary
      ? { id: primary.id, number: primary.number, entrance: primary.entrance }
      : null,
  };
}

function membershipOrderBy(
  sortBy: UserSortField,
  sortDir: 'asc' | 'desc',
): Prisma.TenantMembershipOrderByWithRelationInput[] {
  const dir = sortDir;
  switch (sortBy) {
    case 'email':
      return [{ user: { email: dir } }];
    case 'role':
      return [{ role: dir }, { user: { lastName: 'asc' } }];
    case 'status':
      return [{ status: dir }, { user: { lastName: 'asc' } }];
    case 'createdAt':
      return [{ user: { createdAt: dir } }];
    case 'name':
    default:
      return [{ user: { lastName: dir } }, { user: { firstName: dir } }];
  }
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private roles: RolesService,
  ) {}

  /**
   * List users in one organization (membership-scoped).
   * Super-admin must pass X-Tenant-Id; chairman uses JWT tenant.
   */
  async listUsers(query: ListUsersQueryDto, tenantId?: string | null) {
    if (!tenantId) {
      throw new BadRequestException({
        message: 'Оберіть організацію (X-Tenant-Id)',
        code: 'tenant_required',
      });
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();
    const sortBy = query.sortBy ?? 'name';
    const sortDir = query.sortDir ?? 'asc';

    const where: Prisma.TenantMembershipWhereInput = {
      tenantId,
      role: query.role
        ? query.role
        : { not: UserRole.super_admin },
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            user: {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };

    // If role filter is super_admin, return empty (platform admins are not org members)
    if (query.role === UserRole.super_admin) {
      return { items: [], total: 0, page, limit, sortBy, sortDir };
    }

    const [total, memberships] = await Promise.all([
      this.prisma.tenantMembership.count({ where }),
      this.prisma.tenantMembership.findMany({
        where,
        include: {
          user: { select: USER_SELECT },
          tenant: { select: { id: true, name: true, slug: true, orgType: true } },
        },
        orderBy: membershipOrderBy(sortBy, sortDir),
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: memberships.map((m) =>
        mapUserRow(m.user, {
          role: m.role,
          status: m.status,
          tenant: m.tenant,
          scopeTenantId: tenantId,
        }),
      ),
      total,
      page,
      limit,
      sortBy,
      sortDir,
    };
  }

  async createUser(dto: CreateUserDto, actorId: string, tenantId?: string | null) {
    if (!tenantId) {
      throw new BadRequestException({
        message: 'Оберіть організацію (X-Tenant-Id) для створення користувача',
        code: 'tenant_required',
      });
    }

    if (!ADMIN_CREATABLE_ROLES.includes(dto.role)) {
      throw new BadRequestException('Недозволена роль для створення');
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new BadRequestException('Організацію не знайдено');

    await this.roles.assertRoleAssignable(tenantId, dto.role);

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (existing) {
      if (existing.role === UserRole.super_admin) {
        throw new BadRequestException('Неможливо додати системного адміністратора до організації');
      }

      const already = await this.prisma.tenantMembership.findUnique({
        where: {
          userId_tenantId_role: {
            userId: existing.id,
            tenantId,
            role: dto.role,
          },
        },
      });
      if (already) {
        throw new BadRequestException(
          'Користувач уже має цю роль у цій організації',
        );
      }

      const membership = await this.prisma.tenantMembership.create({
        data: {
          userId: existing.id,
          tenantId,
          role: dto.role,
          status: UserStatus.active,
        },
      });

      // Refresh identity profile fields if provided
      await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          firstName: dto.firstName || existing.firstName,
          lastName: dto.lastName || existing.lastName,
          phone: dto.phone !== undefined ? dto.phone || null : existing.phone,
          // If user has no active tenant, point at this one
          ...(existing.tenantId
            ? {}
            : { tenantId, role: dto.role, status: UserStatus.active }),
        },
      });

      await this.audit.log({
        userId: actorId,
        action: 'users.membership_add',
        entityType: 'User',
        entityId: existing.id,
        payload: {
          email: existing.email,
          tenantId,
          role: membership.role,
          existingUser: true,
        },
      });

      await this.clearDeferredIfNeeded(dto.role, tenantId);

      const user = await this.prisma.user.findUnique({
        where: { id: existing.id },
        select: USER_SELECT,
      });
      if (!user) throw new NotFoundException('Користувача не знайдено');
      return mapUserRow(user, {
        role: membership.role,
        status: membership.status,
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          orgType: tenant.orgType,
        },
        scopeTenantId: tenantId,
      });
    }

    if (!dto.password) {
      throw new BadRequestException('Пароль обовʼязковий для нового користувача');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          role: dto.role,
          status: UserStatus.active,
          tenantId,
        },
        select: USER_SELECT,
      });
      await tx.tenantMembership.create({
        data: {
          userId: created.id,
          tenantId,
          role: dto.role,
          status: UserStatus.active,
        },
      });
      return created;
    });

    await this.audit.log({
      userId: actorId,
      action: 'users.create',
      entityType: 'User',
      entityId: user.id,
      payload: { email: user.email, role: dto.role, tenantId },
    });

    await this.clearDeferredIfNeeded(dto.role, tenantId);

    return mapUserRow(user, {
      role: dto.role,
      status: UserStatus.active,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        orgType: tenant.orgType,
      },
      scopeTenantId: tenantId,
    });
  }

  private async clearDeferredIfNeeded(role: UserRole, tenantId: string) {
    if (role !== UserRole.accountant && role !== UserRole.auditor) return;
    const building = await this.prisma.building.findFirst({
      where: { tenantId },
      select: { id: true, settings: true },
    });
    if (!building) return;
    const nextSettings = clearDeferredSetupRole(
      building.settings,
      role === UserRole.accountant ? 'accountant' : 'auditor',
    );
    if (JSON.stringify(nextSettings) !== JSON.stringify(parseBuildingSettings(building.settings))) {
      await this.prisma.building.update({
        where: { id: building.id },
        data: { settings: nextSettings as object },
      });
    }
  }

  async updateUser(
    id: string,
    dto: UpdateUserDto,
    actorId: string,
    tenantId?: string | null,
  ) {
    if (!tenantId) {
      throw new BadRequestException({
        message: 'Оберіть організацію (X-Tenant-Id)',
        code: 'tenant_required',
      });
    }

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Користувача не знайдено');

    if (user.role === UserRole.super_admin && !user.tenantId) {
      throw new BadRequestException('Неможливо змінити супер-адміністратора');
    }

    const membershipKeyRole = dto.membershipRole ?? dto.role ?? user.role;
    let membership = await this.prisma.tenantMembership.findUnique({
      where: {
        userId_tenantId_role: {
          userId: id,
          tenantId,
          role: membershipKeyRole,
        },
      },
    });
    if (!membership) {
      membership = await this.prisma.tenantMembership.findFirst({
        where: { userId: id, tenantId },
        orderBy: { createdAt: 'asc' },
      });
    }
    if (!membership) {
      throw new NotFoundException('Користувача не знайдено в цій організації');
    }

    if (dto.email && dto.email !== user.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existing) throw new BadRequestException('Email вже зареєстрований');
    }

    const nextRole = dto.role ?? membership.role;
    if (dto.role && !ADMIN_CREATABLE_ROLES.includes(dto.role)) {
      throw new BadRequestException('Недозволена роль');
    }

    if (dto.role && dto.role !== membership.role) {
      await this.roles.assertRoleAssignable(tenantId, dto.role);
      const clash = await this.prisma.tenantMembership.findUnique({
        where: {
          userId_tenantId_role: { userId: id, tenantId, role: dto.role },
        },
      });
      if (clash) {
        throw new BadRequestException('Користувач уже має цю роль у цій організації');
      }
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.phone !== undefined) data.phone = dto.phone || null;
    if (dto.email !== undefined) data.email = dto.email;

    // Sync denormalized active context when editing the active membership
    const isActiveContext = user.tenantId === tenantId && user.role === membership.role;
    if (isActiveContext) {
      if (dto.status !== undefined) data.status = dto.status;
      if (dto.role !== undefined) data.role = dto.role;
    }

    if (
      dto.status === UserStatus.active &&
      membership.status !== UserStatus.active &&
      !user.approvedAt
    ) {
      data.approvedAt = new Date();
      data.approvedBy = { connect: { id: actorId } };
    }

    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
      data.refreshToken = null;
    } else if (dto.email !== undefined && dto.email !== user.email) {
      data.refreshToken = null;
    }

    const shouldRevokeSessions =
      Boolean(dto.password) ||
      (dto.email !== undefined && dto.email !== user.email) ||
      (dto.status === UserStatus.blocked && isActiveContext);

    if (dto.role !== undefined && dto.role !== UserRole.resident && membership.role === UserRole.resident) {
      // Only clear apartments that belong to this tenant
      const links = await this.prisma.userApartment.findMany({
        where: { userId: id, apartment: { building: { tenantId } } },
        select: { apartmentId: true },
      });
      for (const link of links) {
        await removeUserApartmentLink(this.prisma, id, link.apartmentId);
      }
    }

    if (nextRole !== UserRole.resident && (dto.apartmentIds !== undefined || dto.primaryApartmentId !== undefined)) {
      throw new BadRequestException('Квартири можна прив\'язувати лише до мешканців');
    }

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) {
        await tx.user.update({ where: { id }, data });
      }

      if (dto.role !== undefined || dto.status !== undefined) {
        await tx.tenantMembership.update({
          where: {
            userId_tenantId_role: {
              userId: id,
              tenantId,
              role: membership.role,
            },
          },
          data: {
            ...(dto.role !== undefined ? { role: dto.role } : {}),
            ...(dto.status !== undefined ? { status: dto.status } : {}),
          },
        });
      }

      if (shouldRevokeSessions) {
        await tx.authSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      if (dto.apartmentIds !== undefined && nextRole === UserRole.resident) {
        await this.syncApartmentsForTenant(tx, id, tenantId, dto.apartmentIds, dto.primaryApartmentId);
      } else if (dto.primaryApartmentId !== undefined && nextRole === UserRole.resident) {
        const currentIds = (
          await tx.userApartment.findMany({
            where: { userId: id, apartment: { building: { tenantId } } },
            select: { apartmentId: true },
          })
        ).map((l) => l.apartmentId);
        await this.syncApartmentsForTenant(tx, id, tenantId, currentIds, dto.primaryApartmentId);
      }
    });

    const updated = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });
    if (!updated) throw new NotFoundException('Користувача не знайдено');

    const mem = await this.prisma.tenantMembership.findUnique({
      where: {
        userId_tenantId_role: {
          userId: id,
          tenantId,
          role: nextRole,
        },
      },
      include: { tenant: { select: { id: true, name: true, slug: true, orgType: true } } },
    });

    await this.audit.log({
      userId: actorId,
      action: 'users.update',
      entityType: 'User',
      entityId: id,
      payload: {
        tenantId,
        changes: {
          ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
          ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.email !== undefined ? { email: dto.email } : {}),
          ...(dto.role !== undefined ? { role: dto.role } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.apartmentIds !== undefined ? { apartmentIds: dto.apartmentIds } : {}),
          ...(dto.primaryApartmentId !== undefined ? { primaryApartmentId: dto.primaryApartmentId } : {}),
          ...(dto.password ? { passwordChanged: true } : {}),
        },
        previous: {
          role: membership.role,
          status: membership.status,
          email: user.email,
        },
      },
    });

    return mapUserRow(updated, {
      role: mem?.role ?? nextRole,
      status: mem?.status ?? membership.status,
      tenant: mem?.tenant ?? null,
      scopeTenantId: tenantId,
    });
  }

  /** Replace apartment links for one tenant; keep links from other tenants. */
  private async syncApartmentsForTenant(
    tx: Prisma.TransactionClient,
    userId: string,
    tenantId: string,
    apartmentIds: string[],
    primaryApartmentId?: string | null,
  ) {
    const apts = await tx.apartment.findMany({
      where: { id: { in: apartmentIds } },
      select: { id: true, building: { select: { tenantId: true } } },
    });
    for (const a of apts) {
      if (a.building.tenantId !== tenantId) {
        throw new BadRequestException('Квартира належить іншій організації');
      }
    }
    const existingOther = await tx.userApartment.findMany({
      where: {
        userId,
        NOT: { apartment: { building: { tenantId } } },
      },
      select: { apartmentId: true, isPrimary: true },
    });
    const otherIds = existingOther.map((l) => l.apartmentId);
    const primaryInOther = existingOther.find((l) => l.isPrimary)?.apartmentId;
    const primary =
      primaryApartmentId && apartmentIds.includes(primaryApartmentId)
        ? primaryApartmentId
        : apartmentIds[0] ?? primaryInOther ?? null;

    await syncUserApartments(tx, userId, [...otherIds, ...apartmentIds], primary ?? undefined);
  }

  async blockUser(id: string, actorId: string, tenantId?: string | null) {
    if (!tenantId) {
      throw new BadRequestException({
        message: 'Оберіть організацію (X-Tenant-Id)',
        code: 'tenant_required',
      });
    }

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Користувача не знайдено');

    if (user.role === UserRole.super_admin && !user.tenantId) {
      throw new BadRequestException('Неможливо заблокувати супер-адміністратора');
    }

    const inOrg = await this.prisma.tenantMembership.count({
      where: { userId: id, tenantId },
    });
    if (!inOrg) {
      throw new NotFoundException('Користувача не знайдено в цій організації');
    }

    // Block all roles for this user in the organization
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.tenantMembership.updateMany({
        where: { userId: id, tenantId },
        data: { status: UserStatus.blocked },
      });

      if (user.tenantId === tenantId) {
        const row = await tx.user.update({
          where: { id },
          data: { status: UserStatus.blocked, refreshToken: null },
          select: { id: true, email: true, status: true },
        });
        await tx.authSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return row;
      }

      return { id: user.id, email: user.email, status: UserStatus.blocked };
    });

    await this.audit.log({
      userId: actorId,
      action: 'users.block',
      entityType: 'User',
      entityId: id,
      payload: { email: user.email, tenantId, allRolesInTenant: true },
    });

    return updated;
  }

  async linkApartment(userId: string, apartmentId: string, actorId: string, setPrimary = false) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Користувача не знайдено');

    const apartment = await this.prisma.apartment.findUnique({
      where: { id: apartmentId },
      select: { building: { select: { tenantId: true } } },
    });
    if (!apartment) throw new NotFoundException('Квартиру не знайдено');

    const residentMem = await this.prisma.tenantMembership.findUnique({
      where: {
        userId_tenantId_role: {
          userId,
          tenantId: apartment.building.tenantId,
          role: UserRole.resident,
        },
      },
    });
    if (!residentMem) {
      throw new BadRequestException(
        'Квартири можна прив\'язувати лише якщо є роль мешканця в цій організації',
      );
    }
    const effectiveRole = UserRole.resident;

    await addUserApartmentLink(this.prisma, userId, apartmentId, setPrimary);

    await this.audit.log({
      userId: actorId,
      action: 'users.apartment_link',
      entityType: 'User',
      entityId: userId,
      payload: { apartmentId, setPrimary },
    });

    const updated = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_SELECT,
    });
    return updated
      ? mapUserRow(updated, {
          role: effectiveRole,
          status: residentMem.status,
          scopeTenantId: apartment.building.tenantId,
        })
      : null;
  }

  async unlinkApartment(userId: string, apartmentId: string, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Користувача не знайдено');

    const apartment = await this.prisma.apartment.findUnique({
      where: { id: apartmentId },
      select: { building: { select: { tenantId: true } } },
    });

    await removeUserApartmentLink(this.prisma, userId, apartmentId);

    await this.audit.log({
      userId: actorId,
      action: 'users.apartment_unlink',
      entityType: 'User',
      entityId: userId,
      payload: { apartmentId },
    });

    const updated = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_SELECT,
    });
    return updated
      ? mapUserRow(updated, {
          scopeTenantId: apartment?.building.tenantId ?? user.tenantId,
        })
      : null;
  }
}
