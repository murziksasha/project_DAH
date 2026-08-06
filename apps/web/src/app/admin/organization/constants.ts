import type { I18nKey, TParams } from '@/lib/i18n';

type TFn = (key: I18nKey, params?: TParams) => string;

const ROLE_KEYS: Record<string, I18nKey> = {
  super_admin: 'roleSuperAdmin',
  chairman: 'roleChairman',
  accountant: 'roleAccountant',
  board: 'roleBoard',
  dispatcher: 'roleDispatcher',
  crew: 'roleCrew',
  auditor: 'roleAuditor',
  resident: 'roleResident',
};

const STATUS_KEYS: Record<string, I18nKey> = {
  active: 'statusActive',
  pending: 'statusPending',
  blocked: 'statusBlocked',
};

/** Role code → display label via i18n. */
export function getRoleLabel(role: string, t: TFn): string {
  const key = ROLE_KEYS[role];
  return key ? t(key) : role;
}

/** User status code → display label via i18n. */
export function getStatusLabel(status: string, t: TFn): string {
  const key = STATUS_KEYS[status];
  return key ? t(key) : status;
}

export function getRoleLabels(t: TFn): Record<string, string> {
  return Object.fromEntries(
    Object.entries(ROLE_KEYS).map(([code, key]) => [code, t(key)]),
  );
}

export function getStatusLabels(t: TFn): Record<string, string> {
  return Object.fromEntries(
    Object.entries(STATUS_KEYS).map(([code, key]) => [code, t(key)]),
  );
}

export const STATUS_COLORS: Record<string, string> = {
  active: 'var(--success)',
  pending: '#b8860b',
  blocked: 'var(--danger, #c0392b)',
};

export const CREATE_ROLES = [
  'chairman',
  'accountant',
  'auditor',
  'board',
  'dispatcher',
  'crew',
] as const;

export const EDIT_ROLES = [...CREATE_ROLES, 'resident'] as const;

export const PAGE_SIZE = 20;
