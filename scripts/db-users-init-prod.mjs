import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  assertProductEnvironment,
  productChildEnvironment,
  productComposeArgs,
  projectRoot,
} from './product-env.mjs';
import {
  assertProductionDockerState,
  describeAbsentContainers,
} from './production-docker-state.mjs';
import { assertCleanReleaseCheckout } from './production-git-state.mjs';

export const generateAppRoleSql = ({ appUser, appPassword, dbName }) => `
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${appUser}') THEN
    CREATE ROLE ${appUser} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${appPassword}';
  ELSE
    ALTER ROLE ${appUser} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${appPassword}';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE "${dbName}" TO ${appUser};
GRANT USAGE ON SCHEMA public TO ${appUser};
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${appUser};
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${appUser};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${appUser};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${appUser};
`;

export const runPostgresRoleInit = (config, currentPassword, { run = spawnSync } = {}) => {
  const sql = generateAppRoleSql({
    appUser: config.postgresAppUser,
    appPassword: config.postgresAppPassword,
    dbName: config.postgresDb,
  });

  const environment = productChildEnvironment({
    PGPASSWORD: currentPassword,
  });

  // Execute psql inside postgres service container via compose exec or run
  const result = run(
    'docker',
    [
      ...productComposeArgs,
      'exec',
      '-T',
      '-e',
      'PGPASSWORD',
      'postgres',
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      config.postgresUser,
      '-d',
      config.postgresDb,
    ],
    {
      cwd: projectRoot,
      env: environment,
      input: sql,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
    },
  );

  if (result.error || result.status !== 0) {
    const errorMsg = result.stderr ? result.stderr.trim() : (result.error?.message ?? 'Unknown error');
    throw new Error(`Failed to configure PostgreSQL role "${config.postgresAppUser}": ${errorMsg}`);
  }
};

export const runMinioUserInit = (config, { run = spawnSync } = {}) => {
  const result = run(
    'docker',
    [
      ...productComposeArgs,
      'run',
      '--rm',
      '--no-deps',
      'minio-init',
    ],
    {
      cwd: projectRoot,
      env: productChildEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    },
  );

  if (result.error || result.status !== 0) {
    const errorMsg = result.stderr ? result.stderr.trim() : (result.error?.message ?? 'Unknown error');
    throw new Error(`Failed to initialize MinIO bucket or user: ${errorMsg}`);
  }
};

const main = () => {
  let config;
  try {
    config = assertProductEnvironment();
    assertCleanReleaseCheckout();
    const dockerState = assertProductionDockerState(config);
    const absent = describeAbsentContainers(dockerState);
    if (absent.length > 0) {
      console.log(`Containers absent (${absent.join(', ')}); starting infra services.`);
    }
  } catch (error) {
    console.error(`\nInitialization aborted: ${error.message}`);
    process.exit(1);
  }

  // Ensure postgres and minio services are up
  console.log('[db:users:init:prod] Ensuring postgres and minio services are running...');
  const upResult = spawnSync(
    'docker',
    [...productComposeArgs, 'up', '-d', 'postgres', 'minio'],
    {
      cwd: projectRoot,
      env: productChildEnvironment(),
      stdio: 'inherit',
    },
  );
  if (upResult.error || upResult.status !== 0) {
    console.error('\nCould not start database services.');
    process.exit(1);
  }

  // Password for superuser: either POSTGRES_CURRENT_PASSWORD (if changing passwords) or POSTGRES_PASSWORD
  const currentPassword =
    process.env.POSTGRES_CURRENT_PASSWORD || config.postgresPassword;

  console.log(`[db:users:init:prod] Configuring application role "${config.postgresAppUser}" in PostgreSQL...`);
  try {
    runPostgresRoleInit(config, currentPassword);
    console.log(`[db:users:init:prod] PostgreSQL role "${config.postgresAppUser}" configured successfully.`);
  } catch (error) {
    console.error(`\n${error.message}`);
    process.exit(1);
  }

  console.log(`[db:users:init:prod] Configuring MinIO storage bucket "${config.s3Bucket}" and application user...`);
  try {
    runMinioUserInit(config);
    console.log(`[db:users:init:prod] MinIO storage configured successfully.`);
  } catch (error) {
    console.error(`\n${error.message}`);
    process.exit(1);
  }

  console.log('\nProduction database and storage users initialized successfully.');
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
