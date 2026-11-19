import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  assertLocalDevelopmentHost,
  parseProductConfig,
  parseProductVolumeConfig,
  productChildEnvironment,
  productImageRefs,
  rollbackImageRefs,
} from './product-env.mjs';
import { assertCleanStatus } from './production-git-state.mjs';

const validConfigLines = [
  'COMPOSE_PROJECT_NAME=project_dah',
  'POSTGRES_DATA_VOLUME=project_dah_postgres_data',
  'MINIO_DATA_VOLUME=project_dah_minio_data',
  'POSTGRES_USER=postgres',
  'POSTGRES_PASSWORD=strong_postgres_superuser_pass_12345',
  'POSTGRES_DB=dah',
  'POSTGRES_APP_USER=dah_app',
  'POSTGRES_APP_PASSWORD=strong_app_pass_67890',
  'DATABASE_URL=postgresql://dah_app:strong_app_pass_67890@postgres:5432/dah',
  'JWT_SECRET=super_secret_jwt_random_key_64_bytes_long_string_1234567890',
  'FILE_DOWNLOAD_SECRET=different_file_secret_random_key_64_bytes_long_string_1234567890',
  'S3_ROOT_USER=minio_admin',
  'S3_ROOT_PASSWORD=strong_minio_root_password_98765',
  'S3_ACCESS_KEY=dah_app_storage',
  'S3_SECRET_KEY=strong_minio_app_secret_54321',
  'S3_BUCKET=dah-files',
  'DOMAIN=osbb.example.com',
  'CORS_ORIGIN=https://osbb.example.com',
  'APP_URL=https://osbb.example.com',
  'COOKIE_SECURE=true',
  'NODE_ENV=production',
  'KEP_ALLOW_MOCK=false',
  'SWAGGER_ENABLED=false',
  'ONLINE_PAYMENTS_ENABLED=false',
  'ONLINE_PAYMENTS_SANDBOX=false',
  'IDENTITY_ENABLED=false',
  'IDENTITY_PROVIDER=dia',
];

const validConfig = validConfigLines.join('\n');

test('accepts valid production configuration', () => {
  const config = parseProductConfig(validConfig);
  assert.equal(config.projectName, 'project_dah');
  assert.equal(config.postgresAppUser, 'dah_app');
  assert.equal(config.databaseUrl, 'postgresql://dah_app:strong_app_pass_67890@postgres:5432/dah');
  assert.equal(config.cookieSecure, true);
  assert.equal(config.nodeEnv, 'production');
});

test('rejects placeholders (change_me, REPLACE_, password123)', () => {
  assert.throws(
    () => parseProductConfig(validConfig.replaceAll('strong_app_pass_67890', 'dah_secret_change_me')),
    /placeholder/i,
  );
  assert.throws(
    () => parseProductConfig(validConfig.replace('strong_postgres_superuser_pass_12345', 'password123')),
    /placeholder/i,
  );
  assert.throws(
    () => parseProductConfig(validConfig.replace('strong_minio_root_password_98765', 'REPLACE_WITH_PASS')),
    /placeholder/i,
  );
});

test('strictly forbids SUPER_ADMIN_PASSWORD in .env.product', () => {
  assert.throws(
    () => parseProductConfig(`${validConfig}\nSUPER_ADMIN_PASSWORD=some_secret_password`),
    /SUPER_ADMIN_PASSWORD is forbidden/i,
  );
});

test('rejects superuser in DATABASE_URL (must be dah_app)', () => {
  assert.throws(
    () =>
      parseProductConfig(
        validConfig.replace(
          'DATABASE_URL=postgresql://dah_app:strong_app_pass_67890@postgres:5432/dah',
          'DATABASE_URL=postgresql://postgres:strong_postgres_superuser_pass_12345@postgres:5432/dah',
        ),
      ),
    /DATABASE_URL must connect as dah_app/i,
  );
});

test('rejects DATABASE_URL pointing to wrong host or wrong database', () => {
  assert.throws(
    () =>
      parseProductConfig(
        validConfig.replace('@postgres:5432/dah', '@localhost:5432/dah'),
      ),
    /hostname must be postgres/i,
  );
  assert.throws(
    () =>
      parseProductConfig(
        validConfig.replace('@postgres:5432/dah', '@postgres:5432/other_db'),
      ),
    /does not match POSTGRES_DB/i,
  );
});

test('requires JWT_SECRET and FILE_DOWNLOAD_SECRET to be distinct and >= 32 chars', () => {
  assert.throws(
    () =>
      parseProductConfig(
        validConfig.replace(
          'JWT_SECRET=super_secret_jwt_random_key_64_bytes_long_string_1234567890',
          'JWT_SECRET=short',
        ),
      ),
    /at least 32 characters/i,
  );
  assert.throws(
    () =>
      parseProductConfig(
        validConfig.replace(
          'FILE_DOWNLOAD_SECRET=different_file_secret_random_key_64_bytes_long_string_1234567890',
          'FILE_DOWNLOAD_SECRET=super_secret_jwt_random_key_64_bytes_long_string_1234567890',
        ),
      ),
    /must be distinct/i,
  );
});

test('requires HTTPS for CORS_ORIGIN and APP_URL', () => {
  assert.throws(
    () =>
      parseProductConfig(
        validConfig.replace('CORS_ORIGIN=https://osbb.example.com', 'CORS_ORIGIN=http://osbb.example.com'),
      ),
    /must use https:\/\//i,
  );
  assert.throws(
    () =>
      parseProductConfig(
        validConfig.replace('APP_URL=https://osbb.example.com', 'APP_URL=http://osbb.example.com'),
      ),
    /must use https:\/\//i,
  );
});

test('rejects sandbox payments when payments are enabled in production', () => {
  assert.throws(
    () =>
      parseProductConfig(
        validConfig
          .replace('ONLINE_PAYMENTS_ENABLED=false', 'ONLINE_PAYMENTS_ENABLED=true')
          .replace('ONLINE_PAYMENTS_SANDBOX=false', 'ONLINE_PAYMENTS_SANDBOX=true'),
      ),
    /ONLINE_PAYMENTS_SANDBOX must be false/i,
  );
});

test('rejects mock identity provider when identity is enabled in production', () => {
  assert.throws(
    () =>
      parseProductConfig(
        validConfig
          .replace('IDENTITY_ENABLED=false', 'IDENTITY_ENABLED=true')
          .replace('IDENTITY_PROVIDER=dia', 'IDENTITY_PROVIDER=mock'),
      ),
    /IDENTITY_PROVIDER cannot be mock/i,
  );
});

test('refuses local Docker commands when .env.product exists', () => {
  assert.doesNotThrow(() => assertLocalDevelopmentHost(() => false));
  assert.throws(() => assertLocalDevelopmentHost(() => true), /Production \.env\.product detected/i);
});

test('productChildEnvironment strips sensitive shell variables', () => {
  const originalEnv = process.env;
  try {
    process.env.DATABASE_URL = 'postgresql://attacker:pass@evil:5432/db';
    process.env.POSTGRES_PASSWORD = 'shell_leaked_password';
    process.env.JWT_SECRET = 'shell_leaked_jwt';
    process.env.S3_SECRET_KEY = 'shell_leaked_s3';
    process.env.SAFE_CUSTOM_VAR = 'kept_value';

    const childEnv = productChildEnvironment({ EXTRA_VAR: 'added' });
    assert.equal(childEnv.DATABASE_URL, undefined);
    assert.equal(childEnv.POSTGRES_PASSWORD, undefined);
    assert.equal(childEnv.JWT_SECRET, undefined);
    assert.equal(childEnv.S3_SECRET_KEY, undefined);
    assert.equal(childEnv.SAFE_CUSTOM_VAR, 'kept_value');
    assert.equal(childEnv.EXTRA_VAR, 'added');
  } finally {
    process.env = originalEnv;
  }
});

test('generates expected commit-tagged and rollback image references', () => {
  assert.deepEqual(productImageRefs('a1b2c3d'), [
    'miy-dim/api:a1b2c3d',
    'miy-dim/web:a1b2c3d',
  ]);
  assert.deepEqual(rollbackImageRefs, [
    'miy-dim/api:rollback',
    'miy-dim/web:rollback',
  ]);
});

test('requires a clean git release checkout', () => {
  assert.doesNotThrow(() => assertCleanStatus(''));
  assert.throws(() => assertCleanStatus(' M docker-compose.prod.yml\n'));
  assert.throws(() => assertCleanStatus('?? secret-notes.txt\n'));
});
