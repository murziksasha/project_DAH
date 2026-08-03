import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  normalizeDocumentTemplatesConfig,
  type DocumentTemplatesConfig,
} from '@dah/shared';
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
import { UpdateDocumentTemplatesDto } from './dto/update-document-templates.dto';

@Injectable()
export class BuildingService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  getBuilding(buildingId?: string, tenantId?: string | null) {
    if (buildingId) {
      return this.prisma.building.findFirst({
        where: {
          id: buildingId,
          ...(tenantId ? { tenantId } : {}),
        },
        include: {
          bankAccounts: { include: { funds: true } },
          funds: true,
          _count: { select: { apartments: true } },
        },
      });
    }
    return this.prisma.building.findFirst({
      where: tenantId ? { tenantId } : undefined,
      include: {
        bankAccounts: { include: { funds: true } },
        funds: true,
        _count: { select: { apartments: true } },
      },
    });
  }

  /** Multi-building: list all buildings of this OSBB (tenant). */
  listBuildings(tenantId?: string | null) {
    return this.prisma.building.findMany({
      where: tenantId ? { tenantId } : undefined,
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { apartments: true, funds: true } },
      },
    });
  }

  async createBuilding(
    dto: { name: string; address: string; edrpou?: string | null; tenantId?: string },
    userId: string,
    userTenantId?: string | null,
  ) {
    let tenantId = dto.tenantId ?? userTenantId ?? null;
    if (!tenantId) {
      const def = await this.prisma.tenant.findFirst({ orderBy: { createdAt: 'asc' } });
      tenantId = def?.id ?? null;
    }
    if (!tenantId) throw new BadRequestException('Немає tenant — створіть ОСББ (tenant)');

    const created = await this.prisma.building.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        address: dto.address.trim(),
        edrpou: dto.edrpou?.trim() || null,
        isInitialized: true,
      },
    });
    await this.audit.log({
      userId,
      action: 'building.created',
      entityType: 'Building',
      entityId: created.id,
      payload: { name: created.name },
    });
    return created;
  }

  /** Lightweight counters for admin dashboard. */
  async getOpsSummary(buildingId?: string) {
    const aptScope = buildingId ? { apartment: { buildingId } } : {};
    const [pendingResidents, openRequests, activePolls, debtorsLines, documents] =
      await Promise.all([
        this.prisma.user.count({ where: { status: 'pending', role: 'resident' } }),
        this.prisma.request.count({ where: { status: { in: ['new', 'in_progress'] } } }),
        this.prisma.poll.count({ where: { isActive: true } }),
        this.prisma.accrualLine.count({
          where: {
            status: { in: ['open', 'partially_paid', 'overdue'] },
            ...aptScope,
          },
        }),
        this.prisma.document.count(),
      ]);

    return {
      pendingResidents,
      openRequests,
      activePolls,
      openAccrualLines: debtorsLines,
      documents,
      buildingId: buildingId ?? null,
    };
  }

  async updateBuildingProfile(
    dto: { name?: string; address?: string; edrpou?: string | null },
    userId: string,
  ) {
    const building = await this.prisma.building.findFirst();
    if (!building) throw new NotFoundException('Будинок не налаштовано');

    const updated = await this.prisma.building.update({
      where: { id: building.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.address !== undefined ? { address: dto.address.trim() } : {}),
        ...(dto.edrpou !== undefined
          ? { edrpou: dto.edrpou?.trim() ? dto.edrpou.trim() : null }
          : {}),
      },
      select: {
        id: true,
        name: true,
        address: true,
        edrpou: true,
      },
    });

    await this.audit.log({
      userId,
      action: 'building.profile_updated',
      entityType: 'Building',
      entityId: building.id,
      payload: { ...dto },
    });

    return updated;
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
      reminderDaysBeforeDue: json.reminderDaysBeforeDue ?? 3,
      locale: json.locale ?? DEFAULT_BUILDING_SETTINGS.locale,
      slaHoursByCategory: json.slaHoursByCategory ?? {},
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
      ...(dto.reminderDaysBeforeDue !== undefined
        ? { reminderDaysBeforeDue: dto.reminderDaysBeforeDue }
        : {}),
      ...(dto.locale !== undefined ? { locale: dto.locale } : {}),
      ...(dto.slaHoursByCategory !== undefined
        ? {
            slaHoursByCategory: {
              ...(parseBuildingSettings(building.settings).slaHoursByCategory ?? {}),
              ...dto.slaHoursByCategory,
            },
          }
        : {}),
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
      payload: { changes: JSON.parse(JSON.stringify(dto)) } as Prisma.InputJsonValue,
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
      reminderDaysBeforeDue: json.reminderDaysBeforeDue ?? 3,
      locale: json.locale ?? DEFAULT_BUILDING_SETTINGS.locale,
      slaHoursByCategory: json.slaHoursByCategory ?? {},
    };
  }

  /**
   * Document constructor: PDF templates (receipts, board reports) + Excel export field profiles.
   * Defaults from @dah/shared when nothing saved yet.
   */
  async getDocumentTemplates(buildingId?: string): Promise<DocumentTemplatesConfig> {
    const building = buildingId
      ? await this.prisma.building.findFirst({
          where: { id: buildingId },
          select: { settings: true },
        })
      : await this.prisma.building.findFirst({ select: { settings: true } });
    const json = parseBuildingSettings(building?.settings);
    return normalizeDocumentTemplatesConfig(json.documentTemplates);
  }

  async updateDocumentTemplates(
    dto: UpdateDocumentTemplatesDto,
    userId: string,
  ): Promise<DocumentTemplatesConfig> {
    const building = await this.prisma.building.findFirst();
    if (!building) throw new NotFoundException('Будинок не налаштовано');

    const normalized = normalizeDocumentTemplatesConfig({
      forms: dto.forms,
      exports: dto.exports,
    });

    await this.prisma.building.update({
      where: { id: building.id },
      data: {
        settings: mergeBuildingSettings(building.settings, {
          documentTemplates: normalized,
        }) as Prisma.InputJsonValue,
      },
    });

    await this.audit.log({
      userId,
      action: 'building.document_templates_updated',
      entityType: 'Building',
      entityId: building.id,
      payload: {
        forms: normalized.forms.length,
        exports: normalized.exports.length,
      },
    });

    return normalized;
  }

  async listApartments(buildingId?: string, tenantId?: string | null) {
    const apartments = await this.prisma.apartment.findMany({
      where: buildingId
        ? { buildingId }
        : tenantId
          ? { building: { tenantId } }
          : undefined,
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

  async createApartment(dto: CreateApartmentDto, userId: string, tenantId?: string | null) {
    const building = dto.buildingId
      ? await this.prisma.building.findFirst({
          where: {
            id: dto.buildingId,
            ...(tenantId ? { tenantId } : {}),
          },
        })
      : await this.prisma.building.findFirst({
          where: tenantId ? { tenantId } : undefined,
        });
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

  /**
   * Bulk import: lines "number,entrance,floor,area" (floor optional).
   * Skips duplicates (same building + number).
   */
  async importApartmentsCsv(csv: string, userId: string) {
    const building = await this.prisma.building.findFirst();
    if (!building) throw new NotFoundException('Будинок не налаштовано');

    const text = csv.replace(/^\uFEFF/, '').trim();
    if (!text) throw new BadRequestException('Порожній CSV');

    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let created = 0;
    let skipped = 0;
    const errors: Array<{ line: number; message: string }> = [];

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      // skip header
      if (i === 0 && /номер|number|кв/i.test(raw) && /площа|area/i.test(raw)) {
        continue;
      }
      const parts = raw.split(/[,;\t]/).map((p) => p.trim().replace(/^"|"$/g, ''));
      if (parts.length < 2) {
        errors.push({ line: i + 1, message: 'Очікується number,entrance,floor?,area' });
        continue;
      }

      const number = parts[0];
      let entrance = 1;
      let floor: number | undefined;
      let area: number;

      if (parts.length === 2) {
        area = Number(parts[1].replace(',', '.'));
      } else if (parts.length === 3) {
        entrance = Number(parts[1]) || 1;
        area = Number(parts[2].replace(',', '.'));
      } else {
        entrance = Number(parts[1]) || 1;
        floor = parts[2] ? Number(parts[2]) : undefined;
        area = Number(parts[3].replace(',', '.'));
      }

      if (!number || !Number.isFinite(area) || area <= 0) {
        errors.push({ line: i + 1, message: 'Некоректний номер або площа' });
        continue;
      }

      try {
        await this.prisma.apartment.create({
          data: {
            buildingId: building.id,
            number,
            entrance,
            floor: Number.isFinite(floor as number) ? floor : undefined,
            area,
          },
        });
        created++;
      } catch {
        skipped++;
      }
    }

    await this.audit.log({
      userId,
      action: 'building.apartments_import',
      entityType: 'Building',
      entityId: building.id,
      payload: { created, skipped, errors: errors.length },
    });

    return { created, skipped, errors };
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
        iban: dto.iban?.replace(/\s+/g, '').toUpperCase() || null,
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
        ...(dto.iban !== undefined
          ? { iban: dto.iban ? dto.iban.replace(/\s+/g, '').toUpperCase() : null }
          : {}),
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