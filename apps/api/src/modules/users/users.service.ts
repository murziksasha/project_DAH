import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { clearDeferredSetupRole, parseBuildingSettings } from '../building/building-settings';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users.query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  addUserApartmentLink,
  removeUserApartmentLink,
  syncUserApartments,
} from './user-apartments.util';

const ADMIN_CREATABLE_ROLES: UserRole[] = [
  UserRole.chairman,
  UserRole.accountant,
  UserRole.board,
  UserRole.auditor,
];

const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  status: true,
  apartmentId: true,
  createdAt: true,
  apartmentLinks: {
    select: {
      isPrimary: true,
      apartment: { select: { id: true, number: true, entrance: true } },
    },
    orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }],
  },
} satisfies Prisma.UserSelect;

function mapUserRow(user: Prisma.UserGetPayload<{ select: typeof USER_SELECT }>) {
  const apartments = user.apartmentLinks.map((l) => ({
    id: l.apartment.id,
    number: l.apartment.number,
    entrance: l.apartment.entrance,
    isPrimary: l.isPrimary,
  }));
  const primary = apartments.find((a) => a.isPrimary) ?? apartments[0] ?? null;
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role,
    status: user.status,
    apartmentId: user.apartmentId,
    createdAt: user.createdAt,
    apartments,
    apartment: primary
      ? { id: primary.id, number: primary.number, entrance: primary.entrance }
      : null,
  };
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async listUsers(query: ListUsersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();

    const where: Prisma.UserWhereInput = search
      ? {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: [{ role: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: users.map(mapUserRow),
      total,
      page,
      limit,
    };
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

    if (dto.role === UserRole.accountant || dto.role === UserRole.auditor) {
      const building = await this.prisma.building.findFirst({ select: { id: true, settings: true } });
      if (building) {
        const nextSettings = clearDeferredSetupRole(
          building.settings,
          dto.role === UserRole.accountant ? 'accountant' : 'auditor',
        );
        if (JSON.stringify(nextSettings) !== JSON.stringify(parseBuildingSettings(building.settings))) {
          await this.prisma.building.update({
            where: { id: building.id },
            data: { settings: nextSettings as object },
          });
        }
      }
    }

    return user;
  }

  async updateUser(id: string, dto: UpdateUserDto, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Користувача не знайдено');

    if (user.role === UserRole.super_admin) {
      throw new BadRequestException('Неможливо змінити супер-адміністратора');
    }

    if (dto.email && dto.email !== user.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existing) throw new BadRequestException('Email вже зареєстрований');
    }

    const nextRole = dto.role ?? user.role;
    if (dto.role && !ADMIN_CREATABLE_ROLES.includes(dto.role) && dto.role !== UserRole.resident) {
      throw new BadRequestException('Недозволена роль');
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.phone !== undefined) data.phone = dto.phone || null;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.role !== undefined) data.role = dto.role;

    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
      data.refreshToken = null;
    } else if (dto.email !== undefined && dto.email !== user.email) {
      data.refreshToken = null;
    }

    if (dto.role !== undefined && dto.role !== UserRole.resident && user.role === UserRole.resident) {
      await syncUserApartments(this.prisma, id, []);
    }

    if (nextRole !== UserRole.resident && (dto.apartmentIds !== undefined || dto.primaryApartmentId !== undefined)) {
      throw new BadRequestException('Квартири можна прив\'язувати лише до мешканців');
    }

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) {
        await tx.user.update({ where: { id }, data });
      }

      if (dto.apartmentIds !== undefined && nextRole === UserRole.resident) {
        await syncUserApartments(tx, id, dto.apartmentIds, dto.primaryApartmentId);
      } else if (dto.primaryApartmentId !== undefined && nextRole === UserRole.resident) {
        const currentIds = (
          await tx.userApartment.findMany({ where: { userId: id }, select: { apartmentId: true } })
        ).map((l) => l.apartmentId);
        await syncUserApartments(tx, id, currentIds, dto.primaryApartmentId);
      }
    });

    const updated = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });
    if (!updated) throw new NotFoundException('Користувача не знайдено');

    await this.audit.log({
      userId: actorId,
      action: 'users.update',
      entityType: 'User',
      entityId: id,
      payload: {
        changes: {
          ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
          ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.email !== undefined ? { email: dto.email } : {}),
          ...(dto.role !== undefined ? { role: dto.role } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.apartmentIds !== undefined ? { apartmentIds: dto.apartmentIds } : {}),
          ...(dto.primaryApartmentId !== undefined ? { primaryApartmentId: dto.primaryApartmentId } : {}),
          ...(dto.password ? { passwordChanged: true } : {}),
        },
        previous: {
          role: user.role,
          status: user.status,
          email: user.email,
        },
      },
    });

    return mapUserRow(updated);
  }

  async blockUser(id: string, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Користувача не знайдено');

    if (user.role === UserRole.super_admin) {
      throw new BadRequestException('Неможливо заблокувати супер-адміністратора');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.blocked, refreshToken: null },
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

  async linkApartment(userId: string, apartmentId: string, actorId: string, setPrimary = false) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Користувача не знайдено');
    if (user.role !== UserRole.resident) {
      throw new BadRequestException('Квартири можна прив\'язувати лише до мешканців');
    }

    await addUserApartmentLink(this.prisma, userId, apartmentId, setPrimary);

    await this.audit.log({
      userId: actorId,
      action: 'users.apartment_link',
      entityType: 'User',
      entityId: userId,
      payload: { apartmentId, setPrimary },
    });

    const updated = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_SELECT,
    });
    return updated ? mapUserRow(updated) : null;
  }

  async unlinkApartment(userId: string, apartmentId: string, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Користувача не знайдено');

    await removeUserApartmentLink(this.prisma, userId, apartmentId);

    await this.audit.log({
      userId: actorId,
      action: 'users.apartment_unlink',
      entityType: 'User',
      entityId: userId,
      payload: { apartmentId },
    });

    const updated = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_SELECT,
    });
    return updated ? mapUserRow(updated) : null;
  }
}