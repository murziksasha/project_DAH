export enum Permission {
  MANAGE_USERS = 'manage_users',
  MANAGE_BUILDING = 'manage_building',
  MANAGE_SETTINGS = 'manage_settings',
  MANAGE_FINANCE = 'manage_finance',
  READ_FINANCE = 'read_finance',
  MANAGE_SETUP = 'manage_setup',
}

const SUPER_ADMIN = 'super_admin';
const CHAIRMAN = 'chairman';
const ACCOUNTANT = 'accountant';
const BOARD = 'board';
const AUDITOR = 'auditor';
const RESIDENT = 'resident';

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  [SUPER_ADMIN]: [
    Permission.MANAGE_USERS,
    Permission.MANAGE_BUILDING,
    Permission.MANAGE_SETTINGS,
    Permission.MANAGE_SETUP,
    Permission.READ_FINANCE,
  ],
  [CHAIRMAN]: [
    Permission.MANAGE_USERS,
    Permission.MANAGE_BUILDING,
    Permission.MANAGE_SETTINGS,
    Permission.MANAGE_FINANCE,
    Permission.READ_FINANCE,
  ],
  [ACCOUNTANT]: [Permission.MANAGE_FINANCE, Permission.READ_FINANCE],
  [BOARD]: [Permission.MANAGE_FINANCE, Permission.READ_FINANCE],
  [AUDITOR]: [Permission.READ_FINANCE],
  [RESIDENT]: [],
};

export function hasPermission(role: string, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export const ADMIN_PORTAL_ROLES = [CHAIRMAN, ACCOUNTANT, BOARD, AUDITOR] as const;

export const FINANCE_WRITE_ROLES = [CHAIRMAN, ACCOUNTANT, BOARD] as const;

export const CREATABLE_ADMIN_ROLES = [CHAIRMAN, ACCOUNTANT, BOARD, AUDITOR] as const;