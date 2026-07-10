import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  DEFAULT_BUILDING_SETTINGS,
  mergeBuildingSettings,
  parseBuildingSettings,
} from './building-settings';
import { CreateApartmentDto } from './dto/create-apartment.dto';
import { CreateResidentDto } from './dto/create-resident.dto';
import { UpdateApartmentDto } from './dto/update-apartment.dto';
import { UpdateResidentDto } from './dto/update-resident.dto';
import { UpdateBuildingSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class BuildingService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  getBuilding() {
    return this.prisma.building.findFirst({
      include: {
        bankAccounts: { include: { funds: true } },
        funds: true,
      },
    });
  }

  async getSettings() {
    const building = await this.prisma.building.findFirst({
      select: {
        id: true,
        name: true,
        address: true,
        edrpou: true,
        showDebtorsToResidents: true,
        isInitialized: true,
        settings: true,
      },
    });
    if (!building) return null;

    const json = parseBuildingSettings(building.settings);
    return {
      id: building.id,
      name: building.name,
      address: building.address,
      edrpou: building.edrpou,
      isInitialized: building.isInitialized,
      showDebtorsToResidents: building.showDebtorsToResidents,
      registrationEnabled: json.registrationEnabled ?? DEFAULT_BUILDING_SETTINGS.registrationEnabled,
      showBankDetailsToResidents:
        json.showBankDetailsToResidents ?? DEFAULT_BUILDING_SETTINGS.showBankDetailsToResidents,
      defaultAccrualDueDays:
        json.defaultAccrualDueDays ?? DEFAULT_BUILDING_SETTINGS.defaultAccrualDueDays,
      locale: json.locale ?? DEFAULT_BUILDING_SETTINGS.locale,
      features: json.features ?? {},
    };
  }

  async updateSettings(dto: UpdateBuildingSettingsDto, userId: string) {
    const building = await this.prisma.building.findFirst();
    if (!building) throw new NotFoundException('Будинок не налаштовано');

    const settingsPatch = {
      ...(dto.registrationEnabled !== undefined
        ? { registrationEnabled: dto.registrationEnabled }
        : {}),
      ...(dto.showBankDetailsToResidents !== undefined
        ? { showBankDetailsToResidents: dto.showBankDetailsToResidents }
        : {}),
      ...(dto.defaultAccrualDueDays !== undefined
        ? { defaultAccrualDueDays: dto.defaultAccrualDueDays }
        : {}),
      ...(dto.locale !== undefined ? { locale: dto.locale } : {}),
    };

    const updated = await this.prisma.building.update({
      where: { id: building.id },
      data: {
        ...(dto.showDebtorsToResidents !== undefined
          ? { showDebtorsToResidents: dto.showDebtorsToResidents }
          : {}),
        ...(Object.keys(settingsPatch).length
          ? { settings: mergeBuildingSettings(building.settings, settingsPatch) as Prisma.InputJsonValue }
          : {}),
      },
      select: {
        id: true,
        name: true,
        showDebtorsToResidents: true,
        settings: true,
      },
    });

    await this.audit.log({
      userId,
      action: 'building.settings_updated',
      entityType: 'Building',
      entityId: building.id,
      payload: { changes: { ...dto } },
    });

    const json = parseBuildingSettings(updated.settings);
    return {
      id: updated.id,
      name: updated.name,
      showDebtorsToResidents: updated.showDebtorsToResidents,
      registrationEnabled: json.registrationEnabled ?? DEFAULT_BUILDING_SETTINGS.registrationEnabled,
      showBankDetailsToResidents:
        json.showBankDetailsToResidents ?? DEFAULT_BUILDING_SETTINGS.showBankDetailsToResidents,
      defaultAccrualDueDays:
        json.defaultAccrualDueDays ?? DEFAULT_BUILDING_SETTINGS.defaultAccrualDueDays,
      locale: json.locale ?? DEFAULT_BUILDING_SETTINGS.locale,
    };
  }

  async listApartments() {
    const apartments = await this.prisma.apartment.findMany({
      orderBy: [{ entrance: 'asc' }, { number: 'asc' }],
      include: {
        residents: true,
        apartmentLinks: {
          include: {
            user: {
              select: { id: true, email: true, firstName: true, lastName: true, status: true },
            },
          },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });
    return apartments.map((a) => ({
      ...a,
      users: a.apartmentLinks.map((l) => ({
        ...l.user,
        isPrimary: l.isPrimary,
      })),
    }));
  }

  getApartment(id: string) {
    return this.prisma.apartment.findUnique({
      where: { id },
      include: {
        residents: true,
        accrualLines: {
          include: { accrual: true, allocations: true },
          orderBy: { createdAt: 'desc' },
        },
        payments: { orderBy: { date: 'desc' } },
      },
    });
  }

  async createApartment(dto: CreateApartmentDto, userId: string) {
    const building = await this.prisma.building.findFirst();
    if (!building) throw new NotFoundException('Будинок не налаштовано');

    const apartment = await this.prisma.apartment.create({
      data: {
        buildingId: building.id,
        number: dto.number,
        entrance: dto.entrance ?? 1,
        floor: dto.floor,
        area: dto.area,
      },
    });

    await this.audit.log({
      userId,
      action: 'building.apartment_create',
      entityType: 'Apartment',
      entityId: apartment.id,
      payload: { number: apartment.number },
    });

    return apartment;
  }

  async updateApartment(id: string, dto: UpdateApartmentDto, userId: string) {
    const existing = await this.prisma.apartment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Квартиру не знайдено');

    const apartment = await this.prisma.apartment.update({
      where: { id },
      data: {
        ...(dto.number !== undefined ? { number: dto.number } : {}),
        ...(dto.entrance !== undefined ? { entrance: dto.entrance } : {}),
        ...(dto.floor !== undefined ? { floor: dto.floor } : {}),
        ...(dto.area !== undefined ? { area: dto.area } : {}),
      },
    });

    await this.audit.log({
      userId,
      action: 'building.apartment_update',
      entityType: 'Apartment',
      entityId: id,
      payload: { changes: { ...dto } },
    });

    return apartment;
  }

  async deleteApartment(id: string, userId: string) {
    const existing = await this.prisma.apartment.findUnique({
      where: { id },
      include: { apartmentLinks: true, payments: true, accrualLines: true },
    });
    if (!existing) throw new NotFoundException('Квартиру не знайдено');
    if (existing.apartmentLinks.length || existing.payments.length || existing.accrualLines.length) {
      throw new BadRequestException('Неможливо видалити квартиру з пов\'язаними даними');
    }

    await this.prisma.apartment.delete({ where: { id } });

    await this.audit.log({
      userId,
      action: 'building.apartment_delete',
      entityType: 'Apartment',
      entityId: id,
      payload: { number: existing.number },
    });

    return { deleted: true };
  }

  async createResident(apartmentId: string, dto: CreateResidentDto, userId: string) {
    const apartment = await this.prisma.apartment.findUnique({ where: { id: apartmentId } });
    if (!apartment) throw new NotFoundException('Квартиру не знайдено');

    const resident = await this.prisma.resident.create({
      data: {
        apartmentId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        email: dto.email,
        isOwner: dto.isOwner ?? true,
      },
    });

    await this.audit.log({
      userId,
      action: 'building.resident_create',
      entityType: 'Resident',
      entityId: resident.id,
      payload: { apartmentId, name: `${resident.firstName} ${resident.lastName}` },
    });

    return resident;
  }

  async updateResident(id: string, dto: UpdateResidentDto, userId: string) {
    const existing = await this.prisma.resident.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Мешканця не знайдено');

    const resident = await this.prisma.resident.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.isOwner !== undefined ? { isOwner: dto.isOwner } : {}),
      },
    });

    await this.audit.log({
      userId,
      action: 'building.resident_update',
      entityType: 'Resident',
      entityId: id,
      payload: { changes: { ...dto } },
    });

    return resident;
  }

  async deleteResident(id: string, userId: string) {
    const existing = await this.prisma.resident.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Мешканця не знайдено');

    await this.prisma.resident.delete({ where: { id } });

    await this.audit.log({
      userId,
      action: 'building.resident_delete',
      entityType: 'Resident',
      entityId: id,
      payload: { apartmentId: existing.apartmentId },
    });

    return { deleted: true };
  }
}