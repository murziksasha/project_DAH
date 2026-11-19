import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { IdentityService } from './identity.service';

describe('IdentityService - OIDC validation & Phone security', () => {
  let service: IdentityService;
  const configMap: Record<string, string> = {
    IDENTITY_ENABLED: 'true',
    IDENTITY_PROVIDER: 'diia',
    IDENTITY_TOKEN_URL: 'https://idp.local/token',
    IDENTITY_CLIENT_ID: 'client-123',
    IDENTITY_CLIENT_SECRET: 'secret-xyz',
    IDENTITY_ISSUER: 'https://idp.local',
  };

  const prisma = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  const auth = {
    completeLogin: jest.fn().mockResolvedValue({ accessToken: 'tok-1' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        IdentityService,
        {
          provide: ConfigService,
          useValue: { get: (k: string, d?: string) => configMap[k] ?? d },
        },
        { provide: PrismaService, useValue: prisma },
        { provide: AuthService, useValue: auth },
      ],
    }).compile();
    service = module.get(IdentityService);
  });

  function makeJwt(payload: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${header}.${body}.`;
  }

  it('rejects token when mandatory OIDC claims are missing', async () => {
    const authStart = service.startAuthorize();
    const now = Math.floor(Date.now() / 1000);

    // Missing 'sub'
    const idToken = makeJwt({
      iss: 'https://idp.local',
      aud: 'client-123',
      exp: now + 3600,
      iat: now,
      nonce: 'nonce-123',
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id_token: idToken }),
    }) as any;

    await expect(
      service.completeCallback({ code: 'auth-code-1', state: authStart.state }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('supports aud as an array of audiences', async () => {
    const authStart = service.startAuthorize();
    const now = Math.floor(Date.now() / 1000);

    const pending = (service as any).pending.get(authStart.state);

    const idToken = makeJwt({
      iss: 'https://idp.local',
      sub: 'sub-user-1',
      aud: ['client-123', 'other-client'],
      azp: 'client-123',
      exp: now + 3600,
      iat: now,
      nonce: pending.nonce,
      email: 'resident@osbb.local',
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id_token: idToken }),
    }) as any;

    prisma.user.findUnique.mockResolvedValue({
      id: 'usr-1',
      email: 'resident@osbb.local',
      status: 'active',
    });

    const res = await service.completeCallback({ code: 'code-1', state: authStart.state });
    expect(res).toEqual({ accessToken: 'tok-1' });
    expect(auth.completeLogin).toHaveBeenCalled();
  });

  it('rejects expired id_token', async () => {
    const authStart = service.startAuthorize();
    const now = Math.floor(Date.now() / 1000);
    const pending = (service as any).pending.get(authStart.state);

    const idToken = makeJwt({
      iss: 'https://idp.local',
      sub: 'sub-user-1',
      aud: 'client-123',
      exp: now - 120, // expired 2 mins ago
      iat: now - 3600,
      nonce: pending.nonce,
      email: 'resident@osbb.local',
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id_token: idToken }),
    }) as any;

    await expect(
      service.completeCallback({ code: 'code-1', state: authStart.state }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects nonce mismatch', async () => {
    const authStart = service.startAuthorize();
    const now = Math.floor(Date.now() / 1000);

    const idToken = makeJwt({
      iss: 'https://idp.local',
      sub: 'sub-user-1',
      aud: 'client-123',
      exp: now + 3600,
      iat: now,
      nonce: 'wrong-nonce',
      email: 'resident@osbb.local',
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id_token: idToken }),
    }) as any;

    await expect(
      service.completeCallback({ code: 'code-1', state: authStart.state }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('does NOT search user by partial phone substring', async () => {
    const authStart = service.startAuthorize();
    const now = Math.floor(Date.now() / 1000);
    const pending = (service as any).pending.get(authStart.state);

    const idToken = makeJwt({
      iss: 'https://idp.local',
      sub: 'sub-user-1',
      aud: 'client-123',
      exp: now + 3600,
      iat: now,
      nonce: pending.nonce,
      phone_number: '+380501234567',
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id_token: idToken }),
    }) as any;

    prisma.user.findFirst.mockResolvedValue({
      id: 'usr-1',
      phone: '+380501234567',
      status: 'active',
    });

    await service.completeCallback({ code: 'code-1', state: authStart.state });

    // Must search by exact phone '+380501234567', NOT contains: '501234567'
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { phone: '+380501234567' },
    });
  });
});
