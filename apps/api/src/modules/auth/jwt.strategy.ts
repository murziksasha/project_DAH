import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UserStatus } from '@prisma/client';
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
  }): Promise<AuthUser> {
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
    if (user.tenantId) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: { isActive: true },
      });
      if (!tenant?.isActive) {
        // Keep message aligned with AuthService.assertTenantActive (web detects this).
        throw new UnauthorizedException(
          'Організацію (tenant) деактивовано. Вхід заборонено адміністратором.',
        );
      }
    }
    const apartmentIds = user.apartmentLinks.map((l) => l.apartmentId);
    const tenantId = user.tenantId ?? payload.tenantId ?? null;

    // Prefer membership for active tenant + denormalized role (dual roles per org)
    let role = user.role;
    if (tenantId) {
      const membership =
        (await this.prisma.tenantMembership.findUnique({
          where: {
            userId_tenantId_role: {
              userId: user.id,
              tenantId,
              role: user.role,
            },
          },
          select: { role: true, status: true },
        })) ??
        (await this.prisma.tenantMembership.findFirst({
          where: { userId: user.id, tenantId, status: UserStatus.active },
          select: { role: true, status: true },
        }));
      if (membership) {
        if (membership.status !== UserStatus.active) {
          throw new UnauthorizedException('Членство в організації неактивне');
        }
        role = membership.role;
      }
    }

    return {
      id: user.id,
      email: user.email,
      role,
      apartmentId: user.apartmentId ?? apartmentIds[0] ?? null,
      apartmentIds,
      tenantId,
      sid: payload.sid ?? null,
    };
  }
}