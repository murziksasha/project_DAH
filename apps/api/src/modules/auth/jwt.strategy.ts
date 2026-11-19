import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AUTH_CACHE_MAX, authCache, invalidateAuthCache } from '../../common/auth-cache';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UserRole, UserStatus } from '../../prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { resolveJwtSecret } from '../../common/config/jwt.config';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly cacheTtlMs: number;

  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(config),
    });
    this.cacheTtlMs = Math.max(0, Number(config.get('AUTH_CACHE_TTL_MS', '0')) || 0);
  }

  async validate(payload: {
    sub: string;
    tenantId?: string | null;
    sid?: string;
    typ?: string;
    purpose?: string;
  }): Promise<AuthUser> {
    if (payload.typ !== 'access') {
      throw new UnauthorizedException('Недійсний тип токена');
    }
    if (!payload.sid) {
      throw new UnauthorizedException('Сесія не вказана або недійсна');
    }
    const cacheKey = `${payload.sub}:${payload.sid}:${payload.tenantId ?? ''}`;
    const cached = this.cacheGet(cacheKey);
    if (cached) return cached;

    // M18: user + memberships (+ tenant status) in one query, session in a second one
    // (was 4–5 round trips per request).
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        apartmentLinks: {
          select: { apartmentId: true },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
        memberships: {
          select: {
            tenantId: true,
            role: true,
            status: true,
            createdAt: true,
            tenant: { select: { isActive: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!user || user.status !== UserStatus.active) {
      throw new UnauthorizedException('Користувач не авторизований');
    }
    const session = await this.prisma.authSession.findUnique({
      where: { id: payload.sid },
      select: { userId: true, revokedAt: true, tenantId: true, role: true },
    });
    if (!session || session.revokedAt || session.userId !== user.id) {
      throw new UnauthorizedException('Сесія недійсна або відкликана');
    }

    const isPlatformAdmin =
      user.role === UserRole.super_admin &&
      !user.tenantId &&
      !session.tenantId &&
      !payload.tenantId;

    if (isPlatformAdmin) {
      return this.cacheSet(cacheKey, {
        id: user.id,
        email: user.email,
        role: UserRole.super_admin,
        apartmentId: null,
        apartmentIds: [],
        tenantId: null,
        sid: payload.sid ?? null,
      });
    }

    const effectiveTenantId = session.tenantId ?? payload.tenantId ?? user.tenantId;
    if (!effectiveTenantId) {
      throw new UnauthorizedException('Організацію не обрано або відсутня');
    }

    const inTenant = (user.memberships ?? []).filter((m) => m.tenantId === effectiveTenantId);
    if (inTenant.some((m) => m.tenant && !m.tenant.isActive)) {
      // Keep message aligned with AuthService.assertTenantActive (web detects this).
      throw new UnauthorizedException(
        'Організацію (tenant) деактивовано. Вхід заборонено адміністратором.',
      );
    }

    const targetRole = session.role ?? user.role;
    const membership =
      inTenant.find((m) => m.role === targetRole) ??
      inTenant.find((m) => m.status === UserStatus.active);

    if (!membership || membership.status !== UserStatus.active) {
      throw new UnauthorizedException('Членство в організації неактивне або відсутнє');
    }

    const apartmentIds = user.apartmentLinks.map((l) => l.apartmentId);

    return this.cacheSet(cacheKey, {
      id: user.id,
      email: user.email,
      role: membership.role,
      apartmentId: user.apartmentId ?? apartmentIds[0] ?? null,
      apartmentIds,
      tenantId: effectiveTenantId,
      sid: payload.sid ?? null,
    });
  }

  /**
   * Optional short-lived cache (AUTH_CACHE_TTL_MS, default 0 = off). Revocation,
   * deactivation and role changes become visible after at most the TTL.
   */
  private cacheGet(key: string): AuthUser | null {
    if (this.cacheTtlMs <= 0) return null;
    const hit = authCache.get(key) as { user: AuthUser; expires: number } | undefined;
    if (!hit) return null;
    if (hit.expires < Date.now()) {
      authCache.delete(key);
      return null;
    }
    return { ...hit.user, apartmentIds: [...(hit.user.apartmentIds ?? [])] };
  }

  private cacheSet(key: string, user: AuthUser): AuthUser {
    if (this.cacheTtlMs > 0) {
      if (authCache.size >= AUTH_CACHE_MAX) authCache.clear();
      authCache.set(key, { user, expires: Date.now() + this.cacheTtlMs });
    }
    return user;
  }
}

export { invalidateAuthCache };
