import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { resolveJwtSecret } from '../../common/config/jwt.config';
import { assertPasswordStrength } from '../../common/utils/password-policy';
import { openSecret, sealSecret } from '../../common/utils/secret-box';
import { buildOtpAuthUrl, generateTotpSecret, verifyTotp } from '../../common/utils/totp';
import { PrismaService } from '../../prisma/prisma.service';
import { parseBuildingSettings } from '../building/building-settings';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../sms/sms.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const TWO_FA_ROLES: UserRole[] = [
  UserRole.super_admin,
  UserRole.chairman,
  UserRole.accountant,
  UserRole.board,
  UserRole.auditor,
];

/** Roles that should use 2FA for finance / high privilege. */
const FINANCE_2FA_ROLES: UserRole[] = [
  UserRole.chairman,
  UserRole.accountant,
  UserRole.board,
  UserRole.super_admin,
];

const MAX_FAILED_LOGINS = 10;
const LOCK_MINUTES = 15;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

interface RefreshJwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  sid: string;
  fam: string;
  typ: 'refresh';
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private audit: AuditService,
    private mail: MailService,
    private sms: SmsService,
  ) {}

  private totpPlain(stored: string | null | undefined): string | null {
    return openSecret(stored);
  }

  async register(dto: RegisterDto) {
    const envEnabled = this.config.get('REGISTRATION_ENABLED', 'true') !== 'false';
    if (!envEnabled) {
      throw new BadRequestException('Реєстрація тимчасово вимкнена');
    }

    assertPasswordStrength(dto.password);

    const apartment = await this.prisma.apartment.findUnique({
      where: { id: dto.apartmentId },
      include: { building: { select: { tenantId: true, settings: true } } },
    });
    if (!apartment) throw new BadRequestException('Квартиру не знайдено');

    const settings = parseBuildingSettings(apartment.building.settings);
    if (settings.registrationEnabled === false) {
      throw new BadRequestException('Реєстрація тимчасово вимкнена адміністратором');
    }
    if (settings.registrationInviteCode) {
      const code = (dto.inviteCode ?? '').trim();
      if (!code || code !== settings.registrationInviteCode) {
        throw new BadRequestException('Невірний код запрошення');
      }
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('Email вже зареєстрований');

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
        tenantId: apartment.building.tenantId,
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

  async login(dto: LoginDto, meta: SessionMeta = {}) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      await this.auditLoginFailure(dto.email, 'unknown_user');
      throw new UnauthorizedException('Невірний email або пароль');
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      await this.auditLoginFailure(dto.email, 'locked', user.id);
      throw new UnauthorizedException(
        `Обліковий запис тимчасово заблоковано до ${user.lockedUntil.toISOString()}. Спробуйте пізніше.`,
      );
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      await this.recordFailedLogin(user.id, dto.email);
      throw new UnauthorizedException('Невірний email або пароль');
    }

    if (user.status === UserStatus.blocked) {
      await this.auditLoginFailure(dto.email, 'blocked', user.id);
      throw new UnauthorizedException('Обліковий запис заблоковано');
    }

    if (user.status === UserStatus.pending) {
      await this.auditLoginFailure(dto.email, 'pending', user.id);
      throw new UnauthorizedException('Очікуйте підтвердження від правління');
    }

    // Reset lockout counters on good password
    if (user.failedLoginCount > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
    }

    const totpSecret = this.totpPlain(user.totpSecret);
    if (user.totpEnabled && totpSecret) {
      if (dto.code) {
        if (!verifyTotp(dto.code, totpSecret)) {
          await this.auditLoginFailure(dto.email, 'bad_2fa', user.id);
          throw new UnauthorizedException('Невірний код 2FA');
        }
        return this.completeLogin(user, meta);
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

    return this.completeLogin(user, meta);
  }

  private async recordFailedLogin(userId: string, email: string) {
    await this.auditLoginFailure(email, 'bad_password', userId);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    if (updated.failedLoginCount >= MAX_FAILED_LOGINS) {
      const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
      await this.prisma.user.update({
        where: { id: userId },
        data: { lockedUntil, failedLoginCount: 0 },
      });
      await this.audit.log({
        userId,
        action: 'auth.account_locked',
        entityType: 'User',
        entityId: userId,
        payload: { minutes: LOCK_MINUTES },
      });
    }
  }

  async verify2fa(tempToken: string, code: string, meta: SessionMeta = {}) {
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
    const totpSecret = this.totpPlain(user?.totpSecret);
    if (!user || user.status !== UserStatus.active || !user.totpEnabled || !totpSecret) {
      throw new UnauthorizedException('2FA недоступна');
    }
    if (!verifyTotp(code, totpSecret)) {
      await this.auditLoginFailure(user.email, 'bad_2fa', user.id);
      throw new UnauthorizedException('Невірний код 2FA');
    }
    return this.completeLogin(user, meta);
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
      data: { totpTempSecret: sealSecret(secret) },
    });

    const otpauthUrl = buildOtpAuthUrl({
      secret,
      email: user.email,
      issuer: 'Мій дім',
    });

    return {
      secret,
      otpauthUrl,
      qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`,
    };
  }

  async enable2fa(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const temp = this.totpPlain(user?.totpTempSecret);
    if (!user || !temp) {
      throw new BadRequestException('Спочатку викличте setup 2FA');
    }
    if (!verifyTotp(code, temp)) {
      throw new BadRequestException('Невірний код — перевірте застосунок-аутентифікатор');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        totpSecret: sealSecret(temp),
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
    const totpSecret = this.totpPlain(user.totpSecret);
    if (user.totpEnabled && totpSecret) {
      if (!code || !verifyTotp(code, totpSecret)) {
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
      select: { totpEnabled: true, role: true, emailNotifyEnabled: true, onboardingDone: true },
    });
    if (!user) throw new NotFoundException('Користувача не знайдено');
    const required =
      FINANCE_2FA_ROLES.includes(user.role) &&
      process.env.REQUIRE_FINANCE_2FA !== 'false';
    return {
      totpEnabled: user.totpEnabled,
      available: TWO_FA_ROLES.includes(user.role),
      required: required && !user.totpEnabled,
      finance2faRequired: required,
      emailNotifyEnabled: user.emailNotifyEnabled,
      onboardingDone: user.onboardingDone,
    };
  }

  async completeOnboarding(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { onboardingDone: true },
    });
    return { onboardingDone: true };
  }

  /**
   * Soft-check for finance actions: when REQUIRE_FINANCE_2FA is on and role is finance,
   * user must have totpEnabled. Controllers call this optionally.
   */
  async assertFinance2faIfRequired(userId: string) {
    if (process.env.REQUIRE_FINANCE_2FA === 'false') return;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, totpEnabled: true },
    });
    if (!user) throw new UnauthorizedException();
    if (FINANCE_2FA_ROLES.includes(user.role) && !user.totpEnabled) {
      throw new BadRequestException(
        'Увімкніть двофакторну автентифікацію (2FA) у «Безпека» перед фінансовими діями',
      );
    }
  }

  async requestPasswordReset(email: string) {
    const generic = {
      ok: true as const,
      message: 'Якщо email зареєстровано, надіслано інструкції для скидання пароля',
    };
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user || user.status === UserStatus.blocked) {
      return generic;
    }

    const raw = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(raw).digest('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const appUrl = (this.config.get<string>('APP_URL') ?? 'http://localhost:8080').replace(
      /\/$/,
      '',
    );
    const resetUrl = `${appUrl}/login?reset=${raw}`;

    void this.mail.sendTemplate(user.email, 'auth.password_reset', {
      firstName: user.firstName,
      lastName: user.lastName,
      appUrl: resetUrl,
      body: `Посилання дійсне 1 годину: ${resetUrl}`,
    });

    await this.audit.log({
      userId: user.id,
      action: 'auth.password_reset_requested',
      entityType: 'User',
      entityId: user.id,
      payload: {},
    });

    return generic;
  }

  async resetPasswordWithToken(token: string, newPassword: string) {
    assertPasswordStrength(newPassword);
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const row = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });
    if (!row) {
      throw new BadRequestException('Посилання недійсне або прострочене');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: row.userId },
        data: {
          passwordHash,
          failedLoginCount: 0,
          lockedUntil: null,
          refreshToken: null,
        },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.authSession.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.log({
      userId: row.userId,
      action: 'auth.password_reset_completed',
      entityType: 'User',
      entityId: row.userId,
      payload: {},
    });

    return { ok: true, message: 'Пароль змінено. Увійдіть з новим паролем.' };
  }

  async setEmailNotify(userId: string, enabled: boolean) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailNotifyEnabled: enabled },
    });
    return { emailNotifyEnabled: enabled };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
        apartmentId: true,
        tenantId: true,
        emailNotifyEnabled: true,
        totpEnabled: true,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            orgType: true,
            isActive: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException('Користувача не знайдено');
    return user;
  }

  async updateProfile(
    userId: string,
    dto: { firstName?: string; lastName?: string; phone?: string | null },
  ) {
    const data: { firstName?: string; lastName?: string; phone?: string | null } = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) data.lastName = dto.lastName.trim();
    if (dto.phone !== undefined) {
      data.phone = dto.phone?.trim() ? dto.phone.trim() : null;
    }
    if (!Object.keys(data).length) {
      throw new BadRequestException('Немає змін');
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
      },
    });
    await this.audit.log({
      userId,
      action: 'auth.profile_updated',
      entityType: 'User',
      entityId: userId,
      payload: { fields: Object.keys(data) },
    });
    return updated;
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Користувача не знайдено');

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Поточний пароль невірний');

    if (currentPassword === newPassword) {
      throw new BadRequestException('Новий пароль має відрізнятися від поточного');
    }

    assertPasswordStrength(newPassword);

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, refreshToken: null },
    });
    await this.revokeAllSessions(userId);

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
      data: {
        status: UserStatus.active,
        approvedAt: new Date(),
        approvedById: actorId,
      },
      select: {
        id: true,
        email: true,
        status: true,
        role: true,
        firstName: true,
        lastName: true,
        approvedAt: true,
        approvedById: true,
      },
    });

    const approver = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    });

    await this.audit.log({
      userId: actorId,
      action: 'auth.approve',
      entityType: 'User',
      entityId: userId,
      payload: {
        email: user.email,
        role: user.role,
        approvedBy: approver
          ? {
              id: approver.id,
              email: approver.email,
              firstName: approver.firstName,
              lastName: approver.lastName,
              role: approver.role,
            }
          : { id: actorId },
      },
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
    await this.revokeAllSessions(userId);

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

  /**
   * Public registration helper.
   * If any building has registrationInviteCode, inviteCode is required and filters that building.
   * Without invite config, returns apartments of the first building (single-OSBB mode).
   */
  async listApartmentsForRegistration(inviteCode?: string) {
    const buildings = await this.prisma.building.findMany({
      select: { id: true, settings: true, name: true },
      orderBy: { createdAt: 'asc' },
    });

    const withInvite = buildings.filter((b) => {
      const s = parseBuildingSettings(b.settings);
      return Boolean(s.registrationInviteCode);
    });

    let buildingIds: string[];

    if (withInvite.length > 0) {
      const code = (inviteCode ?? '').trim();
      if (!code) {
        return {
          requiresInvite: true as const,
          apartments: [] as Array<{ id: string; entrance: number; number: string }>,
          message: 'Введіть код запрошення від правління',
        };
      }
      const matched = withInvite.filter((b) => {
        const s = parseBuildingSettings(b.settings);
        return s.registrationInviteCode === code;
      });
      if (!matched.length) {
        throw new BadRequestException('Невірний код запрошення');
      }
      buildingIds = matched.map((b) => b.id);
    } else {
      // No invite: only expose first building (limit enumeration for multi-building)
      const first = buildings[0];
      if (!first) {
        return { requiresInvite: false as const, apartments: [] };
      }
      buildingIds = [first.id];
    }

    const apartments = await this.prisma.apartment.findMany({
      where: { buildingId: { in: buildingIds } },
      select: { id: true, entrance: true, number: true },
      orderBy: [{ entrance: 'asc' }, { number: 'asc' }],
    });

    return { requiresInvite: withInvite.length > 0, apartments };
  }

  /**
   * Rotate refresh token. Reuse of an already-rotated token revokes the whole family.
   */
  async refresh(refreshToken: string | undefined, meta: SessionMeta = {}) {
    if (!refreshToken) {
      throw new UnauthorizedException('Невірний refresh token');
    }

    let payload: RefreshJwtPayload;
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: resolveJwtSecret(this.config),
      });
    } catch {
      throw new UnauthorizedException('Невірний refresh token');
    }

    if (payload.typ !== 'refresh' || !payload.sid || !payload.fam) {
      // Legacy refresh JWT without session claims — reject (force re-login after upgrade)
      throw new UnauthorizedException('Сесію завершено, увійдіть знову');
    }

    const session = await this.prisma.authSession.findUnique({ where: { id: payload.sid } });
    if (!session || session.userId !== payload.sub) {
      throw new UnauthorizedException('Сесію завершено');
    }

    if (session.revokedAt) {
      // Reuse after rotation / logout
      await this.revokeFamily(session.familyId, payload.sub, 'refresh_reuse');
      throw new UnauthorizedException('Сесію завершено через повторне використання токена');
    }

    const valid = await bcrypt.compare(refreshToken, session.refreshTokenHash);
    if (!valid) {
      await this.revokeFamily(session.familyId, payload.sub, 'refresh_reuse');
      throw new UnauthorizedException('Сесію завершено через повторне використання токена');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== UserStatus.active) {
      await this.revokeAllSessions(payload.sub);
      throw new UnauthorizedException('Сесію завершено');
    }

    // Rotate: revoke current row, issue new session same family
    await this.prisma.authSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), lastUsedAt: new Date() },
    });

    const tokens = await this.issueSessionTokens(
      user.id,
      user.email,
      user.role,
      session.familyId,
      meta,
      user.tenantId,
    );

    // Legacy column for older clients / admin tooling
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: await bcrypt.hash(tokens.refreshToken, 10) },
    });

    const tenant = user.tenantId
      ? await this.prisma.tenant.findUnique({
          where: { id: user.tenantId },
          select: { id: true, name: true, slug: true, orgType: true },
        })
      : null;

    return {
      user: this.publicUser(user, tenant),
      ...tokens,
    };
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      try {
        const payload = await this.jwt.verifyAsync<RefreshJwtPayload>(refreshToken, {
          secret: resolveJwtSecret(this.config),
        });
        if (payload.sid && payload.sub === userId) {
          await this.prisma.authSession.updateMany({
            where: { id: payload.sid, userId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
      } catch {
        // ignore invalid token; still clear legacy field
      }
    } else {
      await this.revokeAllSessions(userId);
    }

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

  async logoutAll(userId: string) {
    await this.revokeAllSessions(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
    await this.audit.log({
      userId,
      action: 'auth.logout_all',
      entityType: 'User',
      entityId: userId,
      payload: {},
    });
    return { message: 'Усі сесії завершено' };
  }

  /** Active (non-revoked) refresh sessions for device list UI. */
  async listSessions(userId: string, currentSid?: string | null) {
    const rows = await this.prisma.authSession.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        userAgent: true,
        ip: true,
        createdAt: true,
        lastUsedAt: true,
        familyId: true,
      },
      take: 50,
    });
    return {
      items: rows.map((s) => ({
        id: s.id,
        userAgent: s.userAgent,
        ip: s.ip,
        createdAt: s.createdAt,
        lastUsedAt: s.lastUsedAt,
        current: Boolean(currentSid && s.id === currentSid),
      })),
    };
  }

  async revokeSession(userId: string, sessionId: string, currentSid?: string | null) {
    const session = await this.prisma.authSession.findFirst({
      where: { id: sessionId, userId, revokedAt: null },
    });
    if (!session) throw new NotFoundException('Сесію не знайдено');

    await this.prisma.authSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
    // Revoke whole family so rotated refresh siblings die too
    await this.prisma.authSession.updateMany({
      where: { familyId: session.familyId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.audit.log({
      userId,
      action: 'auth.session_revoked',
      entityType: 'AuthSession',
      entityId: sessionId,
      payload: { familyId: session.familyId },
    });

    const isCurrent = Boolean(currentSid && sessionId === currentSid);
    if (isCurrent) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { refreshToken: null },
      });
    }
    return { ok: true, currentRevoked: isCurrent };
  }

  /** SMS OTP login — requires SMS_ENABLED and user.phone match. */
  async requestSmsLogin(phone: string) {
    if (!this.sms.isEnabled()) {
      throw new ServiceUnavailableException('SMS-вхід вимкнено (SMS_ENABLED)');
    }
    const user = await this.sms.findUserByPhone(phone);
    if (!user || user.status !== UserStatus.active) {
      // Do not reveal whether phone exists
      return { ok: true, message: 'Якщо номер зареєстровано, код надіслано' };
    }
    await this.sms.sendOtp(phone, 'login');
    return { ok: true, message: 'Якщо номер зареєстровано, код надіслано', expiresInSec: 300 };
  }

  async verifySmsLogin(phone: string, code: string, meta: SessionMeta = {}) {
    if (!this.sms.isEnabled()) {
      throw new ServiceUnavailableException('SMS-вхід вимкнено');
    }
    const ok = this.sms.verifyOtp(phone, code, 'login');
    if (!ok) throw new UnauthorizedException('Невірний або прострочений код');

    const user = await this.sms.findUserByPhone(phone);
    if (!user || user.status !== UserStatus.active) {
      throw new UnauthorizedException('Користувача не знайдено');
    }
    const full = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!full) throw new UnauthorizedException('Користувача не знайдено');

    if (full.totpEnabled && this.totpPlain(full.totpSecret)) {
      const tempToken = await this.jwt.signAsync(
        { sub: full.id, purpose: '2fa' },
        { expiresIn: '5m', secret: resolveJwtSecret(this.config) },
      );
      return {
        requires2fa: true as const,
        tempToken,
        user: {
          id: full.id,
          email: full.email,
          firstName: full.firstName,
          lastName: full.lastName,
          role: full.role,
        },
      };
    }

    return this.completeLogin(full, meta);
  }

  /** Used by users admin (password reset, block). */
  async revokeAllSessions(userId: string) {
    await this.prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeFamily(familyId: string, userId: string, reason: string) {
    await this.prisma.authSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
    await this.audit.log({
      userId,
      action: 'auth.refresh_reuse',
      entityType: 'User',
      entityId: userId,
      payload: { familyId, reason },
    });
  }

  /** Public for Identity / SMS providers after external auth succeeds. */
  async completeLogin(
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      role: UserRole;
      status: UserStatus;
      apartmentId: string | null;
      tenantId?: string | null;
    },
    meta: SessionMeta = {},
  ) {
    const familyId = randomUUID();
    const tenantId =
      user.tenantId !== undefined
        ? user.tenantId
        : (
            await this.prisma.user.findUnique({
              where: { id: user.id },
              select: { tenantId: true },
            })
          )?.tenantId ?? null;
    const tokens = await this.issueSessionTokens(
      user.id,
      user.email,
      user.role,
      familyId,
      meta,
      tenantId,
    );
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
      payload: { role: user.role, tenantId },
    });

    const tenant = tenantId
      ? await this.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { id: true, name: true, slug: true, orgType: true },
        })
      : null;

    return {
      requires2fa: false as const,
      user: this.publicUser({ ...user, tenantId }, tenant),
      ...tokens,
    };
  }

  private publicUser(
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      role: UserRole;
      status: UserStatus;
      apartmentId: string | null;
      tenantId?: string | null;
    },
    tenant?: { id: string; name: string; slug: string; orgType: string } | null,
  ) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
      apartmentId: user.apartmentId,
      tenantId: user.tenantId ?? null,
      tenant: tenant
        ? {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            orgType: tenant.orgType,
          }
        : null,
    };
  }

  private async issueSessionTokens(
    userId: string,
    email: string,
    role: UserRole,
    familyId: string,
    meta: SessionMeta,
    tenantId?: string | null,
  ) {
    let tid = tenantId;
    if (tid === undefined) {
      tid =
        (
          await this.prisma.user.findUnique({
            where: { id: userId },
            select: { tenantId: true },
          })
        )?.tenantId ?? null;
    }
    const sessionId = randomUUID();
    const accessToken = await this.jwt.signAsync({
      sub: userId,
      email,
      role,
      typ: 'access',
      sid: sessionId,
      tenantId: tid ?? null,
    });
    const refreshToken = await this.jwt.signAsync(
      {
        sub: userId,
        email,
        role,
        sid: sessionId,
        fam: familyId,
        typ: 'refresh',
        tenantId: tid ?? null,
      },
      {
        expiresIn: this.config.get('JWT_REFRESH_EXPIRES', '7d'),
      },
    );

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.prisma.authSession.create({
      data: {
        id: sessionId,
        userId,
        familyId,
        refreshTokenHash,
        userAgent: meta.userAgent?.slice(0, 512),
        ip: meta.ip?.slice(0, 64),
      },
    });

    return { accessToken, refreshToken };
  }

  private async auditLoginFailure(email: string, reason: string, userId?: string) {
    try {
      await this.audit.log({
        userId: userId ?? null,
        action: 'auth.login_failed',
        entityType: 'User',
        entityId: userId ?? email,
        payload: { email, reason },
      });
    } catch {
      // never block login path on audit failure
    }
  }
}
