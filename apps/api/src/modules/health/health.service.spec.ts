import { ConfigService } from '@nestjs/config';
import { HealthService } from './health.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('HealthService redis optional', () => {
  function makeService(env: Record<string, string | undefined>) {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as unknown as PrismaService;
    const config = {
      get: (key: string, def?: string) => {
        if (key in env) return env[key];
        return def;
      },
    } as unknown as ConfigService;
    return new HealthService(prisma, config);
  }

  it('skips redis when REDIS_URL is none/empty', async () => {
    const svc = makeService({ REDIS_URL: 'none', S3_ENDPOINT: 'http://127.0.0.1:1' });
    const result = await svc.check();
    expect(result.redis).toBe('skipped');
    expect(result.db).toBe('up');
  });

  it('skips redis when REDIS_URL unset', async () => {
    const svc = makeService({ REDIS_URL: '' });
    const result = await svc.check();
    expect(result.redis).toBe('skipped');
  });
});
