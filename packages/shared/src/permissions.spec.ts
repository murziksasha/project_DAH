import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FINANCE_WRITE_ROLES,
  Permission,
  ROLE_PERMISSIONS,
  hasPermission,
} from './permissions';

describe('ROLE_PERMISSIONS matrix', () => {
  it('resident has no finance permissions', () => {
    assert.equal(hasPermission('resident', Permission.READ_FINANCE), false);
    assert.equal(hasPermission('resident', Permission.MANAGE_FINANCE), false);
  });

  it('dispatcher/crew cannot manage finance', () => {
    assert.equal(hasPermission('dispatcher', Permission.MANAGE_FINANCE), false);
    assert.equal(hasPermission('dispatcher', Permission.READ_FINANCE), false);
    assert.equal(hasPermission('crew', Permission.MANAGE_FINANCE), false);
    assert.equal(hasPermission('crew', Permission.READ_FINANCE), false);
  });

  it('accountant can write finance', () => {
    assert.equal(hasPermission('accountant', Permission.MANAGE_FINANCE), true);
    assert.equal(hasPermission('accountant', Permission.READ_FINANCE), true);
  });

  it('auditor can read but not manage finance', () => {
    assert.equal(hasPermission('auditor', Permission.READ_FINANCE), true);
    assert.equal(hasPermission('auditor', Permission.MANAGE_FINANCE), false);
  });

  it('super_admin has read finance but not manage (policy snapshot)', () => {
    assert.equal(hasPermission('super_admin', Permission.READ_FINANCE), true);
    assert.equal(hasPermission('super_admin', Permission.MANAGE_FINANCE), false);
  });

  it('FINANCE_WRITE_ROLES align with MANAGE_FINANCE', () => {
    for (const role of FINANCE_WRITE_ROLES) {
      assert.equal(hasPermission(role, Permission.MANAGE_FINANCE), true);
    }
  });

  it('matrix snapshot keys', () => {
    assert.deepEqual(Object.keys(ROLE_PERMISSIONS).sort(), [
      'accountant',
      'auditor',
      'board',
      'chairman',
      'crew',
      'dispatcher',
      'resident',
      'super_admin',
    ].sort());
  });
});
