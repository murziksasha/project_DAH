import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FundType, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  DeferredSetupRole,
  mergeBuildingSettings,
  parseBuildingSettings,
} from '../building/building-settings';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SetupApartmentsDto } from './dto/setup-apartment.dto';
import { SetupBankDto } from './dto/setup-bank.dto';
import { SetupBuildingDto } from './dto/setup-building.dto';
import { SetupUsersDto } from './dto/setup-users.dto';

const REQUIRED_SETUP_ROLES = [UserRole.chairman, UserRole.accountant, UserRole.auditor] as const;
const SETUP_COMPLETE_MIN_ROLES = [UserRole.chairman] as const;
const DEFERRABLE_SETUP_ROLES: DeferredSetupRole[] = ['accountant', 'auditor'];

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
        address: true,
        edrpou: true,
        isInitialized: true,
        settings: true,
        _count: { select: { apartments: true, funds: true } },
      },
    });

    const deferredSetupRoles = (parseBuildingSettings(building?.settings).deferredSetupRoles ?? []).filter(
      (r): r is DeferredSetupRole => DEFERRABLE_SETUP_ROLES.includes(r),
    );

    const bankAccount = building
      ? await this.prisma.bankAccount.findFirst({
          where: { buildingId: building.id },
          select: { bankName: true, iban: true, description: true },
        })
      : null;

    const existingSetupUsers = await this.prisma.user.findMany({
      where: {
        role: { in: [...REQUIRED_SETUP_ROLES] },
        status: UserStatus.active,
      },
      select: { email: true, firstName: true, lastName: true, role: true },
    });

    const userByRole = (role: UserRole) =>
      existingSetupUsers.find((u) => u.role === role) ?? null;

    const hasRole = (role: UserRole) => userByRole(role) !== null;

    const hasBuilding = !!building;
    const fundCount = building?._count.funds ?? 0;
    const apartmentCount = building?._count.apartments ?? 0;
    const hasChairman = hasRole(UserRole.chairman);
    const hasAccountant = hasRole(UserRole.accountant);
    const hasAuditor = hasRole(UserRole.auditor);

    const roleResolved = (role: DeferredSetupRole) =>
      (role === 'accountant' ? hasAccountant : hasAuditor) || deferredSetupRoles.includes(role);

    const stepDone = {
      building: hasBuilding,
      bank: fundCount > 0,
      apartments: apartmentCount > 0,
      users: hasChairman && roleResolved('accountant') && roleResolved('auditor'),
    };

    const pendingDeferredRoles = deferredSetupRoles.filter((role) =>
      role === 'accountant' ? !hasAccountant : !hasAuditor,
    );

    let nextStep = 4;
    if (!stepDone.building) nextStep = 0;
    else if (!stepDone.bank) nextStep = 1;
    else if (!stepDone.apartments) nextStep = 2;
    else if (!stepDone.users) nextStep = 3;

    return {
      hasBuilding,
      isInitialized: building?.isInitialized ?? false,
      buildingName: building?.name ?? null,
      apartmentCount,
      fundCount,
      hasChairman,
      hasAccountant,
      hasAuditor,
      canComplete:
        hasBuilding &&
        !building!.isInitialized &&
        apartmentCount > 0 &&
        fundCount > 0 &&
        stepDone.users,
      deferredSetupRoles,
      pendingDeferredRoles,
      nextStep,
      stepDone,
      building: building
        ? { name: building.name, address: building.address, edrpou: building.edrpou }
        : null,
      bankAccount,
      existingUsers: {
        chairman: userByRole(UserRole.chairman),
        accountant: userByRole(UserRole.accountant),
        auditor: userByRole(UserRole.auditor),
      },
    };
  }

  private async requireUninitializedBuilding() {
    const building = await this.prisma.building.findFirst();
    if (building?.isInitialized) {
      throw new BadRequestException('Організацію / будинок уже налаштовано');
    }
    return building;
  }

  async upsertBuilding(dto: SetupBuildingDto, actorId: string) {
    await this.requireUninitializedBuilding();
    const existing = await this.prisma.building.findFirst();

    let tenantId = existing?.tenantId;
    if (!tenantId) {
      const tenant =
        (await this.prisma.tenant.findFirst({ orderBy: { createdAt: 'asc' } })) ??
        (await this.prisma.tenant.create({
          data: { name: dto.name, slug: 'default' },
        }));
      tenantId = tenant.id;
    }

    const building = existing
      ? await this.prisma.building.update({
          where: { id: existing.id },
          data: { name: dto.name, address: dto.address, edrpou: dto.edrpou },
        })
      : await this.prisma.building.create({
          data: {
            tenantId,
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
    if (!building) throw new BadRequestException('Спочатку створіть дані організації / будинку');

    const existingFunds = await this.prisma.fund.findMany({
      where: { buildingId: building.id },
      include: { bankAccount: true },
    });
    if (existingFunds.length > 0) {
      const bankAccount = existingFunds[0].bankAccount;
      return {
        skipped: true,
        bankAccount,
        funds: existingFunds,
      };
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

    return { skipped: false, bankAccount, funds };
  }

  async setupApartments(dto: SetupApartmentsDto, actorId: string) {
    const building = await this.requireUninitializedBuilding();
    if (!building) throw new BadRequestException('Спочатку створіть дані організації / будинку');
    if (!dto.apartments.length) throw new BadRequestException('Додайте хоча б одну квартиру');

    const existingCount = await this.prisma.apartment.count({ where: { buildingId: building.id } });
    if (existingCount > 0) {
      throw new BadRequestException('Квартири вже додано');
    }

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
    const building = await this.requireUninitializedBuilding();
    if (!building) throw new BadRequestException('Спочатку створіть дані організації / будинку');

    const singleSeatRoles: UserRole[] = [UserRole.chairman, UserRole.accountant, UserRole.auditor];

    const existingByRole = await this.prisma.user.findMany({
      where: {
        role: { in: [...REQUIRED_SETUP_ROLES] },
        status: UserStatus.active,
      },
      select: { id: true, email: true, role: true, firstName: true, lastName: true },
    });

    const hasRole = (role: UserRole) => existingByRole.some((u) => u.role === role);

    const deferRoles = new Set<DeferredSetupRole>(
      (dto.deferRoles ?? []).filter((r) => DEFERRABLE_SETUP_ROLES.includes(r)),
    );
    for (const role of DEFERRABLE_SETUP_ROLES) {
      if (hasRole(role === 'accountant' ? UserRole.accountant : UserRole.auditor)) {
        deferRoles.delete(role);
      }
    }

    const settingsPatch = mergeBuildingSettings(building.settings, {
      deferredSetupRoles: deferRoles.size > 0 ? [...deferRoles] : undefined,
    });
    await this.prisma.building.update({
      where: { id: building.id },
      data: { settings: settingsPatch as object },
    });

    const rolesToCreate = [
      ...SETUP_COMPLETE_MIN_ROLES,
      ...DEFERRABLE_SETUP_ROLES.map((r) =>
        r === 'accountant' ? UserRole.accountant : UserRole.auditor,
      ),
    ].filter((role) => {
      if (hasRole(role)) return false;
      if (role === UserRole.accountant && deferRoles.has('accountant')) return false;
      if (role === UserRole.auditor && deferRoles.has('auditor')) return false;
      return true;
    });

    if (rolesToCreate.length === 0) {
      const users = await this.prisma.user.findMany({
        where: {
          role: { in: [...REQUIRED_SETUP_ROLES] },
          status: UserStatus.active,
        },
        select: { id: true, email: true, role: true, firstName: true, lastName: true },
      });
      return { skipped: true, users, deferredSetupRoles: [...deferRoles] };
    }

    const dtoRoles = dto.users.map((u) => u.role);
    for (const required of rolesToCreate) {
      if (!dtoRoles.includes(required)) {
        throw new BadRequestException(`Обов'язкова роль: ${required}`);
      }
    }

    const created = [];
    for (const item of dto.users) {
      if (singleSeatRoles.includes(item.role) && hasRole(item.role)) {
        continue;
      }

      const existing = await this.prisma.user.findUnique({ where: { email: item.email } });
      if (existing) throw new BadRequestException(`Email вже зареєстрований: ${item.email}`);

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
      if (singleSeatRoles.includes(item.role)) {
        existingByRole.push(user);
      }
    }

    await this.audit.log({
      userId: actorId,
      action: 'setup.users',
      entityType: 'User',
      entityId: actorId,
      payload: { count: created.length, roles: created.map((u) => u.role) },
    });

    const users = await this.prisma.user.findMany({
      where: {
        role: { in: [...REQUIRED_SETUP_ROLES] },
        status: UserStatus.active,
      },
      select: { id: true, email: true, role: true, firstName: true, lastName: true },
    });

    return { skipped: created.length === 0, users, deferredSetupRoles: [...deferRoles] };
  }

  async complete(actorId: string) {
    const building = await this.prisma.building.findFirst();
    if (!building) throw new NotFoundException('Будинок / організацію не знайдено');
    if (building.isInitialized) throw new BadRequestException('Організацію / будинок уже налаштовано');

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