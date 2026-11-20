import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { generateAppRoleSql } from './db-users-init-prod.mjs';

test('generateAppRoleSql creates idempotent role with non-superuser grants', () => {
  const sql = generateAppRoleSql({
    appUser: 'dah_app',
    appPassword: 'safe_app_password_123',
    dbName: 'dah',
  });

  assert.match(sql, /CREATE ROLE dah_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE/);
  assert.match(sql, /ALTER ROLE dah_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE/);
  assert.match(sql, /GRANT CONNECT ON DATABASE "dah" TO dah_app/);
  assert.match(sql, /GRANT USAGE ON SCHEMA public TO dah_app/);
  assert.match(sql, /GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO dah_app/);
  assert.match(sql, /GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO dah_app/);
  assert.match(sql, /ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO dah_app/);

  // Verifies it does not drop role or tables and explicitly sets NOSUPERUSER
  assert.doesNotMatch(sql, /DROP ROLE/i);
  assert.doesNotMatch(sql, /DROP DATABASE/i);
  assert.match(sql, /WITH LOGIN NOSUPERUSER/i);
});

test('package.json wires db:users:init:prod', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['db:users:init:prod'], 'node scripts/db-users-init-prod.mjs');
});
