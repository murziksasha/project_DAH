import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
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

    const tokens = await this.issueTokens(user.id, user.email, user.role);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: tokens.refreshToken },
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

  async approveUser(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.active },
      select: { id: true, email: true, status: true },
    });
  }

  async getPendingUsers() {
    return this.prisma.user.findMany({
      where: { status: UserStatus.pending },
      include: { apartment: true },
      orderBy: { createdAt: 'desc' },
    });
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