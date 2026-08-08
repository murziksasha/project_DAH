import { UserRole } from '@prisma/client';

/** System roles that can appear in a tenant catalog (not platform super_admin). */
export const ORG_ROLE_CODES: UserRole[] = [
  UserRole.chairman,
  UserRole.accountant,
  UserRole.board,
  UserRole.dispatcher,
  UserRole.crew,
  UserRole.auditor,
  UserRole.resident,
];

export const ORG_ROLE_SORT: Record<string, number> = {
  [UserRole.chairman]: 10,
  [UserRole.accountant]: 20,
  [UserRole.board]: 30,
  [UserRole.dispatcher]: 40,
  [UserRole.crew]: 50,
  [UserRole.auditor]: 60,
  [UserRole.resident]: 70,
};

/** Roles that must stay in catalog (cannot hard-delete config). */
export const PROTECTED_ORG_ROLES: UserRole[] = [UserRole.chairman, UserRole.resident];

export function isOrgRoleCode(code: string): code is UserRole {
  return ORG_ROLE_CODES.includes(code as UserRole);
}
