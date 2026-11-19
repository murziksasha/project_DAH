import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const productEnvPath = resolve(projectRoot, '.env.product');

export const productComposeArgs = [
  'compose',
  '--env-file',
  '.env.product',
  '-f',
  'docker-compose.yml',
  '-f',
  'docker-compose.prod.yml',
];

export const rollbackComposeArgs = [
  ...productComposeArgs,
  '-f',
  'docker-compose.rollback.yml',
];

export const productImageRefs = (gitSha) => [
  `miy-dim/api:${gitSha}`,
  `miy-dim/web:${gitSha}`,
];

export const rollbackImageRefs = [
  'miy-dim/api:rollback',
  'miy-dim/web:rollback',
];

const FORBIDDEN_PLACEHOLDER_REGEX =
  /(change_me|dah_secret_change_me|dah_minio_secret_change_me|password123|replace_with|change_me_to_random_64_char_string)/i;

const invalidEnv = (detail) =>
  new Error(
    `Invalid .env.product configuration${detail ? `: ${detail}` : ''}. See .env.product.example for reference.`,
  );

export const readAssignment = (contents, name, { required = true } = {}) => {
  const lines = contents.split(/\r?\n/);
  const matching = lines.filter((line) => new RegExp(`^\\s*${name}\\s*=`).test(line));

  if (matching.length === 0) {
    if (required) throw invalidEnv(`Missing required variable ${name}`);
    return null;
  }
  if (matching.length > 1) {
    throw invalidEnv(`Duplicate assignment for variable ${name}`);
  }

  let value = matching[0].slice(matching[0].indexOf('=') + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }

  if (required && !value) {
    throw invalidEnv(`Empty value for required variable ${name}`);
  }
  return value;
};

export const parseProductVolumeConfig = (contents) => {
  const projectName = readAssignment(contents, 'COMPOSE_PROJECT_NAME');
  const postgresDataVolume = readAssignment(contents, 'POSTGRES_DATA_VOLUME');
  const minioDataVolume = readAssignment(contents, 'MINIO_DATA_VOLUME');

  if (!/^[a-z0-9][a-z0-9_-]*$/.test(projectName)) {
    throw invalidEnv('COMPOSE_PROJECT_NAME must contain only lowercase alphanumeric characters, dashes, or underscores');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(postgresDataVolume)) {
    throw invalidEnv('Invalid POSTGRES_DATA_VOLUME name');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(minioDataVolume)) {
    throw invalidEnv('Invalid MINIO_DATA_VOLUME name');
  }
  if (postgresDataVolume === minioDataVolume) {
    throw invalidEnv('POSTGRES_DATA_VOLUME and MINIO_DATA_VOLUME must be distinct volumes');
  }

  return {
    projectName,
    postgresDataVolume,
    minioDataVolume,
  };
};

export const parseProductConfig = (contents) => {
  // Check for forbidden SUPER_ADMIN_PASSWORD
  const superAdminMatch = contents
    .split(/\r?\n/)
    .find((line) => /^\s*SUPER_ADMIN_PASSWORD\s*=/.test(line));
  if (superAdminMatch) {
    throw invalidEnv(
      'SUPER_ADMIN_PASSWORD is forbidden in .env.product. Initial super admin must be created once via CLI (npm run db:super-admin)',
    );
  }

  const volumeConfig = parseProductVolumeConfig(contents);

  const postgresUser = readAssignment(contents, 'POSTGRES_USER');
  const postgresPassword = readAssignment(contents, 'POSTGRES_PASSWORD');
  const postgresDb = readAssignment(contents, 'POSTGRES_DB', { required: false }) || 'dah';

  const postgresAppUser = readAssignment(contents, 'POSTGRES_APP_USER');
  if (postgresAppUser !== 'dah_app') {
    throw invalidEnv('POSTGRES_APP_USER must be set to dah_app');
  }
  const postgresAppPassword = readAssignment(contents, 'POSTGRES_APP_PASSWORD');

  const databaseUrl = readAssignment(contents, 'DATABASE_URL');
  try {
    const parsedUrl = new URL(databaseUrl);
    if (parsedUrl.protocol !== 'postgresql:') {
      throw invalidEnv('DATABASE_URL protocol must be postgresql:');
    }
    if (parsedUrl.username !== 'dah_app') {
      throw invalidEnv('DATABASE_URL must connect as dah_app, not superuser');
    }
    if (parsedUrl.hostname !== 'postgres') {
      throw invalidEnv('DATABASE_URL hostname must be postgres');
    }
    const dbPath = parsedUrl.pathname.replace(/^\//, '');
    if (dbPath !== postgresDb) {
      throw invalidEnv(`DATABASE_URL database (${dbPath}) does not match POSTGRES_DB (${postgresDb})`);
    }
    if (decodeURIComponent(parsedUrl.password) !== postgresAppPassword) {
      throw invalidEnv('DATABASE_URL password must match POSTGRES_APP_PASSWORD');
    }
  } catch (err) {
    if (err.message.startsWith('Invalid .env.product')) throw err;
    throw invalidEnv('DATABASE_URL is not a valid URL');
  }

  const jwtSecret = readAssignment(contents, 'JWT_SECRET');
  if (jwtSecret.length < 32) {
    throw invalidEnv('JWT_SECRET must be at least 32 characters');
  }

  const fileDownloadSecret = readAssignment(contents, 'FILE_DOWNLOAD_SECRET');
  if (fileDownloadSecret.length < 32) {
    throw invalidEnv('FILE_DOWNLOAD_SECRET must be at least 32 characters');
  }
  if (fileDownloadSecret === jwtSecret) {
    throw invalidEnv('FILE_DOWNLOAD_SECRET and JWT_SECRET must be distinct secrets');
  }

  const s3RootUser = readAssignment(contents, 'S3_ROOT_USER');
  const s3RootPassword = readAssignment(contents, 'S3_ROOT_PASSWORD');
  const s3AccessKey = readAssignment(contents, 'S3_ACCESS_KEY');
  const s3SecretKey = readAssignment(contents, 'S3_SECRET_KEY');
  const s3Bucket = readAssignment(contents, 'S3_BUCKET', { required: false }) || 'dah-files';

  if (s3AccessKey === s3RootUser) {
    throw invalidEnv('S3_ACCESS_KEY must be a dedicated bucket user, not S3_ROOT_USER');
  }
  if (s3SecretKey === s3RootPassword) {
    throw invalidEnv('S3_SECRET_KEY must be distinct from S3_ROOT_PASSWORD');
  }

  const corsOrigin = readAssignment(contents, 'CORS_ORIGIN');
  if (!corsOrigin.split(',').every((origin) => origin.trim().startsWith('https://'))) {
    throw invalidEnv('CORS_ORIGIN must use https:// in production');
  }

  const appUrl = readAssignment(contents, 'APP_URL');
  if (!appUrl.startsWith('https://')) {
    throw invalidEnv('APP_URL must use https:// in production');
  }

  const cookieSecure = readAssignment(contents, 'COOKIE_SECURE');
  if (cookieSecure !== 'true') {
    throw invalidEnv('COOKIE_SECURE must be true in production');
  }

  const nodeEnv = readAssignment(contents, 'NODE_ENV');
  if (nodeEnv !== 'production') {
    throw invalidEnv('NODE_ENV must be production');
  }

  const kepAllowMock = readAssignment(contents, 'KEP_ALLOW_MOCK');
  if (kepAllowMock !== 'false') {
    throw invalidEnv('KEP_ALLOW_MOCK must be false in production');
  }

  const swaggerEnabled = readAssignment(contents, 'SWAGGER_ENABLED');
  if (swaggerEnabled !== 'false') {
    throw invalidEnv('SWAGGER_ENABLED must be false in production');
  }

  const paymentsEnabled = readAssignment(contents, 'ONLINE_PAYMENTS_ENABLED', { required: false });
  if (paymentsEnabled === 'true') {
    const paymentsSandbox = readAssignment(contents, 'ONLINE_PAYMENTS_SANDBOX', { required: false });
    if (paymentsSandbox === 'true') {
      throw invalidEnv('ONLINE_PAYMENTS_SANDBOX must be false when ONLINE_PAYMENTS_ENABLED=true in production');
    }
  }

  const identityEnabled = readAssignment(contents, 'IDENTITY_ENABLED', { required: false });
  if (identityEnabled === 'true') {
    const identityProvider = readAssignment(contents, 'IDENTITY_PROVIDER', { required: false });
    if (!identityProvider || identityProvider.toLowerCase() === 'mock') {
      throw invalidEnv('IDENTITY_PROVIDER cannot be mock when IDENTITY_ENABLED=true in production');
    }
  }

  // Placeholder check across all verified values
  const allValues = [
    postgresUser,
    postgresPassword,
    postgresAppPassword,
    jwtSecret,
    fileDownloadSecret,
    s3RootUser,
    s3RootPassword,
    s3AccessKey,
    s3SecretKey,
  ];

  for (const val of allValues) {
    if (FORBIDDEN_PLACEHOLDER_REGEX.test(val)) {
      throw invalidEnv('Placeholder values (change_me, REPLACE_, password123) are forbidden in production');
    }
  }

  return {
    ...volumeConfig,
    postgresUser,
    postgresPassword,
    postgresDb,
    postgresAppUser,
    postgresAppPassword,
    databaseUrl,
    jwtSecret,
    fileDownloadSecret,
    s3RootUser,
    s3RootPassword,
    s3AccessKey,
    s3SecretKey,
    s3Bucket,
    corsOrigin,
    appUrl,
    cookieSecure: true,
    nodeEnv: 'production',
  };
};

const readPrivateProductFile = () => {
  try {
    if (!statSync(productEnvPath).isFile()) throw invalidEnv('.env.product is not a file');
    return readFileSync(productEnvPath, 'utf8');
  } catch (err) {
    if (err.message.startsWith('Invalid .env.product')) throw err;
    throw invalidEnv('Could not read .env.product file. Ensure .env.product exists and has proper permissions');
  }
};

export const assertProductEnvironment = () => {
  return parseProductConfig(readPrivateProductFile());
};

export const assertProductVolumeEnvironment = () => {
  return parseProductVolumeConfig(readPrivateProductFile());
};

export const assertLocalDevelopmentHost = (
  hasProductEnv = () => existsSync(productEnvPath),
) => {
  if (hasProductEnv()) {
    throw new Error(
      'Production .env.product detected. Local development commands are disabled on this host. Use product commands (npm run update:prod, etc.).',
    );
  }
};

export const productChildEnvironment = (additional = {}) => {
  const {
    DATABASE_URL: _ignoredDbUrl,
    POSTGRES_USER: _ignoredPgUser,
    POSTGRES_PASSWORD: _ignoredPgPass,
    POSTGRES_APP_USER: _ignoredPgAppUser,
    POSTGRES_APP_PASSWORD: _ignoredPgAppPass,
    POSTGRES_DB: _ignoredPgDb,
    JWT_SECRET: _ignoredJwt,
    FILE_DOWNLOAD_SECRET: _ignoredFileSecret,
    S3_ROOT_USER: _ignoredS3RootUser,
    S3_ROOT_PASSWORD: _ignoredS3RootPass,
    S3_ACCESS_KEY: _ignoredS3Key,
    S3_SECRET_KEY: _ignoredS3Secret,
    COMPOSE_PROJECT_NAME: _ignoredProject,
    POSTGRES_DATA_VOLUME: _ignoredPgVolume,
    MINIO_DATA_VOLUME: _ignoredMinioVolume,
    ...environment
  } = process.env;
  return { ...environment, ...additional };
};
