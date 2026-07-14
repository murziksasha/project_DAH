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
import { buildOtpAuthUrl, generateTotpSecret, verifyTotp } from '../../common/utils/totp';
import { PrismaService } from '../../prisma/prisma.service';
import { parseBuildingSettings } from '../building/building-settings';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const TWO_FA_ROLES: UserRole[] = [
  UserRole.super_admin,
  UserRole.chairman,
  UserRole.accountant,
  UserRole.board,
  UserRole.auditor,
];

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private audit: AuditService,
    private mail: MailService,
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
        apartmentLinks: {
          create: { apartmentId: dto.apartmentId, isPrimary: true },
        },
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

    void this.mail.sendTemplate(user.email, 'registration.pending', {
      firstName: user.firstName,
      lastName: user.lastName,
      apartmentNumber: apartment.number,
    });
    void this.mail.notifyAdmins('registration.new_request', {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      apartmentNumber: apartment.number,
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

    if (user.totpEnabled && user.totpSecret) {
      if (dto.code) {
        if (!verifyTotp(dto.code, user.totpSecret)) {
          throw new UnauthorizedException('Невірний код 2FA');
        }
        return this.completeLogin(user);
      }
      const tempToken = await this.jwt.signAsync(
        { sub: user.id, purpose: '2fa' },
        { expiresIn: '5m', secret: resolveJwtSecret(this.config) },
      );
      return {
        requires2fa: true as const,
        tempToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
      };
    }

    return this.completeLogin(user);
  }

  async verify2fa(tempToken: string, code: string) {
    let payload: { sub: string; purpose?: string };
    try {
      payload = await this.jwt.verifyAsync(tempToken, {
        secret: resolveJwtSecret(this.config),
      });
    } catch {
      throw new UnauthorizedException('Сесію 2FA завершено, увійдіть знову');
    }
    if (payload.purpose !== '2fa') {
      throw new UnauthorizedException('Невірний токен 2FA');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== UserStatus.active || !user.totpEnabled || !user.totpSecret) {
      throw new UnauthorizedException('2FA недоступна');
    }
    if (!verifyTotp(code, user.totpSecret)) {
      throw new UnauthorizedException('Невірний код 2FA');
    }
    return this.completeLogin(user);
  }

  async setup2fa(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Користувача не знайдено');
    if (!TWO_FA_ROLES.includes(user.role)) {
      throw new BadRequestException('2FA доступна для ролей правління та адміністраторів');
    }
    if (user.totpEnabled) {
      throw new BadRequestException('2FA вже увімкнено');
    }

    const secret = generateTotpSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpTempSecret: secret },
    });

    const otpauthUrl = buildOtpAuthUrl({
      secret,
      email: user.email,
      issuer: 'DAH OSMD',
    });

    return {
      secret,
      otpauthUrl,
      qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`,
    };
  }

  async enable2fa(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.totpTempSecret) {
      throw new BadRequestException('Спочатку викличте setup 2FA');
    }
    if (!verifyTotp(code, user.totpTempSecret)) {
      throw new BadRequestException('Невірний код — перевірте застосунок-аутентифікатор');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        totpSecret: user.totpTempSecret,
        totpEnabled: true,
        totpTempSecret: null,
      },
    });
    await this.audit.log({
      userId,
      action: 'auth.2fa_enabled',
      entityType: 'User',
      entityId: userId,
      payload: {},
    });
    return { totpEnabled: true };
  }

  async disable2fa(userId: string, password: string, code?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Користувача не знайдено');
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Невірний пароль');
    if (user.totpEnabled && user.totpSecret) {
      if (!code || !verifyTotp(code, user.totpSecret)) {
        throw new BadRequestException('Потрібен код 2FA');
      }
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: false, totpSecret: null, totpTempSecret: null },
    });
    await this.audit.log({
      userId,
      action: 'auth.2fa_disabled',
      entityType: 'User',
      entityId: userId,
      payload: {},
    });
    return { totpEnabled: false };
  }

  async get2faStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { totpEnabled: true, role: true, emailNotifyEnabled: true },
    });
    if (!user) throw new NotFoundException('Користувача не знайдено');
    return {
      totpEnabled: user.totpEnabled,
      available: TWO_FA_ROLES.includes(user.role),
      emailNotifyEnabled: user.emailNotifyEnabled,
    };
  }

  async setEmailNotify(userId: string, enabled: boolean) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailNotifyEnabled: enabled },
    });
    return { emailNotifyEnabled: enabled };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Користувача не знайдено');

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Поточний пароль невірний');

    if (currentPassword === newPassword) {
      throw new BadRequestException('Новий пароль має відрізнятися від поточного');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, refreshToken: null },
    });

    await this.audit.log({
      userId,
      action: 'auth.password_changed',
      entityType: 'User',
      entityId: userId,
      payload: {},
    });

    return { message: 'Пароль змінено. Увійдіть знову.' };
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
      select: { id: true, email: true, status: true, role: true, firstName: true, lastName: true },
    });

    await this.audit.log({
      userId: actorId,
      action: 'auth.approve',
      entityType: 'User',
      entityId: userId,
      payload: { email: user.email, role: user.role },
    });

    void this.mail.sendTemplate(updated.email, 'registration.approved', {
      firstName: updated.firstName,
      lastName: updated.lastName,
    });

    return updated;
  }

  async rejectUser(userId: string, actorId: string, reason?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Користувача не знайдено');
    if (user.status !== UserStatus.pending) {
      throw new BadRequestException('Можна відхилити лише заявки зі статусом «очікує»');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.blocked, refreshToken: null },
      select: { id: true, email: true, status: true, role: true, firstName: true, lastName: true },
    });

    await this.audit.log({
      userId: actorId,
      action: 'auth.reject',
      entityType: 'User',
      entityId: userId,
      payload: { email: user.email, reason: reason ?? null },
    });

    void this.mail.sendTemplate(updated.email, 'registration.rejected', {
      firstName: updated.firstName,
      lastName: updated.lastName,
      reason,
    });

    return updated;
  }

  async getPendingUsers() {
    const users = await this.prisma.user.findMany({
      where: { status: UserStatus.pending },
      include: {
        apartmentLinks: {
          include: { apartment: true },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return users.map((u) => {
      const primary =
        u.apartmentLinks.find((l) => l.isPrimary)?.apartment ??
        u.apartmentLinks[0]?.apartment ??
        null;
      return {
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phone,
        createdAt: u.createdAt,
        apartment: primary
          ? { id: primary.id, number: primary.number, entrance: primary.entrance }
          : null,
        apartments: u.apartmentLinks.map((l) => ({
          id: l.apartment.id,
          number: l.apartment.number,
          entrance: l.apartment.entrance,
          isPrimary: l.isPrimary,
        })),
      };
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
      user: this.publicUser(user),
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

  private async completeLogin(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    status: UserStatus;
    apartmentId: string | null;
  }) {
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
      requires2fa: false as const,
      user: this.publicUser(user),
      ...tokens,
    };
  }

  private publicUser(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    status: UserStatus;
    apartmentId: string | null;
  }) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
      apartmentId: user.apartmentId,
    };
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
