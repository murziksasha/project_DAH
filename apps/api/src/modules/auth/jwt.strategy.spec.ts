import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole, UserStatus } from '@prisma/client';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy - Session & Revocation Validation', () => {
  const jwtSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  function createStrategy(prismaMock: any) {
    const config = {
      get: jest.fn((key: string, def?: string) => {
        if (key === 'JWT_SECRET') return jwtSecret;
        return def;
      }),
    } as unknown as ConfigService;

    return new JwtStrategy(config, prismaMock);
  }

  const baseUser = {
    id: 'user-1',
    email: 'user@example.com',
    role: UserRole.resident,
    status: UserStatus.active,
    tenantId: 'tenant-1',
    apartmentId: 'apt-1',
    apartmentLinks: [{ apartmentId: 'apt-1', isPrimary: true }],
  };

  const activeTenant = {
    id: 'tenant-1',
    isActive: true,
  };

  it('rejects token without typ=access (e.g. 2FA tempToken, refresh, or missing typ)', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(baseUser) },
    };
    const strategy = createStrategy(prisma);

    await expect(
      strategy.validate({ sub: 'user-1', sid: 'session-123', typ: '2fa' } as any),
    ).rejects.toThrow(new UnauthorizedException('Недійсний тип токена'));

    await expect(
      strategy.validate({ sub: 'user-1', sid: 'session-123', typ: 'refresh' } as any),
    ).rejects.toThrow(new UnauthorizedException('Недійсний тип токена'));

    await expect(
      strategy.validate({ sub: 'user-1', sid: 'session-123' } as any),
    ).rejects.toThrow(new UnauthorizedException('Недійсний тип токена'));
  });

  it('rejects token without sid', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(baseUser) },
    };
    const strategy = createStrategy(prisma);

    await expect(
      strategy.validate({ sub: 'user-1', typ: 'access' } as any),
    ).rejects.toThrow(new UnauthorizedException('Сесія не вказана або недійсна'));
  });

  it('throws UnauthorizedException when user does not exist or is inactive', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const strategy = createStrategy(prisma);
    await expect(
      strategy.validate({ sub: 'missing-user', typ: 'access', sid: 'session-1' }),
    ).rejects.toThrow(UnauthorizedException);

    const inactivePrisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...baseUser, status: UserStatus.pending }),
      },
    };
    const inactiveStrategy = createStrategy(inactivePrisma);
    await expect(
      strategy.validate({ sub: 'user-1', typ: 'access', sid: 'session-1' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('validates active session when sid matches and revokedAt is null', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(baseUser) },
      authSession: {
        findUnique: jest.fn().mockResolvedValue({
          userId: 'user-1',
          revokedAt: null,
        }),
      },
      tenant: { findUnique: jest.fn().mockResolvedValue(activeTenant) },
      tenantMembership: {
        findUnique: jest.fn().mockResolvedValue({ role: UserRole.resident, status: UserStatus.active }),
      },
    };

    const strategy = createStrategy(prisma);
    const user = await strategy.validate({ sub: 'user-1', sid: 'session-123', typ: 'access' });

    expect(user.id).toBe('user-1');
    expect(user.sid).toBe('session-123');
  });

  it('throws UnauthorizedException when session has been revoked (revokedAt set)', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(baseUser) },
      authSession: {
        findUnique: jest.fn().mockResolvedValue({
          userId: 'user-1',
          revokedAt: new Date(),
        }),
      },
    };

    const strategy = createStrategy(prisma);
    await expect(
      strategy.validate({ sub: 'user-1', sid: 'session-123', typ: 'access' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when session does not exist in DB', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(baseUser) },
      authSession: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    const strategy = createStrategy(prisma);
    await expect(
      strategy.validate({ sub: 'user-1', sid: 'session-nonexistent', typ: 'access' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when session belongs to a different user', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(baseUser) },
      authSession: {
        findUnique: jest.fn().mockResolvedValue({
          userId: 'other-user',
          revokedAt: null,
        }),
      },
    };

    const strategy = createStrategy(prisma);
    await expect(
      strategy.validate({ sub: 'user-1', sid: 'session-stolen', typ: 'access' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
