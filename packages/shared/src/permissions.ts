export enum Permission {
  MANAGE_USERS = 'manage_users',
  MANAGE_BUILDING = 'manage_building',
  MANAGE_SETTINGS = 'manage_settings',
  MANAGE_FINANCE = 'manage_finance',
  READ_FINANCE = 'read_finance',
  MANAGE_SETUP = 'manage_setup',
  /** Service requests queue, assign, SLA (dispatcher / board / chairman). */
  MANAGE_REQUESTS = 'manage_requests',
  /** Work on assigned requests only (crew). */
  WORK_REQUESTS = 'work_requests',
}

const SUPER_ADMIN = 'super_admin';
const CHAIRMAN = 'chairman';
const ACCOUNTANT = 'accountant';
const BOARD = 'board';
const DISPATCHER = 'dispatcher';
const CREW = 'crew';
const AUDITOR = 'auditor';
const RESIDENT = 'resident';

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  [SUPER_ADMIN]: [
    Permission.MANAGE_USERS,
    Permission.MANAGE_BUILDING,
    Permission.MANAGE_SETTINGS,
    Permission.MANAGE_SETUP,
    Permission.READ_FINANCE,
    Permission.MANAGE_REQUESTS,
    Permission.WORK_REQUESTS,
  ],
  [CHAIRMAN]: [
    Permission.MANAGE_USERS,
    Permission.MANAGE_BUILDING,
    Permission.MANAGE_SETTINGS,
    Permission.MANAGE_FINANCE,
    Permission.READ_FINANCE,
    Permission.MANAGE_REQUESTS,
    Permission.WORK_REQUESTS,
  ],
  [ACCOUNTANT]: [Permission.MANAGE_FINANCE, Permission.READ_FINANCE],
  [BOARD]: [
    Permission.MANAGE_FINANCE,
    Permission.READ_FINANCE,
    Permission.MANAGE_REQUESTS,
    Permission.WORK_REQUESTS,
  ],
  [DISPATCHER]: [Permission.MANAGE_REQUESTS, Permission.WORK_REQUESTS],
  [CREW]: [Permission.WORK_REQUESTS],
  [AUDITOR]: [Permission.READ_FINANCE],
  [RESIDENT]: [],
};

export function hasPermission(role: string, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export const ADMIN_PORTAL_ROLES = [
  CHAIRMAN,
  ACCOUNTANT,
  BOARD,
  DISPATCHER,
  CREW,
  AUDITOR,
] as const;

export const FINANCE_WRITE_ROLES = [CHAIRMAN, ACCOUNTANT, BOARD] as const;

export const REQUEST_MANAGE_ROLES = [CHAIRMAN, BOARD, DISPATCHER] as const;

export const REQUEST_WORK_ROLES = [CHAIRMAN, BOARD, DISPATCHER, CREW] as const;

export const CREATABLE_ADMIN_ROLES = [
  CHAIRMAN,
  ACCOUNTANT,
  BOARD,
  DISPATCHER,
  CREW,
  AUDITOR,
] as const;