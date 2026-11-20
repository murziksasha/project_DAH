import { createHmac } from 'crypto';

/**
 * Production secret hygiene (H6).
 *
 * Example / placeholder values from `.env.example`, `.env.selfhost.example`,
 * `.env.product.example` and the Windows native scripts are rejected at startup
 * when NODE_ENV=production, so a copied example file can never reach production.
 */
const PLACEHOLDER_PATTERNS: RegExp[] = [
  /change[_-]?me/i,
  /changeme/i,
  /replace[_-]?with/i,
  /dev-secret/i,
  /dev-only/i,
  /insecure/i,
  /password123/i,
  /^secret$/i,
  /^test-jwt-secret$/i,
  // .env.selfhost.example literal values
  /super_secure_jwt_random_secret_string/i,
  /super_secure_file_download_secret/i,
  /dah_storage_secret/i,
  /dah_strong_secret/i,
  /dah_minio_secret/i,
  /your[_-]?secret/i,
  /example/i,
];

export const MIN_SECRET_LENGTH = 32;

export function looksLikePlaceholder(value: string | undefined | null): boolean {
  if (!value) return false;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(value));
}

/** Password part of a postgres URL (or null). */
export function databaseUrlPassword(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.password ? decodeURIComponent(u.password) : null;
  } catch {
    return null;
  }
}

/**
 * Collect problems with secrets for the given environment. Empty array = OK.
 * Only enforced for NODE_ENV=production (dev/test keep convenient defaults).
 */
export function collectSecretProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const problems: string[] = [];

  const jwt = env.JWT_SECRET;
  if (!jwt) problems.push('JWT_SECRET is not set');
  else {
    if (jwt.length < MIN_SECRET_LENGTH) {
      problems.push(`JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
    }
    if (looksLikePlaceholder(jwt)) problems.push('JWT_SECRET is an example/placeholder value');
  }

  const fileSecret = env.FILE_DOWNLOAD_SECRET;
  if (fileSecret) {
    if (fileSecret.length < MIN_SECRET_LENGTH) {
      problems.push(`FILE_DOWNLOAD_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
    }
    if (looksLikePlaceholder(fileSecret)) {
      problems.push('FILE_DOWNLOAD_SECRET is an example/placeholder value');
    }
    if (jwt && fileSecret === jwt) {
      problems.push('FILE_DOWNLOAD_SECRET must differ from JWT_SECRET');
    }
  }

  const totpKey = env.TOTP_ENCRYPTION_KEY;
  if (totpKey && looksLikePlaceholder(totpKey)) {
    problems.push('TOTP_ENCRYPTION_KEY is an example/placeholder value');
  }

  if (env.S3_SECRET_KEY && looksLikePlaceholder(env.S3_SECRET_KEY)) {
    problems.push('S3_SECRET_KEY is an example/placeholder value');
  }

  const dbPass = databaseUrlPassword(env.DATABASE_URL);
  if (dbPass && looksLikePlaceholder(dbPass)) {
    problems.push('DATABASE_URL password is an example/placeholder value');
  }

  if (env.KEP_WEBHOOK_SECRET && looksLikePlaceholder(env.KEP_WEBHOOK_SECRET)) {
    problems.push('KEP_WEBHOOK_SECRET is an example/placeholder value');
  }

  return problems;
}

/** Throws on startup (API and worker) when production secrets are unsafe. */
export function assertProductionSecrets(env: NodeJS.ProcessEnv = process.env): void {
  const problems = collectSecretProblems(env);
  if (problems.length) {
    throw new Error(
      `Unsafe production configuration:\n - ${problems.join('\n - ')}\n` +
        'Generate strong random values (e.g. `openssl rand -hex 32`) and restart.',
    );
  }
}

/**
 * HMAC secret for signed file-download links.
 * FILE_DOWNLOAD_SECRET → else a key derived from JWT_SECRET (domain-separated, so a
 * leaked download signature never equals a JWT key) → dev-only fallback outside prod.
 */
export function resolveFileDownloadSecret(get: (key: string) => string | undefined): string {
  const explicit = get('FILE_DOWNLOAD_SECRET');
  if (explicit) return explicit;
  const jwt = get('JWT_SECRET');
  if (jwt) return createHmac('sha256', jwt).update('dah:file-download:v1').digest('hex');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FILE_DOWNLOAD_SECRET (or JWT_SECRET) is required in production');
  }
  return 'dev-only-insecure-file-secret';
}
