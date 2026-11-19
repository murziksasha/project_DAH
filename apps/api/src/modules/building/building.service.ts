import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  normalizeDocumentTemplatesConfig,
  type DocumentTemplatesConfig,
} from '@dah/shared';
import { Prisma, UserRole } from '../../prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import {
  extractEmailsFromResidentsCell,
  parseApartmentsCsv,
} from '../../common/utils/apartment-csv';
import { sortByApartmentNumber } from '../../common/utils/apartment-sort';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JournalService } from '../journal/journal.service';
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
    @Optional() private journal?: JournalService,
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
  async getOpsSummary(buildingId?: string, user?: AuthUser) {
    const tenantId = user && user.role !== UserRole.super_admin ? user.tenantId : undefined;
    const aptScope = buildingId
      ? { apartment: { buildingId } }
      : tenantId
        ? { apartment: { building: { tenantId } } }
        : {};

    const [pendingResidents, openRequests, activePolls, debtorsLines, documents] =
      await Promise.all([
        this.prisma.tenantMembership.count({
          where: {
            ...(tenantId ? { tenantId } : {}),
            status: 'pending',
            role: UserRole.resident,
          },
        }),
        this.prisma.request.count({
          where: {
            ...(tenantId ? { tenantId } : {}),
            ...(buildingId ? { buildingId } : {}),
            status: { in: ['new', 'in_progress'] },
          },
        }),
        this.prisma.poll.count({
          where: {
            ...(tenantId ? { tenantId } : {}),
            isActive: true,
          },
        }),
        this.prisma.accrualLine.count({
          where: {
            status: { in: ['open', 'partially_paid', 'overdue'] },
            ...aptScope,
          },
        }),
        this.prisma.document.count({
          where: tenantId ? { tenantId } : undefined,
        }),
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

        let debt = 0;
        let billed = 0;
        let paid = 0;

        if (aptIds.length > 0) {
          const [openAgg, paidAgg] = await Promise.all([
            this.prisma.accrualLine.aggregate({
              where: {
                apartmentId: { in: aptIds },
                status: { in: ['open', 'partially_paid', 'overdue'] },
              },
              _sum: { amount: true, paidAmount: true },
            }),
            this.prisma.accrualLine.aggregate({
              where: {
                apartmentId: { in: aptIds },
                status: 'paid',
              },
              _sum: { amount: true, paidAmount: true },
            }),
          ]);

          const openAmount = Number(openAgg._sum.amount ?? 0);
          const openPaid = Number(openAgg._sum.paidAmount ?? 0);
          const closedAmount = Number(paidAgg._sum.amount ?? 0);
          const closedPaid = Number(paidAgg._sum.paidAmount ?? 0);

          debt = Math.max(0, openAmount - openPaid);
          billed = openAmount + closedAmount;
          paid = openPaid + closedPaid;
        }

        const openRequests = await this.prisma.request.count({
          where: {
            buildingId: b.id,
            status: { in: ['new', 'in_progress'] },
          },
        });
        const overdueRequests = await this.prisma.request.count({
          where: {
            buildingId: b.id,
            status: { in: ['new', 'in_progress'] },
            dueAt: { lt: new Date() },
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

    const [unassignedOpen, unassignedOverdue] = await Promise.all([
      this.prisma.request.count({
        where: {
          ...(tenantId ? { tenantId } : {}),
          buildingId: null,
          status: { in: ['new', 'in_progress'] },
        },
      }),
      this.prisma.request.count({
        where: {
          ...(tenantId ? { tenantId } : {}),
          buildingId: null,
          status: { in: ['new', 'in_progress'] },
          dueAt: { lt: new Date() },
        },
      }),
    ]);

    const totals = items.reduce(
      (acc, i) => {
        acc.debt += i.debt;
        acc.openRequests += i.openRequests;
        acc.overdueRequests += i.overdueRequests;
        acc.apartments += i.apartments;
        return acc;
      },
      { debt: 0, openRequests: unassignedOpen, overdueRequests: unassignedOverdue, apartments: 0 },
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
    dto: { name?: string; address?: string; edrpou?: string | null; buildingId?: string },
    userOrUserId: AuthUser | string,
  ) {
    const user: AuthUser | null = typeof userOrUserId === 'object' ? userOrUserId : null;
    const userId: string = typeof userOrUserId === 'string' ? userOrUserId : userOrUserId.id;

    const building = dto.buildingId
      ? await this.prisma.building.findUnique({ where: { id: dto.buildingId } })
      : await this.prisma.building.findFirst({
          where: user?.tenantId ? { tenantId: user.tenantId } : undefined,
          orderBy: { createdAt: 'asc' },
        });
    if (!building) throw new NotFoundException('Будинок не налаштовано');
    if (user && user.role !== UserRole.super_admin) {
      if (!user.tenantId || building.tenantId !== user.tenantId) {
        throw new ForbiddenException('Немає доступу до будинку іншої організації');
      }
    }

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

  async getSettings(buildingId?: string, user?: AuthUser) {
    const tenantId = user && user.role !== UserRole.super_admin ? user.tenantId : undefined;
    const building = buildingId
      ? await this.prisma.building.findFirst({
          where: {
            id: buildingId,
            ...(tenantId ? { tenantId } : {}),
          },
          select: {
            id: true,
            name: true,
            address: true,
            edrpou: true,
            showDebtorsToResidents: true,
            isInitialized: true,
            settings: true,
          },
        })
      : await this.prisma.building.findFirst({
          where: tenantId ? { tenantId } : undefined,
          orderBy: { createdAt: 'asc' },
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
      autoApplyAdvance: json.autoApplyAdvance !== false,
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

  async updateSettings(dto: UpdateBuildingSettingsDto & { buildingId?: string }, userOrUserId: AuthUser | string) {
    const user: AuthUser | null = typeof userOrUserId === 'object' ? userOrUserId : null;
    const userId: string = typeof userOrUserId === 'string' ? userOrUserId : userOrUserId.id;

    const building = dto.buildingId
      ? await this.prisma.building.findUnique({ where: { id: dto.buildingId } })
      : await this.prisma.building.findFirst({
          where: user?.tenantId ? { tenantId: user.tenantId } : undefined,
          orderBy: { createdAt: 'asc' },
        });
    if (!building) throw new NotFoundException('Будинок не налаштовано');
    if (user && user.role !== UserRole.super_admin) {
      if (!user.tenantId || building.tenantId !== user.tenantId) {
        throw new ForbiddenException('Немає доступу до будинку іншої організації');
      }
    }

    // Phase 3: enabling Journal-SoT via settings obeys the same readiness guard as POST /journal/sot.
    if (dto.journalSot === true && this.journal) {
      await this.journal.assertSotSwitchAllowed(building.id, true, { actorRole: user?.role });
    }

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
      ...(dto.autoApplyAdvance !== undefined ? { autoApplyAdvance: dto.autoApplyAdvance } : {}),
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
      autoApplyAdvance: json.autoApplyAdvance !== false,
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
  async getDocumentTemplates(buildingId?: string, user?: AuthUser): Promise<DocumentTemplatesConfig> {
    const tenantId = user && user.role !== UserRole.super_admin ? user.tenantId : undefined;
    const building = buildingId
      ? await this.prisma.building.findFirst({
          where: {
            id: buildingId,
            ...(tenantId ? { tenantId } : {}),
          },
          select: { settings: true },
        })
      : await this.prisma.building.findFirst({
          where: tenantId ? { tenantId } : undefined,
          orderBy: { createdAt: 'asc' },
          select: { settings: true },
        });
    const json = parseBuildingSettings(building?.settings);
    return normalizeDocumentTemplatesConfig(json.documentTemplates);
  }

  async updateDocumentTemplates(
    dto: UpdateDocumentTemplatesDto & { buildingId?: string },
    userOrUserId: AuthUser | string,
  ): Promise<DocumentTemplatesConfig> {
    const user: AuthUser | null = typeof userOrUserId === 'object' ? userOrUserId : null;
    const userId: string = typeof userOrUserId === 'string' ? userOrUserId : userOrUserId.id;

    const building = dto.buildingId
      ? await this.prisma.building.findUnique({ where: { id: dto.buildingId } })
      : await this.prisma.building.findFirst({
          where: user?.tenantId ? { tenantId: user.tenantId } : undefined,
          orderBy: { createdAt: 'asc' },
        });
    if (!building) throw new NotFoundException('Будинок не налаштовано');
    if (user && user.role !== UserRole.super_admin) {
      if (!user.tenantId || building.tenantId !== user.tenantId) {
        throw new ForbiddenException('Немає доступу до будинку іншої організації');
      }
    }

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

  async listApartments(buildingId?: string, tenantId?: string | null, user?: AuthUser) {
    if (user && user.role === UserRole.resident) {
      const allowedIds = user.apartmentIds?.length
        ? user.apartmentIds
        : user.apartmentId
          ? [user.apartmentId]
          : [];
      if (!allowedIds.length) return [];
      const apartments = await this.prisma.apartment.findMany({
        where: {
          id: { in: allowedIds },
          ...(tenantId ? { building: { tenantId } } : {}),
        },
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

    const apartments = await this.prisma.apartment.findMany({
      where: {
        ...(buildingId ? { buildingId } : {}),
        ...(tenantId ? { building: { tenantId } } : {}),
      },
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

  async getApartment(id: string, user?: AuthUser) {
    const apartment = await this.prisma.apartment.findUnique({
      where: { id },
      include: {
        building: { select: { id: true, tenantId: true } },
        residents: true,
        accrualLines: {
          include: { accrual: true, allocations: true },
          orderBy: { createdAt: 'desc' },
        },
        payments: { orderBy: { date: 'desc' } },
      },
    });
    if (!apartment) throw new NotFoundException('Квартиру не знайдено');

    if (user && user.role !== UserRole.super_admin) {
      if (user.tenantId && apartment.building.tenantId !== user.tenantId) {
        throw new ForbiddenException('Немає доступу до квартири іншої організації');
      }
      if (user.role === UserRole.resident) {
        const allowedIds = user.apartmentIds?.length
          ? user.apartmentIds
          : user.apartmentId
            ? [user.apartmentId]
            : [];
        if (!allowedIds.includes(apartment.id)) {
          throw new ForbiddenException('Немає доступу до чужої квартири');
        }
      }
    }

    if (user && (user.role === UserRole.dispatcher || user.role === UserRole.crew)) {
      return {
        ...apartment,
        advanceBalance: null,
        accrualLines: [],
        payments: [],
      };
    }

    return apartment;
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
  async importApartmentsCsv(csv: string, userOrUserId: AuthUser | string, buildingId?: string) {
    const user: AuthUser | null = typeof userOrUserId === 'object' ? userOrUserId : null;
    const userId: string = typeof userOrUserId === 'string' ? userOrUserId : userOrUserId.id;

    const building = buildingId
      ? await this.prisma.building.findUnique({ where: { id: buildingId } })
      : await this.prisma.building.findFirst({
          where: user?.tenantId ? { tenantId: user.tenantId } : undefined,
          orderBy: { createdAt: 'asc' },
        });
    if (!building) throw new NotFoundException('Будинок не налаштовано');
    if (user && user.role !== UserRole.super_admin) {
      if (!user.tenantId || building.tenantId !== user.tenantId) {
        throw new ForbiddenException('Немає доступу до будинку іншої організації');
      }
    }

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

        // Only users of THIS organization may be linked (no cross-tenant account takeover).
        const users = await tx.user.findMany({
          where: {
            email: { in: emails, mode: 'insensitive' },
            memberships: { some: { tenantId: building.tenantId } },
          },
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

  /** Normalize legacy `userId` callers (tests) vs `AuthUser` callers (controller). */
  private actor(userOrUserId: AuthUser | string): { userId: string; user: AuthUser | null } {
    return typeof userOrUserId === 'string'
      ? { userId: userOrUserId, user: null }
      : { userId: userOrUserId.id, user: userOrUserId };
  }

  /** 404 when the apartment's building belongs to another organization. */
  private async assertApartmentInTenant(
    apartmentId: string,
    user: AuthUser | null,
  ): Promise<void> {
    if (!user || user.role === UserRole.super_admin) return;
    const apt = await this.prisma.apartment.findUnique({
      where: { id: apartmentId },
      select: { building: { select: { tenantId: true } } },
    });
    if (!apt || !user.tenantId || apt.building.tenantId !== user.tenantId) {
      throw new NotFoundException('Квартиру не знайдено');
    }
  }

  async updateApartment(id: string, dto: UpdateApartmentDto, userOrUserId: AuthUser | string) {
    const { userId, user } = this.actor(userOrUserId);
    const existing = await this.prisma.apartment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Квартиру не знайдено');
    await this.assertApartmentInTenant(id, user);

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

  async deleteApartment(id: string, userOrUserId: AuthUser | string) {
    const { userId, user } = this.actor(userOrUserId);
    await this.assertApartmentInTenant(id, user);
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

  async createResident(
    apartmentId: string,
    dto: CreateResidentDto,
    userOrUserId: AuthUser | string,
  ) {
    const { userId, user } = this.actor(userOrUserId);
    const apartment = await this.prisma.apartment.findUnique({ where: { id: apartmentId } });
    if (!apartment) throw new NotFoundException('Квартиру не знайдено');
    await this.assertApartmentInTenant(apartmentId, user);

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

  async updateResident(id: string, dto: UpdateResidentDto, userOrUserId: AuthUser | string) {
    const { userId, user } = this.actor(userOrUserId);
    const existing = await this.prisma.resident.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Мешканця не знайдено');
    await this.assertApartmentInTenant(existing.apartmentId, user);

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

  async deleteResident(id: string, userOrUserId: AuthUser | string) {
    const { userId, user } = this.actor(userOrUserId);
    const existing = await this.prisma.resident.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Мешканця не знайдено');
    await this.assertApartmentInTenant(existing.apartmentId, user);

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