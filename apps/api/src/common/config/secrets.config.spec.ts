import {
  assertProductionSecrets,
  collectSecretProblems,
  databaseUrlPassword,
  looksLikePlaceholder,
  resolveFileDownloadSecret,
} from './secrets.config';

const strong = (c: string) => c.repeat(40);

describe('secrets.config (H6)', () => {
  const good = {
    NODE_ENV: 'production',
    JWT_SECRET: strong('a1'),
    FILE_DOWNLOAD_SECRET: strong('b2'),
    TOTP_ENCRYPTION_KEY: strong('c3'),
    S3_SECRET_KEY: 'Zx9-q8Lr7',
    DATABASE_URL: 'postgresql://dah:Kq83_xyzPPq@db:5432/dah',
  } as NodeJS.ProcessEnv;

  it('detects example placeholders', () => {
    expect(looksLikePlaceholder('dah_secret_change_me')).toBe(true);
    expect(looksLikePlaceholder('REPLACE_WITH_RANDOM_64_HEX')).toBe(true);
    expect(looksLikePlaceholder('super_secure_jwt_random_secret_string')).toBe(true);
    expect(looksLikePlaceholder('9f2c1e0b7a')).toBe(false);
    expect(looksLikePlaceholder(undefined)).toBe(false);
  });

  it('parses DB password', () => {
    expect(databaseUrlPassword('postgresql://u:p%40ss@h:1/d')).toBe('p@ss');
    expect(databaseUrlPassword('not a url')).toBeNull();
  });

  it('accepts strong production config and ignores non-production', () => {
    expect(collectSecretProblems(good)).toEqual([]);
    expect(collectSecretProblems({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toEqual([]);
    expect(() => assertProductionSecrets(good)).not.toThrow();
  });

  it('rejects short / placeholder / reused secrets in production', () => {
    const p = collectSecretProblems({
      ...good,
      JWT_SECRET: 'short',
      FILE_DOWNLOAD_SECRET: 'short',
      S3_SECRET_KEY: 'dah_minio_secret',
      DATABASE_URL: 'postgresql://dah:dah_secret_change_me@db:5432/dah',
      KEP_WEBHOOK_SECRET: 'change_me',
    });
    expect(p.join('\n')).toMatch(/JWT_SECRET must be at least/);
    expect(p.join('\n')).toMatch(/FILE_DOWNLOAD_SECRET must be at least/);
    expect(p.join('\n')).toMatch(/S3_SECRET_KEY/);
    expect(p.join('\n')).toMatch(/DATABASE_URL password/);
    expect(p.join('\n')).toMatch(/KEP_WEBHOOK_SECRET/);
    expect(collectSecretProblems({ ...good, FILE_DOWNLOAD_SECRET: good.JWT_SECRET })).toContain(
      'FILE_DOWNLOAD_SECRET must differ from JWT_SECRET',
    );
    expect(collectSecretProblems({ ...good, JWT_SECRET: undefined })).toContain('JWT_SECRET is not set');
    expect(() => assertProductionSecrets({ ...good, JWT_SECRET: 'x' })).toThrow(/Unsafe production/);
  });

  it('derives the file-download secret from JWT when not set (domain separated)', () => {
    const env: Record<string, string> = { JWT_SECRET: 'jwt' };
    const derived = resolveFileDownloadSecret((k) => env[k]);
    expect(derived).toMatch(/^[0-9a-f]{64}$/);
    expect(derived).not.toBe('jwt');
    expect(resolveFileDownloadSecret((k) => ({ FILE_DOWNLOAD_SECRET: 'x' })[k])).toBe('x');
    expect(resolveFileDownloadSecret(() => undefined)).toBe('dev-only-insecure-file-secret');
  });

  it('throws without any secret in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => resolveFileDownloadSecret(() => undefined)).toThrow();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
