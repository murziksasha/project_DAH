import { AsyncLocalStorage } from 'async_hooks';

/**
 * Phase 2.1: request-scoped tenant context for automatic data isolation.
 * - `tenantId` string → queries on tenant-owned models are filtered to it;
 * - `null` / no store → unrestricted (platform super_admin without X-Tenant-Id,
 *   worker jobs, public endpoints) — explicit checks in services still apply.
 */
export interface TenantScopeStore {
  tenantId: string | null;
  /** Explicit opt-out for code that must see several organizations. */
  bypass?: boolean;
}

const storage = new AsyncLocalStorage<TenantScopeStore>();

export function currentTenantScope(): string | null {
  const s = storage.getStore();
  if (!s || s.bypass) return null;
  return s.tenantId;
}

export function runWithTenantScope<T>(tenantId: string | null, fn: () => T): T {
  return storage.run({ tenantId }, fn);
}

/** Opt-out of automatic tenant filtering (super_admin/global maintenance code paths). */
export function runUnscoped<T>(fn: () => T): T {
  return storage.run({ tenantId: null, bypass: true }, fn);
}
