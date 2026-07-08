import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { resolveJwtSecret } from '../../common/config/jwt.config';
import { PrismaService } from '../../prisma/prisma.service';
import { parseBuildingSettings } from '../building/building-settings';
import { AuditService } from '../audit/audit.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private audit: AuditService,
  ) {}

  async register(dto: RegisterDto) {
    const envEnabled = this.config.get('REGISTRATION_ENABLED', 'true') !== 'false';
    if (!envEnabled) {
      throw new BadRequestException('Реєстрація тимчасово вимкнена');
    }

    const building = await this.prisma.building.findFirst({ select: { settings: true } });
    const settings = parseBuildingSettings(building?.settings);
    if (settings.registrationEnabled === false) {
      throw new BadRequestException('Реєстрація тимчасово вимкнена адміністратором');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('Email вже зареєстрований');

    const apartment = await this.prisma.apartment.findUnique({
      where: { id: dto.apartmentId },
    });
    if (!apartment) throw new BadRequestException('Квартиру не знайдено');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: UserRole.resident,
        status: UserStatus.pending,
        apartmentId: dto.apartmentId,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
      },
    });

    return { user, message: 'Очікуйте підтвердження від правління' };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Невірний email або пароль');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Невірний email або пароль');

    if (user.status === UserStatus.blocked) {
      throw new UnauthorizedException('Обліковий запис заблоковано');
    }

    if (user.status === UserStatus.pending) {
      throw new UnauthorizedException('Очікуйте підтвердження від правління');
    }

    const tokens = await this.issueTokens(user.id, user.email, user.role);
    const refreshHash = await bcrypt.hash(tokens.refreshToken, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: refreshHash },
    });

    await this.audit.log({
      userId: user.id,
      action: 'auth.login',
      entityType: 'User',
      entityId: user.id,
      payload: { role: user.role },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
        apartmentId: user.apartmentId,
      },
      ...tokens,
    };
  }

  async approveUser(userId: string, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Користувача не знайдено');
    if (user.status !== UserStatus.pending) {
      throw new BadRequestException('Користувач вже підтверджений або заблокований');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.active },
      select: { id: true, email: true, status: true, role: true },
    });

    await this.audit.log({
      userId: actorId,
      action: 'auth.approve',
      entityType: 'User',
      entityId: userId,
      payload: { email: user.email, role: user.role },
    });

    return updated;
  }

  async getPendingUsers() {
    return this.prisma.user.findMany({
      where: { status: UserStatus.pending },
      include: { apartment: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  listApartmentsForRegistration() {
    return this.prisma.apartment.findMany({
      select: { id: true, entrance: true, number: true },
      orderBy: [{ entrance: 'asc' }, { number: 'asc' }],
    });
  }

  async refresh(refreshToken: string) {
    let payload: { sub: string; email: string; role: UserRole };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: resolveJwtSecret(this.config),
      });
    } catch {
      throw new UnauthorizedException('Невірний refresh token');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== UserStatus.active || !user.refreshToken) {
      throw new UnauthorizedException('Сесію завершено');
    }

    const valid = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!valid) throw new UnauthorizedException('Невірний refresh token');

    const tokens = await this.issueTokens(user.id, user.email, user.role);
    const refreshHash = await bcrypt.hash(tokens.refreshToken, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: refreshHash },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
        apartmentId: user.apartmentId,
      },
      ...tokens,
    };
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
    await this.audit.log({
      userId,
      action: 'auth.logout',
      entityType: 'User',
      entityId: userId,
      payload: {},
    });
    return { message: 'Вихід виконано' };
  }

  private async issueTokens(userId: string, email: string, role: UserRole) {
    const payload = { sub: userId, email, role };
    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = await this.jwt.signAsync(payload, {
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES', '7d'),
    });
    return { accessToken, refreshToken };
  }
}