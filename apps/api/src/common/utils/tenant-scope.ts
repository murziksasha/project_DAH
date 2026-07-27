import { ForbiddenException } from '@nestjs/common';
import { AuthUser } from '../decorators/current-user.decorator';

/** Whether multi-tenant isolation is enforced (default true when any non-default tenant exists — always on if env set). */
export function multiTenantEnabled(): boolean {
  return process.env.MULTI_TENANT_ENABLED !== 'false';
}

export function isPlatformAdmin(user: AuthUser): boolean {
  return user.role === 'super_admin';
}

/**
 * Effective tenant for data queries.
 * super_admin may pass overrideTenantId; others locked to JWT tenantId.
 */
export function resolveTenantId(
  user: AuthUser,
  overrideTenantId?: string | null,
): string | null {
  if (isPlatformAdmin(user)) {
    return overrideTenantId ?? user.tenantId ?? null;
  }
  if (!user.tenantId) {
    throw new ForbiddenException('Обліковий запис без tenant — зверніться до адміністратора');
  }
  if (overrideTenantId && overrideTenantId !== user.tenantId) {
    throw new ForbiddenException('Немає доступу до цього ОСББ (tenant)');
  }
  return user.tenantId;
}

/** Prisma where fragment for Building lists. */
export function buildingTenantWhere(tenantId: string | null | undefined) {
  if (!tenantId) return {};
  return { tenantId };
}

/** Funds / bank accounts / suppliers via Building.tenantId */
export function viaBuildingTenant(tenantId: string | null | undefined) {
  if (!tenantId) return {};
  return { building: { tenantId } };
}

/** Payments / accrual lines via Apartment → Building */
export function viaApartmentTenant(tenantId: string | null | undefined) {
  if (!tenantId) return {};
  return { apartment: { building: { tenantId } } };
}

/** Accruals via Fund → Building */
export function viaFundTenant(tenantId: string | null | undefined) {
  if (!tenantId) return {};
  return { fund: { building: { tenantId } } };
}
