import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const ADMIN_CREATABLE_ROLES: UserRole[] = [
  UserRole.chairman,
  UserRole.accountant,
  UserRole.board,
  UserRole.auditor,
];

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  listUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
        apartmentId: true,
        createdAt: true,
        apartment: { select: { number: true, entrance: true } },
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async createUser(dto: CreateUserDto, actorId: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('Email вже зареєстрований');

    if (!ADMIN_CREATABLE_ROLES.includes(dto.role)) {
      throw new BadRequestException('Недозволена роль для створення');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: dto.role,
        status: UserStatus.active,
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

    await this.audit.log({
      userId: actorId,
      action: 'users.create',
      entityType: 'User',
      entityId: user.id,
      payload: { email: user.email, role: user.role },
    });

    return user;
  }

  async updateUser(id: string, dto: UpdateUserDto, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Користувача не знайдено');

    if (user.role === UserRole.super_admin) {
      throw new BadRequestException('Неможливо змінити супер-адміністратора');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
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

    await this.audit.log({
      userId: actorId,
      action: 'users.update',
      entityType: 'User',
      entityId: id,
      payload: {
        changes: { ...(dto.role !== undefined ? { role: dto.role } : {}), ...(dto.status !== undefined ? { status: dto.status } : {}) },
        previous: { role: user.role, status: user.status },
      },
    });

    return updated;
  }

  async blockUser(id: string, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Користувача не знайдено');

    if (user.role === UserRole.super_admin) {
      throw new BadRequestException('Неможливо заблокувати супер-адміністратора');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.blocked },
      select: { id: true, email: true, status: true },
    });

    await this.audit.log({
      userId: actorId,
      action: 'users.block',
      entityType: 'User',
      entityId: id,
      payload: { email: user.email },
    });

    return updated;
  }
}