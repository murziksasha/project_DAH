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

  async validate(payload: { sub: string; tenantId?: string | null }): Promise<AuthUser> {
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
        throw new UnauthorizedException('Організацію (tenant) деактивовано');
      }
    }
    const apartmentIds = user.apartmentLinks.map((l) => l.apartmentId);
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      apartmentId: user.apartmentId ?? apartmentIds[0] ?? null,
      apartmentIds,
      tenantId: user.tenantId ?? payload.tenantId ?? null,
    };
  }
}