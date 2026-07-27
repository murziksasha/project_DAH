const KEY = 'dah_building_id';
const TENANT_KEY = 'dah_tenant_id';

export function getSelectedBuildingId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(KEY);
}

export function setSelectedBuildingId(id: string | null): void {
  if (typeof window === 'undefined') return;
  if (!id) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, id);
  window.dispatchEvent(new Event('dah-building-change'));
}

/** Super-admin selected ОСББ (sent as X-Tenant-Id). */
export function getSelectedTenantId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TENANT_KEY);
}

export function setSelectedTenantId(id: string | null): void {
  if (typeof window === 'undefined') return;
  if (!id) localStorage.removeItem(TENANT_KEY);
  else localStorage.setItem(TENANT_KEY, id);
  window.dispatchEvent(new Event('dah-tenant-change'));
}

export function withBuildingQuery(path: string): string {
  const id = getSelectedBuildingId();
  if (!id) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}buildingId=${encodeURIComponent(id)}`;
}

/** Merge selected building into create/update POST bodies. */
export function withBuildingBody<T extends Record<string, unknown>>(data: T): T & {
  buildingId?: string;
} {
  const id = getSelectedBuildingId();
  if (!id || data.buildingId) return data;
  return { ...data, buildingId: id };
}
