import { IdentityService } from './identity.service';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuthService } from '../auth/auth.service';

/** Phase 3: review of the public /identity/* endpoints. */
describe('IdentityService public surface', () => {
  const make = (env: Record<string, string>) =>
    new IdentityService(
      { get: (k: string, d?: unknown) => env[k] ?? d } as unknown as ConfigService,
      {} as PrismaService,
      {} as AuthService,
    );
  const base = { IDENTITY_ENABLED: 'true', IDENTITY_PROVIDER: 'mock', NODE_ENV: 'test', APP_URL: 'https://osbb.example' };

  it('mock page only for the enabled mock provider outside production', () => {
    expect(make(base).mockPageAllowed()).toBe(true);
    expect(make({ ...base, IDENTITY_ENABLED: 'false' }).mockPageAllowed()).toBe(false);
    expect(make({ ...base, IDENTITY_PROVIDER: 'diia' }).mockPageAllowed()).toBe(false);
    expect(make({ ...base, NODE_ENV: 'production' }).mockPageAllowed()).toBe(false);
    expect(make({ ...base, NODE_ENV: 'production', IDENTITY_ALLOW_MOCK: 'true' }).mockPageAllowed()).toBe(false);
    expect(make({ ...base, IDENTITY_ALLOW_MOCK: 'false' }).mockPageAllowed()).toBe(false);
  });

  it('redirect_uri must be http(s) on the app / callback origin', () => {
    const s = make({ ...base, IDENTITY_REDIRECT_URI: 'https://login.example/cb' });
    expect(s.isAllowedRedirect('https://osbb.example/login?identity=callback')).toBe(true);
    expect(s.isAllowedRedirect('https://login.example/cb')).toBe(true);
    expect(s.isAllowedRedirect('javascript:alert(1)')).toBe(false);
    expect(s.isAllowedRedirect('https://evil.example/login')).toBe(false);
    expect(s.isAllowedRedirect('//evil.example')).toBe(false);
    expect(s.isAllowedRedirect('data:text/html,x')).toBe(false);
  });

  it('mock authorize refused in production; pending states are bounded and pruned', () => {
    expect(() => make({ ...base, NODE_ENV: 'production' }).startAuthorize()).toThrow();
    const s = make(base);
    for (let i = 0; i < IdentityService.MAX_PENDING + 5; i++) s.startAuthorize();
    expect(s.pendingCount()).toBeLessThanOrEqual(IdentityService.MAX_PENDING);
  });

  it('mock callback refused when mock is disabled', async () => {
    await expect(make({ ...base, IDENTITY_ALLOW_MOCK: 'false' }).completeMock({ email: 'a@b.c' })).rejects.toThrow();
  });
});
