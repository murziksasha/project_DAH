import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  normalizeDocumentTemplatesConfig,
  type DocumentTemplatesConfig,
} from '@dah/shared';
import { Prisma } from '@prisma/client';
import {
  extractEmailsFromResidentsCell,
  parseApartmentsCsv,
} from '../../common/utils/apartment-csv';
import { sortByApartmentNumber } from '../../common/utils/apartment-sort';
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

  /**
   * Portfolio KPIs for УК multi-building: debt, open SLA requests, collection %.
   */
  async getPortfolioSummary(tenantId?: string | null) {
    const buildings = await this.prisma.building.findMany({
      where: tenantId ? { tenantId } : undefined,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        address: true,
        _count: { select: { apartments: true } },
      },
    });

    const items = await Promise.all(
      buildings.map(async (b) => {
        const aptIds = (
          await this.prisma.apartment.findMany({
            where: { buildingId: b.id },
            select: { id: true },
          })
        ).map((a) => a.id);

        const openLines =
          aptIds.length === 0
            ? []
            : await this.prisma.accrualLine.findMany({
                where: {
                  apartmentId: { in: aptIds },
                  status: { in: ['open', 'partially_paid', 'overdue'] },
                },
                select: { amount: true, paidAmount: true },
              });

        let debt = 0;
        let billed = 0;
        let paid = 0;
        for (const l of openLines) {
          const amt = Number(l.amount);
          const p = Number(l.paidAmount);
          billed += amt;
          paid += p;
          debt += Math.max(0, amt - p);
        }

        // Closed/paid lines for collection rate (period-agnostic snapshot)
        const paidLines =
          aptIds.length === 0
            ? []
            : await this.prisma.accrualLine.findMany({
                where: {
                  apartmentId: { in: aptIds },
                  status: 'paid',
                },
                select: { amount: true, paidAmount: true },
                take: 5000,
              });
        for (const l of paidLines) {
          billed += Number(l.amount);
          paid += Number(l.paidAmount);
        }

        const openRequests = await this.prisma.request.count({
          where: {
            status: { in: ['new', 'in_progress'] },
            OR: [{ buildingId: b.id }, { buildingId: null }],
          },
        });
        const overdueRequests = await this.prisma.request.count({
          where: {
            status: { in: ['new', 'in_progress'] },
            dueAt: { lt: new Date() },
            OR: [{ buildingId: b.id }, { buildingId: null }],
          },
        });

        const collectionRate =
          billed > 0 ? Math.round((Math.min(paid, billed) / billed) * 1000) / 10 : 100;

        return {
          buildingId: b.id,
          name: b.name,
          address: b.address,
          apartments: b._count.apartments,
          debt: Math.round(debt * 100) / 100,
          openRequests,
          overdueRequests,
          collectionRate,
        };
      }),
    );

    const totals = items.reduce(
      (acc, i) => {
        acc.debt += i.debt;
        acc.openRequests += i.openRequests;
        acc.overdueRequests += i.overdueRequests;
        acc.apartments += i.apartments;
        return acc;
      },
      { debt: 0, openRequests: 0, overdueRequests: 0, apartments: 0 },
    );

    return {
      buildings: items,
      totals: {
        ...totals,
        debt: Math.round(totals.debt * 100) / 100,
        buildingCount: items.length,
      },
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
      registrationInviteCode: json.registrationInviteCode ?? '',
      expenseDualApprovalThreshold: json.expenseDualApprovalThreshold ?? null,
      showBankDetailsToResidents:
        json.showBankDetailsToResidents ?? DEFAULT_BUILDING_SETTINGS.showBankDetailsToResidents,
      defaultAccrualDueDays:
        json.defaultAccrualDueDays ?? DEFAULT_BUILDING_SETTINGS.defaultAccrualDueDays,
      reminderDaysBeforeDue: json.reminderDaysBeforeDue ?? 3,
      metersReadingDeadlineDay: json.metersReadingDeadlineDay ?? 5,
      locale: json.locale ?? DEFAULT_BUILDING_SETTINGS.locale,
      slaHoursByCategory: json.slaHoursByCategory ?? {},
      features: json.features ?? {},
      journalSot: !!json.finance?.journalSot,
      strictBankRec: !!json.finance?.strictBankRec,
      defaultCashFlowSource: json.finance?.defaultCashFlowSource ?? 'legacy',
      finance: json.finance ?? {},
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
      ...(dto.metersReadingDeadlineDay !== undefined
        ? { metersReadingDeadlineDay: dto.metersReadingDeadlineDay }
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
      ...(dto.registrationInviteCode !== undefined
        ? { registrationInviteCode: dto.registrationInviteCode?.trim() || undefined }
        : {}),
      ...(dto.expenseDualApprovalThreshold !== undefined
        ? { expenseDualApprovalThreshold: dto.expenseDualApprovalThreshold }
        : {}),
      ...((dto.journalSot !== undefined ||
        dto.strictBankRec !== undefined ||
        dto.defaultCashFlowSource !== undefined)
        ? {
            finance: {
              ...(dto.journalSot !== undefined ? { journalSot: dto.journalSot } : {}),
              ...(dto.strictBankRec !== undefined
                ? { strictBankRec: dto.strictBankRec }
                : {}),
              ...(dto.defaultCashFlowSource !== undefined
                ? { defaultCashFlowSource: dto.defaultCashFlowSource }
                : {}),
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
      registrationInviteCode: json.registrationInviteCode ?? '',
      expenseDualApprovalThreshold: json.expenseDualApprovalThreshold ?? null,
      showBankDetailsToResidents:
        json.showBankDetailsToResidents ?? DEFAULT_BUILDING_SETTINGS.showBankDetailsToResidents,
      defaultAccrualDueDays:
        json.defaultAccrualDueDays ?? DEFAULT_BUILDING_SETTINGS.defaultAccrualDueDays,
      reminderDaysBeforeDue: json.reminderDaysBeforeDue ?? 3,
      metersReadingDeadlineDay: json.metersReadingDeadlineDay ?? 5,
      locale: json.locale ?? DEFAULT_BUILDING_SETTINGS.locale,
      slaHoursByCategory: json.slaHoursByCategory ?? {},
      journalSot: !!json.finance?.journalSot,
      strictBankRec: !!json.finance?.strictBankRec,
      defaultCashFlowSource: json.finance?.defaultCashFlowSource ?? 'legacy',
      finance: json.finance ?? {},
    };
  }

  /** Global search: apartments, users, open requests (admin). */
  async globalSearch(q: string, tenantId?: string | null) {
    const term = q.trim();
    if (term.length < 1) {
      return { apartments: [], users: [], requests: [] };
    }
    const buildingWhere = tenantId ? { building: { tenantId } } : {};
    const userWhere = tenantId ? { tenantId } : {};

    const [apartments, users, requests] = await Promise.all([
      this.prisma.apartment.findMany({
        where: {
          ...buildingWhere,
          OR: [
            { number: { contains: term, mode: 'insensitive' } },
            { residents: { some: { lastName: { contains: term, mode: 'insensitive' } } } },
          ],
        },
        take: 20,
        select: {
          id: true,
          number: true,
          entrance: true,
          area: true,
          building: { select: { id: true, name: true } },
        },
        orderBy: { number: 'asc' },
      }),
      this.prisma.user.findMany({
        where: {
          ...userWhere,
          OR: [
            { email: { contains: term, mode: 'insensitive' } },
            { firstName: { contains: term, mode: 'insensitive' } },
            { lastName: { contains: term, mode: 'insensitive' } },
            { phone: { contains: term } },
          ],
        },
        take: 20,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          apartmentId: true,
        },
        orderBy: { lastName: 'asc' },
      }),
      this.prisma.request.findMany({
        where: {
          status: { not: 'done' },
          OR: [
            { title: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } },
            { id: { contains: term } },
          ],
        },
        take: 15,
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          category: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { apartments, users, requests };
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
    // Prisma string order is lexicographic ("1","10","101"); natural sort for UI.
    return sortByApartmentNumber(
      apartments.map((a) => ({
        ...a,
        users: a.apartmentLinks.map((l) => ({
          ...l.user,
          isPrimary: l.isPrimary,
        })),
      })),
    );
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
   * Full replace of the apartment registry from CSV.
   * Columns: number,entrance,floor,area[,residents] (header optional).
   * - Upserts by apartment number (updates area/entrance/floor)
   * - Removes apartments not present in the file (and their finance links)
   * - Re-links users listed in the residents column by email
   */
  async importApartmentsCsv(csv: string, userId: string) {
    const building = await this.prisma.building.findFirst();
    if (!building) throw new NotFoundException('Будинок не налаштовано');

    const { rows, errors } = parseApartmentsCsv(csv);
    if (!rows.length) {
      throw new BadRequestException(
        errors[0]?.message ?? 'CSV не містить жодної коректної квартири',
      );
    }

    const wantedNumbers = new Set(rows.map((r) => r.number));
    let created = 0;
    let updated = 0;
    let removed = 0;
    let linked = 0;

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.apartment.findMany({
        where: { buildingId: building.id },
        select: { id: true, number: true },
      });
      const byNumber = new Map(existing.map((a) => [a.number, a.id]));

      const toRemoveIds = existing
        .filter((a) => !wantedNumbers.has(a.number))
        .map((a) => a.id);

      if (toRemoveIds.length) {
        await this.purgeApartments(tx, toRemoveIds);
        removed = toRemoveIds.length;
      }

      for (const row of rows) {
        const id = byNumber.get(row.number);
        if (id && !toRemoveIds.includes(id)) {
          await tx.apartment.update({
            where: { id },
            data: {
              entrance: row.entrance,
              floor: row.floor ?? null,
              area: row.area,
            },
          });
          updated++;
        } else {
          const createdApt = await tx.apartment.create({
            data: {
              buildingId: building.id,
              number: row.number,
              entrance: row.entrance,
              floor: row.floor,
              area: row.area,
            },
          });
          byNumber.set(row.number, createdApt.id);
          created++;
        }
      }

      // Re-link users from residents column (email match). Clear prior links only for
      // apartments we touch that have explicit residents data.
      for (const row of rows) {
        const emails = extractEmailsFromResidentsCell(row.residentsRaw);
        if (!emails.length) continue;
        const apartmentId = byNumber.get(row.number);
        if (!apartmentId) continue;

        const users = await tx.user.findMany({
          where: { email: { in: emails, mode: 'insensitive' } },
          select: { id: true, apartmentId: true },
        });
        for (const u of users) {
          await tx.userApartment.upsert({
            where: {
              userId_apartmentId: { userId: u.id, apartmentId },
            },
            create: {
              userId: u.id,
              apartmentId,
              isPrimary: !u.apartmentId,
            },
            update: {},
          });
          if (!u.apartmentId) {
            await tx.user.update({
              where: { id: u.id },
              data: { apartmentId },
            });
          }
          linked++;
        }
      }
    });

    await this.audit.log({
      userId,
      action: 'building.apartments_import',
      entityType: 'Building',
      entityId: building.id,
      payload: { created, updated, removed, linked, errors: errors.length, mode: 'replace' },
    });

    // Keep `skipped` for older UI clients (always 0 in replace mode).
    return { created, updated, removed, linked, skipped: 0, errors };
  }

  /** Hard-remove apartments and dependent finance/links (import replace). */
  private async purgeApartments(
    tx: Prisma.TransactionClient,
    apartmentIds: string[],
  ) {
    if (!apartmentIds.length) return;

    const lines = await tx.accrualLine.findMany({
      where: { apartmentId: { in: apartmentIds } },
      select: { id: true },
    });
    const lineIds = lines.map((l) => l.id);
    const payments = await tx.payment.findMany({
      where: { apartmentId: { in: apartmentIds } },
      select: { id: true },
    });
    const paymentIds = payments.map((p) => p.id);

    if (lineIds.length || paymentIds.length) {
      await tx.paymentAllocation.deleteMany({
        where: {
          OR: [
            ...(lineIds.length ? [{ accrualLineId: { in: lineIds } }] : []),
            ...(paymentIds.length ? [{ paymentId: { in: paymentIds } }] : []),
          ],
        },
      });
    }

    if (paymentIds.length) {
      await tx.onlinePaymentOrder.updateMany({
        where: { paymentId: { in: paymentIds } },
        data: { paymentId: null },
      });
      await tx.payment.deleteMany({ where: { id: { in: paymentIds } } });
    }
    await tx.onlinePaymentOrder.deleteMany({
      where: { apartmentId: { in: apartmentIds } },
    });
    if (lineIds.length) {
      await tx.accrualLine.deleteMany({ where: { id: { in: lineIds } } });
    }

    await tx.resident.deleteMany({ where: { apartmentId: { in: apartmentIds } } });
    await tx.user.updateMany({
      where: { apartmentId: { in: apartmentIds } },
      data: { apartmentId: null },
    });
    // UserApartment, Meter(+readings), DebtWriteOff cascade; reminders/pollVotes SetNull
    await tx.apartment.deleteMany({ where: { id: { in: apartmentIds } } });
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