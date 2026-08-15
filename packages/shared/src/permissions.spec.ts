import {
  FINANCE_WRITE_ROLES,
  Permission,
  ROLE_PERMISSIONS,
  hasPermission,
} from './permissions';

describe('ROLE_PERMISSIONS matrix', () => {
  it('resident has no finance permissions', () => {
    expect(hasPermission('resident', Permission.READ_FINANCE)).toBe(false);
    expect(hasPermission('resident', Permission.MANAGE_FINANCE)).toBe(false);
  });

  it('dispatcher/crew cannot manage finance', () => {
    expect(hasPermission('dispatcher', Permission.MANAGE_FINANCE)).toBe(false);
    expect(hasPermission('dispatcher', Permission.READ_FINANCE)).toBe(false);
    expect(hasPermission('crew', Permission.MANAGE_FINANCE)).toBe(false);
    expect(hasPermission('crew', Permission.READ_FINANCE)).toBe(false);
  });

  it('accountant can write finance', () => {
    expect(hasPermission('accountant', Permission.MANAGE_FINANCE)).toBe(true);
    expect(hasPermission('accountant', Permission.READ_FINANCE)).toBe(true);
  });

  it('auditor can read but not manage finance', () => {
    expect(hasPermission('auditor', Permission.READ_FINANCE)).toBe(true);
    expect(hasPermission('auditor', Permission.MANAGE_FINANCE)).toBe(false);
  });

  it('super_admin has read finance but not manage (policy snapshot)', () => {
    expect(hasPermission('super_admin', Permission.READ_FINANCE)).toBe(true);
    expect(hasPermission('super_admin', Permission.MANAGE_FINANCE)).toBe(false);
  });

  it('FINANCE_WRITE_ROLES align with MANAGE_FINANCE', () => {
    for (const role of FINANCE_WRITE_ROLES) {
      expect(hasPermission(role, Permission.MANAGE_FINANCE)).toBe(true);
    }
  });

  it('matrix snapshot keys', () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(
      [
        'accountant',
        'auditor',
        'board',
        'chairman',
        'crew',
        'dispatcher',
        'resident',
        'super_admin',
      ].sort(),
    );
  });
});
