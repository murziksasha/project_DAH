import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UserRole, UserStatus } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { resolveJwtSecret } from '../../common/config/jwt.config';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(config),
    });
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
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        apartmentLinks: {
          select: { apartmentId: true },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
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
      return {
        id: user.id,
        email: user.email,
        role: UserRole.super_admin,
        apartmentId: null,
        apartmentIds: [],
        tenantId: null,
        sid: payload.sid ?? null,
      };
    }

    const effectiveTenantId = session.tenantId ?? payload.tenantId ?? user.tenantId;
    if (!effectiveTenantId) {
      throw new UnauthorizedException('Організацію не обрано або відсутня');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: effectiveTenantId },
      select: { isActive: true },
    });
    if (!tenant?.isActive) {
      // Keep message aligned with AuthService.assertTenantActive (web detects this).
      throw new UnauthorizedException(
        'Організацію (tenant) деактивовано. Вхід заборонено адміністратором.',
      );
    }

    const targetRole = session.role ?? user.role;
    const membership =
      (await this.prisma.tenantMembership.findUnique({
        where: {
          userId_tenantId_role: {
            userId: user.id,
            tenantId: effectiveTenantId,
            role: targetRole,
          },
        },
        select: { role: true, status: true },
      })) ??
      (await this.prisma.tenantMembership.findFirst({
        where: { userId: user.id, tenantId: effectiveTenantId, status: UserStatus.active },
        select: { role: true, status: true },
      }));

    if (!membership || membership.status !== UserStatus.active) {
      throw new UnauthorizedException('Членство в організації неактивне або відсутнє');
    }

    const apartmentIds = user.apartmentLinks.map((l) => l.apartmentId);

    return {
      id: user.id,
      email: user.email,
      role: membership.role,
      apartmentId: user.apartmentId ?? apartmentIds[0] ?? null,
      apartmentIds,
      tenantId: effectiveTenantId,
      sid: payload.sid ?? null,
    };
  }
}