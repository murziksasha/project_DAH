import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '../../prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../decorators/current-user.decorator';
import { resolveTenantId } from '../utils/tenant-scope';

/** Minimal Prisma surface used by the helper (keeps unit tests simple). */
export type TenantAccessPrisma = Pick<
  PrismaService,
  'building' | 'apartment' | 'fund' | 'supplier' | 'bankAccount'
>;

export interface BuildingRefs {
  fundIds?: Array<string | null | undefined>;
  supplierIds?: Array<string | null | undefined>;
  bankAccountIds?: Array<string | null | undefined>;
  apartmentIds?: Array<string | null | undefined>;
}

export function isPlatformAdminUser(user: Pick<AuthUser, 'role'>): boolean {
  return user.role === UserRole.super_admin;
}

/**
 * Effective tenant for a request.
 * - Regular users: always their JWT tenant (override must match).
 * - super_admin: override (X-Tenant-Id) or `null` = platform-wide.
 */
export function effectiveTenantId(
  user: AuthUser,
  overrideTenantId?: string | null,
): string | null {
  return resolveTenantId(user, overrideTenantId || null);
}

/** Throws 404 when `tenantId` (of a loaded row) is outside the caller's scope. */
export function assertTenantMatch(
  user: AuthUser,
  rowTenantId: string | null | undefined,
  overrideTenantId?: string | null,
  notFoundMessage = 'Не знайдено',
): void {
  const tenantId = effectiveTenantId(user, overrideTenantId);
  if (tenantId === null) return; // platform admin, unrestricted
  if (!rowTenantId || rowTenantId !== tenantId) {
    throw new NotFoundException(notFoundMessage);
  }
}

function residentApartmentIds(user: AuthUser): string[] {
  if (user.apartmentIds?.length) return user.apartmentIds;
  return user.apartmentId ? [user.apartmentId] : [];
}

/**
 * Central tenant/building scope checks (AGENTS.md: keep tenant scope explicit).
 * All failures are 404 so ids of other organizations are not disclosed.
 */
@Injectable()
export class TenantAccessService {
  constructor(private readonly prisma: PrismaService) {}

  protected get db(): TenantAccessPrisma {
    return this.prisma;
  }

  effectiveTenantId(user: AuthUser, overrideTenantId?: string | null) {
    return effectiveTenantId(user, overrideTenantId);
  }

  /** Building must belong to the caller's organization. */
  async assertBuilding(
    user: AuthUser,
    buildingId: string | null | undefined,
    overrideTenantId?: string | null,
  ): Promise<{ id: string; tenantId: string }> {
    if (!buildingId) throw new NotFoundException('Будинок не знайдено');
    const b = await this.db.building.findUnique({
      where: { id: buildingId },
      select: { id: true, tenantId: true },
    });
    if (!b) throw new NotFoundException('Будинок не знайдено');
    assertTenantMatch(user, b.tenantId, overrideTenantId, 'Будинок не знайдено');
    return b;
  }

  /**
   * Explicit buildingId → verified; otherwise the first building of the caller's tenant.
   * super_admin without tenant context keeps legacy "first building" behaviour.
   */
  async resolveBuilding(
    user: AuthUser,
    buildingId?: string | null,
    overrideTenantId?: string | null,
  ): Promise<string> {
    if (buildingId) return (await this.assertBuilding(user, buildingId, overrideTenantId)).id;
    const tenantId = effectiveTenantId(user, overrideTenantId);
    const first = await this.db.building.findFirst({
      where: tenantId ? { tenantId } : undefined,
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!first) throw new NotFoundException('Будинок не налаштовано');
    return first.id;
  }

  /**
   * Building ids visible to the caller, or `null` when unrestricted (platform admin
   * without X-Tenant-Id). Use for list queries that do not receive a buildingId.
   */
  async scopeBuildingIds(
    user: AuthUser,
    buildingId?: string | null,
    overrideTenantId?: string | null,
  ): Promise<string[] | null> {
    if (buildingId) return [(await this.assertBuilding(user, buildingId, overrideTenantId)).id];
    const tenantId = effectiveTenantId(user, overrideTenantId);
    if (tenantId === null) return null;
    const rows = await this.db.building.findMany({
      where: { tenantId },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /**
   * Apartment must belong to the caller's organization; residents additionally
   * only to their own linked apartments.
   */
  async assertApartment(
    user: AuthUser,
    apartmentId: string | null | undefined,
    overrideTenantId?: string | null,
  ): Promise<{ id: string; buildingId: string; tenantId: string }> {
    if (!apartmentId) throw new NotFoundException('Квартиру не знайдено');
    const a = await this.db.apartment.findUnique({
      where: { id: apartmentId },
      select: { id: true, buildingId: true, building: { select: { tenantId: true } } },
    });
    if (!a) throw new NotFoundException('Квартиру не знайдено');
    if (user.role === UserRole.resident && !residentApartmentIds(user).includes(a.id)) {
      throw new NotFoundException('Квартиру не знайдено');
    }
    assertTenantMatch(user, a.building.tenantId, overrideTenantId, 'Квартиру не знайдено');
    return { id: a.id, buildingId: a.buildingId, tenantId: a.building.tenantId };
  }

  /** Optional buildingId attached to an entity (null = platform/global row). */
  async assertOptionalBuilding(
    user: AuthUser,
    buildingId: string | null | undefined,
    overrideTenantId?: string | null,
  ): Promise<void> {
    if (!buildingId) {
      if (effectiveTenantId(user, overrideTenantId) !== null) {
        throw new NotFoundException('Не знайдено');
      }
      return;
    }
    await this.assertBuilding(user, buildingId, overrideTenantId);
  }

  /**
   * Every referenced row (fund / supplier / bank account / apartment) must belong to
   * `buildingId`. Prevents mixing ids of another building or organization into a
   * request for a building the caller is allowed to use.
   */
  async assertRefsInBuilding(buildingId: string, refs: BuildingRefs): Promise<void> {
    const uniq = (xs?: Array<string | null | undefined>) =>
      [...new Set((xs ?? []).filter((x): x is string => !!x))];
    const checks: Array<[string[], (ids: string[]) => Promise<Array<{ buildingId: string }>>, string]> = [
      [
        uniq(refs.fundIds),
        (ids) => this.db.fund.findMany({ where: { id: { in: ids } }, select: { buildingId: true } }),
        'Фонд не знайдено',
      ],
      [
        uniq(refs.supplierIds),
        (ids) =>
          this.db.supplier.findMany({ where: { id: { in: ids } }, select: { buildingId: true } }),
        'Постачальника не знайдено',
      ],
      [
        uniq(refs.bankAccountIds),
        (ids) =>
          this.db.bankAccount.findMany({ where: { id: { in: ids } }, select: { buildingId: true } }),
        'Рахунок не знайдено',
      ],
      [
        uniq(refs.apartmentIds),
        (ids) =>
          this.db.apartment.findMany({ where: { id: { in: ids } }, select: { buildingId: true } }),
        'Квартиру не знайдено',
      ],
    ];
    for (const [ids, load, msg] of checks) {
      if (!ids.length) continue;
      const rows = await load(ids);
      if (rows.length !== ids.length || rows.some((r) => r.buildingId !== buildingId)) {
        throw new NotFoundException(msg);
      }
    }
  }

  /** Fund must belong to the caller's organization; returns its building. */
  async assertFund(
    user: AuthUser,
    fundId: string | null | undefined,
    overrideTenantId?: string | null,
  ): Promise<{ id: string; buildingId: string }> {
    if (!fundId) throw new NotFoundException('Фонд не знайдено');
    const f = await this.db.fund.findUnique({
      where: { id: fundId },
      select: { id: true, buildingId: true, building: { select: { tenantId: true } } },
    });
    if (!f) throw new NotFoundException('Фонд не знайдено');
    assertTenantMatch(user, f.building.tenantId, overrideTenantId, 'Фонд не знайдено');
    return { id: f.id, buildingId: f.buildingId };
  }
}
