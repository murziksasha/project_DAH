import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FundType, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SetupApartmentsDto } from './dto/setup-apartment.dto';
import { SetupBankDto } from './dto/setup-bank.dto';
import { SetupBuildingDto } from './dto/setup-building.dto';
import { SetupUsersDto } from './dto/setup-users.dto';

const REQUIRED_SETUP_ROLES = [UserRole.chairman, UserRole.accountant, UserRole.auditor] as const;

@Injectable()
export class SetupService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async getStatus() {
    const building = await this.prisma.building.findFirst({
      select: {
        id: true,
        name: true,
        isInitialized: true,
        _count: { select: { apartments: true, funds: true } },
      },
    });

    const roleCounts = await this.prisma.user.groupBy({
      by: ['role'],
      _count: true,
      where: {
        role: { in: [...REQUIRED_SETUP_ROLES, UserRole.board] },
        status: UserStatus.active,
      },
    });

    const hasRole = (role: UserRole) =>
      roleCounts.some((r) => r.role === role && r._count > 0);

    return {
      hasBuilding: !!building,
      isInitialized: building?.isInitialized ?? false,
      buildingName: building?.name ?? null,
      apartmentCount: building?._count.apartments ?? 0,
      fundCount: building?._count.funds ?? 0,
      hasChairman: hasRole(UserRole.chairman),
      hasAccountant: hasRole(UserRole.accountant),
      hasAuditor: hasRole(UserRole.auditor),
      canComplete:
        !!building &&
        !building.isInitialized &&
        building._count.apartments > 0 &&
        building._count.funds > 0 &&
        hasRole(UserRole.chairman) &&
        hasRole(UserRole.accountant) &&
        hasRole(UserRole.auditor),
    };
  }

  private async requireUninitializedBuilding() {
    const building = await this.prisma.building.findFirst();
    if (building?.isInitialized) {
      throw new BadRequestException('ОСМД вже налаштовано');
    }
    return building;
  }

  async upsertBuilding(dto: SetupBuildingDto, actorId: string) {
    await this.requireUninitializedBuilding();
    const existing = await this.prisma.building.findFirst();

    const building = existing
      ? await this.prisma.building.update({
          where: { id: existing.id },
          data: { name: dto.name, address: dto.address, edrpou: dto.edrpou },
        })
      : await this.prisma.building.create({
          data: {
            name: dto.name,
            address: dto.address,
            edrpou: dto.edrpou,
            isInitialized: false,
            settings: {},
          },
        });

    await this.audit.log({
      userId: actorId,
      action: 'setup.building',
      entityType: 'Building',
      entityId: building.id,
      payload: { name: building.name },
    });

    return building;
  }

  async setupBank(dto: SetupBankDto, actorId: string) {
    const building = await this.requireUninitializedBuilding();
    if (!building) throw new BadRequestException('Спочатку створіть дані ОСМД');

    const existingFunds = await this.prisma.fund.count({ where: { buildingId: building.id } });
    if (existingFunds > 0) {
      throw new BadRequestException('Банківські реквізити вже налаштовано');
    }

    const bankAccount = await this.prisma.bankAccount.create({
      data: {
        buildingId: building.id,
        bankName: dto.bankName,
        iban: dto.iban,
        description: dto.description,
      },
    });

    const funds = await Promise.all(
      dto.funds.map((fund) =>
        this.prisma.fund.create({
          data: {
            buildingId: building.id,
            bankAccountId: bankAccount.id,
            type: fund.type as FundType,
            name: fund.name,
            openingBalance: fund.openingBalance ?? 0,
          },
        }),
      ),
    );

    await this.audit.log({
      userId: actorId,
      action: 'setup.bank',
      entityType: 'Building',
      entityId: building.id,
      payload: { iban: dto.iban, fundCount: funds.length },
    });

    return { bankAccount, funds };
  }

  async setupApartments(dto: SetupApartmentsDto, actorId: string) {
    const building = await this.requireUninitializedBuilding();
    if (!building) throw new BadRequestException('Спочатку створіть дані ОСМД');
    if (!dto.apartments.length) throw new BadRequestException('Додайте хоча б одну квартиру');

    const created = await this.prisma.$transaction(
      dto.apartments.map((apt) =>
        this.prisma.apartment.create({
          data: {
            buildingId: building.id,
            number: apt.number,
            entrance: apt.entrance ?? 1,
            floor: apt.floor,
            area: apt.area,
          },
        }),
      ),
    );

    await this.audit.log({
      userId: actorId,
      action: 'setup.apartments',
      entityType: 'Building',
      entityId: building.id,
      payload: { count: created.length },
    });

    return { count: created.length, apartments: created };
  }

  async setupUsers(dto: SetupUsersDto, actorId: string) {
    await this.requireUninitializedBuilding();

    const roles = dto.users.map((u) => u.role);
    for (const required of REQUIRED_SETUP_ROLES) {
      if (!roles.includes(required)) {
        throw new BadRequestException(`Обов'язкова роль: ${required}`);
      }
    }

    const created = [];
    for (const item of dto.users) {
      const existing = await this.prisma.user.findUnique({ where: { email: item.email } });
      if (existing) throw new BadRequestException(`Email вже зареєстрований: ${item.email}`);

      const activeSameRole = await this.prisma.user.findFirst({
        where: { role: item.role, status: UserStatus.active },
      });
      const singleSeatRoles: UserRole[] = [UserRole.chairman, UserRole.accountant, UserRole.auditor];
      if (activeSameRole && singleSeatRoles.includes(item.role)) {
        throw new BadRequestException(`Активний користувач з роллю ${item.role} вже існує`);
      }

      const passwordHash = await bcrypt.hash(item.password, 10);
      const user = await this.prisma.user.create({
        data: {
          email: item.email,
          passwordHash,
          firstName: item.firstName,
          lastName: item.lastName,
          phone: item.phone,
          role: item.role,
          status: UserStatus.active,
        },
        select: { id: true, email: true, role: true, firstName: true, lastName: true },
      });
      created.push(user);
    }

    await this.audit.log({
      userId: actorId,
      action: 'setup.users',
      entityType: 'User',
      entityId: actorId,
      payload: { count: created.length, roles: roles },
    });

    return created;
  }

  async complete(actorId: string) {
    const building = await this.prisma.building.findFirst();
    if (!building) throw new NotFoundException('ОСМД не знайдено');
    if (building.isInitialized) throw new BadRequestException('ОСМД вже налаштовано');

    const status = await this.getStatus();
    if (!status.canComplete) {
      throw new BadRequestException('Завершіть усі кроки налаштування перед підтвердженням');
    }

    const updated = await this.prisma.building.update({
      where: { id: building.id },
      data: { isInitialized: true },
      select: { id: true, name: true, isInitialized: true },
    });

    await this.audit.log({
      userId: actorId,
      action: 'setup.complete',
      entityType: 'Building',
      entityId: building.id,
      payload: { name: building.name },
    });

    return updated;
  }
}