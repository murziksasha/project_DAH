import { ConfigService } from '@nestjs/config';

const DEV_FALLBACK = 'dev-secret-change-me';

export function resolveJwtSecret(config?: ConfigService): string {
  const isTest = process.env.NODE_ENV === 'test';
  const secret = config?.get<string>('JWT_SECRET') ?? process.env.JWT_SECRET;

  if (secret) return secret;

  if (isTest) return 'test-jwt-secret';

  throw new Error(
    'JWT_SECRET is required. Set a strong random secret in .env before starting the API.',
  );
}

export function assertProductionJwtSecret(): void {
  if (process.env.NODE_ENV === 'test') return;

  const secret = process.env.JWT_SECRET;
  if (!secret || secret === DEV_FALLBACK || secret === 'change_me_to_random_64_char_string') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be set to a strong unique value in production.');
    }
  }
}