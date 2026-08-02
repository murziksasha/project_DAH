import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccrualDistribution, AccrualLineStatus, JournalEntryType, Prisma } from '@prisma/client';
import {
  calcAccrualLineAmount,
  validateAccrualDistribution,
} from '../../common/utils/accrual-distribution';
import { roundMoney } from '../../common/utils/money';
import { createZipStore } from '../../common/utils/zip-store';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JournalService } from '../journal/journal.service';
import { MailService } from '../mail/mail.service';
import { parseBuildingSettings } from '../building/building-settings';
import { CreateAccrualDto } from './dto/create-accrual.dto';
import { CreateAccrualTemplateDto } from './dto/create-accrual-template.dto';
import {
  ReceiptPdfService,
  resolveReceiptTemplate,
  type ReceiptData,
} from './receipt-pdf.service';

@Injectable()
export class AccrualsService {
  constructor(
    private prisma: PrismaService,
    private receiptPdf: ReceiptPdfService,
    private audit: AuditService,
    private mail: MailService,
    private journal: JournalService,
  ) {}

  listTemplates(buildingId?: string, tenantId?: string | null) {
    return this.prisma.accrualTemplate.findMany({
      where: buildingId
        ? {
            fund: {
              buildingId,
              ...(tenantId ? { building: { tenantId } } : {}),
            },
          }
        : tenantId
          ? { fund: { building: { tenantId } } }
          : undefined,
      include: { fund: true },
      orderBy: { name: 'asc' },
    });
  }

  createTemplate(dto: CreateAccrualTemplateDto) {
    this.assertValidDistribution(dto.distribution, dto.rate, dto.fixedAmount);

    return this.prisma.accrualTemplate.create({
      data: {
        fundId: dto.fundId,
        name: dto.name,
        distribution: dto.distribution,
        rate: dto.rate,
        fixedAmount: dto.fixedAmount,
        isActive: dto.isActive ?? true,
      },
      include: { fund: true },
    });
  }

  async deleteTemplate(id: string) {
    const tpl = await this.prisma.accrualTemplate.findUnique({
      where: { id },
      include: { _count: { select: { accruals: true } } },
    });
    if (!tpl) throw new NotFoundException('Шаблон не знайдено');
    if (tpl._count.accruals > 0) {
      // soft-deactivate if used
      return this.prisma.accrualTemplate.update({
        where: { id },
        data: { isActive: false },
        include: { fund: true },
      });
    }
    await this.prisma.accrualTemplate.delete({ where: { id } });
    return { id, deleted: true };
  }

  listAccruals(period?: string, buildingId?: string, tenantId?: string | null) {
    const where: Prisma.AccrualWhereInput = {};
    if (period) where.period = period;
    if (buildingId) {
      where.fund = {
        buildingId,
        ...(tenantId ? { building: { tenantId } } : {}),
      };
    } else if (tenantId) {
      where.fund = { building: { tenantId } };
    }

    return this.prisma.accrual.findMany({
      where,
      include: {
        fund: true,
        template: true,
        lines: {
          include: { apartment: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  getAccrual(id: string) {
    return this.prisma.accrual.findUnique({
      where: { id },
      include: {
        fund: true,
        template: true,
        lines: {
          include: { apartment: true, allocations: true },
          orderBy: { apartment: { number: 'asc' } },
        },
      },
    });
  }

  async previewAmounts(
    dto: Pick<
      CreateAccrualDto,
      'distribution' | 'rate' | 'fixedAmount' | 'manualLines' | 'fundId' | 'period' | 'meterType'
    >,
  ) {
    let buildingId: string | undefined;
    if (dto.fundId) {
      const fund = await this.prisma.fund.findUnique({ where: { id: dto.fundId } });
      buildingId = fund?.buildingId;
    }
    const apartments = await this.prisma.apartment.findMany({
      where: buildingId ? { buildingId } : undefined,
      orderBy: [{ entrance: 'asc' }, { number: 'asc' }],
    });
    const consumptionByApt =
      dto.distribution === AccrualDistribution.by_meter && dto.period
        ? await this.meterConsumptionByApartment(
            apartments.map((a) => a.id),
            dto.period,
            dto.meterType,
          )
        : new Map<string, number>();

    return apartments.map((apt) => {
      const meterConsumption = consumptionByApt.get(apt.id) ?? 0;
      return {
        apartmentId: apt.id,
        number: apt.number,
        entrance: apt.entrance,
        area: apt.area,
        meterConsumption,
        amount: calcAccrualLineAmount(
          { ...apt, meterConsumption },
          dto.distribution,
          dto.rate,
          dto.fixedAmount,
          dto.manualLines,
        ),
      };
    });
  }

  async createAccrual(dto: CreateAccrualDto, userId: string) {
    const fund = await this.prisma.fund.findUnique({ where: { id: dto.fundId } });
    if (!fund) throw new NotFoundException('Фонд не знайдено');

    const existing = await this.prisma.accrual.findFirst({
      where: { fundId: dto.fundId, period: dto.period, title: dto.title },
    });
    if (existing) {
      throw new BadRequestException('Нарахування з такою назвою за цей період вже існує');
    }

    this.assertValidDistribution(dto.distribution, dto.rate, dto.fixedAmount, dto.manualLines);

    const apartments = await this.prisma.apartment.findMany({
      where: { buildingId: fund.buildingId },
    });
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : this.defaultDueDate(dto.period);
    const consumptionByApt =
      dto.distribution === AccrualDistribution.by_meter
        ? await this.meterConsumptionByApartment(
            apartments.map((a) => a.id),
            dto.period,
            dto.meterType,
          )
        : new Map<string, number>();

    let lines: { apartmentId: string; amount: number }[];

    if (dto.distribution === AccrualDistribution.manual) {
      const aptIds = new Set(apartments.map((a) => a.id));
      lines = dto.manualLines!
        .filter((l) => l.amount > 0 && aptIds.has(l.apartmentId))
        .map((l) => ({ apartmentId: l.apartmentId, amount: roundMoney(l.amount) }));
    } else {
      lines = apartments
        .map((apt) => ({
          apartmentId: apt.id,
          amount: calcAccrualLineAmount(
            { ...apt, meterConsumption: consumptionByApt.get(apt.id) ?? 0 },
            dto.distribution,
            dto.rate,
            dto.fixedAmount,
            dto.manualLines,
          ),
        }))
        .filter((l) => l.amount > 0);
    }

    if (lines.length === 0) {
      throw new BadRequestException('Немає рядків для нарахування');
    }

    const total = roundMoney(lines.reduce((s, l) => s + l.amount, 0));
    const buildingId = apartments[0]?.buildingId ?? fund.buildingId;

    const accrual = await this.prisma.$transaction(async (tx) => {
      const created = await tx.accrual.create({
        data: {
          fundId: dto.fundId,
          templateId: dto.templateId,
          period: dto.period,
          title: dto.title,
        },
      });

      await tx.accrualLine.createMany({
        data: lines.map((l) => ({
          accrualId: created.id,
          apartmentId: l.apartmentId,
          amount: l.amount,
          dueDate,
          status: AccrualLineStatus.open,
        })),
      });

      await this.journal.write(
        {
          type: JournalEntryType.accrual,
          refType: 'Accrual',
          refId: created.id,
          description: `${dto.title} (${dto.period})`,
          buildingId,
          fundId: dto.fundId,
          createdById: userId,
          lines: [
            {
              account: 'receivable',
              debit: total,
              fundId: dto.fundId,
            },
            {
              account: 'fund_balance',
              credit: total,
              fundId: dto.fundId,
            },
          ],
        },
        tx,
      );

      return created;
    });

    await this.audit.log({
      userId,
      action: 'accrual.created',
      entityType: 'Accrual',
      entityId: accrual.id,
      payload: {
        period: dto.period,
        distribution: dto.distribution,
        linesCount: lines.length,
        total: lines.reduce((s, l) => s + l.amount, 0),
      },
    });

    const aptIds = lines.map((l) => l.apartmentId);
    const amountByApt = new Map(lines.map((l) => [l.apartmentId, l.amount]));
    const numberById = new Map(apartments.map((a) => [a.id, a.number]));
    const dueLabel = dueDate.toLocaleDateString('uk-UA');
    void this.mail.notifyResidentsOfApartments(aptIds, 'accrual.created', (apartmentId) => ({
      title: dto.title,
      period: dto.period,
      amount: amountByApt.get(apartmentId),
      dueDate: dueLabel,
      apartmentNumber: numberById.get(apartmentId),
    }));

    return this.getAccrual(accrual.id);
  }

  async getApartmentAccount(apartmentId: string) {
    const apartment = await this.prisma.apartment.findUnique({
      where: { id: apartmentId },
      include: {
        building: true,
        accrualLines: {
          include: {
            accrual: { include: { fund: true } },
            allocations: { include: { payment: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        payments: {
          where: { isVoided: false },
          include: { allocations: true },
          orderBy: { date: 'desc' },
        },
      },
    });

    if (!apartment) throw new NotFoundException('Квартиру не знайдено');

    const lines = apartment.accrualLines.map((line) => {
      const amount = Number(line.amount);
      const paid = Number(line.paidAmount);
      const status = this.resolveLineStatus(line.status, line.dueDate, amount, paid);
      return {
        id: line.id,
        period: line.accrual.period,
        title: line.accrual.title,
        fundName: line.accrual.fund.name,
        amount,
        paidAmount: paid,
        balance: roundMoney(amount - paid),
        status,
        dueDate: line.dueDate,
        createdAt: line.createdAt,
      };
    });

    const totalAccrued = lines.reduce((s, l) => s + l.amount, 0);
    const totalPaidOnLines = lines.reduce((s, l) => s + l.paidAmount, 0);
    const debt = lines.reduce((s, l) => s + Math.max(0, l.balance), 0);

    const advanceStored = roundMoney(Number(apartment.advanceBalance));
    const advanceFromPayments = apartment.payments.reduce((s, p) => {
      const allocated = p.allocations.reduce((a, x) => a + Number(x.amount), 0);
      return s + Math.max(0, Number(p.amount) - allocated);
    }, 0);

    const timeline = this.buildTimeline(apartment);

    return {
      apartment: {
        id: apartment.id,
        number: apartment.number,
        entrance: apartment.entrance,
        area: apartment.area,
        buildingId: apartment.buildingId,
        buildingName: apartment.building.name,
      },
      summary: {
        totalAccrued: roundMoney(totalAccrued),
        totalPaid: roundMoney(totalPaidOnLines),
        debt: roundMoney(debt),
        advance: advanceStored,
        advanceComputed: roundMoney(advanceFromPayments),
      },
      lines,
      payments: apartment.payments.map((p) => {
        const allocated = p.allocations.reduce((a, x) => a + Number(x.amount), 0);
        return {
          id: p.id,
          amount: Number(p.amount),
          allocated: roundMoney(allocated),
          advance: roundMoney(Math.max(0, Number(p.amount) - allocated)),
          date: p.date,
          source: p.source,
          reference: p.reference,
        };
      }),
      timeline,
    };
  }

  async getMyAccount(apartmentId: string | null | undefined) {
    if (!apartmentId) {
      throw new ForbiddenException('Квартиру не прив\'язано до облікового запису');
    }
    return this.getApartmentAccount(apartmentId);
  }

  /** Unified accrual/payment timeline for resident UX. */
  private buildTimeline(apartment: {
    accrualLines: Array<{
      id: string;
      amount: Prisma.Decimal | number;
      paidAmount: Prisma.Decimal | number;
      dueDate: Date | null;
      createdAt: Date;
      status: AccrualLineStatus;
      accrual: { period: string; title: string; fund: { name: string } };
    }>;
    payments: Array<{
      id: string;
      amount: Prisma.Decimal | number;
      date: Date;
      source: string;
      reference: string | null;
      allocations: Array<{ amount: Prisma.Decimal | number }>;
    }>;
  }) {
    type Event = {
      id: string;
      kind: 'accrual' | 'payment';
      at: string;
      title: string;
      amount: number;
      meta?: Record<string, unknown>;
    };
    const events: Event[] = [];

    for (const line of apartment.accrualLines) {
      const amount = Number(line.amount);
      const paid = Number(line.paidAmount);
      const status = this.resolveLineStatus(line.status, line.dueDate, amount, paid);
      events.push({
        id: `accrual-${line.id}`,
        kind: 'accrual',
        at: line.createdAt.toISOString(),
        title: `${line.accrual.title} (${line.accrual.period})`,
        amount,
        meta: {
          fundName: line.accrual.fund.name,
          paidAmount: paid,
          dueDate: line.dueDate,
          lineId: line.id,
          status,
          period: line.accrual.period,
        },
      });
    }
    for (const p of apartment.payments) {
      events.push({
        id: `payment-${p.id}`,
        kind: 'payment',
        at: p.date.toISOString(),
        title: p.reference ? `Платіж ${p.reference}` : 'Платіж',
        amount: Number(p.amount),
        meta: {
          source: p.source,
          allocated: p.allocations.reduce((s, a) => s + Number(a.amount), 0),
          paymentId: p.id,
        },
      });
    }

    return events.sort((a, b) => (a.at < b.at ? 1 : -1));
  }

  async generateReceipt(
    lineId: string,
    residentApartmentIds: string[],
    isAdmin: boolean,
  ) {
    const line = await this.prisma.accrualLine.findUnique({
      where: { id: lineId },
      include: {
        apartment: {
          include: {
            building: { include: { bankAccounts: { take: 1 } } },
            residents: { where: { isOwner: true }, take: 1 },
          },
        },
        accrual: { include: { fund: { include: { bankAccount: true } } } },
      },
    });

    if (!line) throw new NotFoundException('Рядок нарахування не знайдено');

    if (!isAdmin && !residentApartmentIds.includes(line.apartmentId)) {
      throw new ForbiddenException('Немає доступу до цієї квитанції');
    }

    const page = await this.toReceiptData(line);
    return this.receiptPdf.generate(page);
  }

  private async toReceiptData(line: {
    id: string;
    amount: Prisma.Decimal | number;
    paidAmount: Prisma.Decimal | number;
    dueDate: Date | null;
    createdAt: Date;
    apartment: {
      number: string;
      entrance?: number | null;
      area?: number | null;
      residents?: Array<{ firstName: string; lastName: string; phone: string | null }>;
      building: {
        name: string;
        address: string;
        edrpou?: string | null;
        settings?: unknown;
        bankAccounts?: Array<{ bankName: string; iban: string }>;
      };
    };
    accrual: {
      period: string;
      title: string;
      fund: {
        name: string;
        bankAccount?: { bankName: string; iban: string } | null;
      };
    };
  }): Promise<ReceiptData> {
    const amount = Number(line.amount);
    const paid = Number(line.paidAmount);
    const owner = line.apartment.residents?.[0];
    const bank =
      line.accrual.fund.bankAccount ?? line.apartment.building.bankAccounts?.[0] ?? null;
    const settings = parseBuildingSettings(line.apartment.building.settings);
    const template = resolveReceiptTemplate(settings.documentTemplates);

    return {
      buildingName: line.apartment.building.name,
      buildingAddress: line.apartment.building.address,
      edrpou: line.apartment.building.edrpou ?? null,
      apartmentNumber: line.apartment.number,
      entrance: line.apartment.entrance ?? null,
      area: line.apartment.area != null ? Number(line.apartment.area) : null,
      ownerName: owner ? `${owner.lastName} ${owner.firstName}` : null,
      ownerPhone: owner?.phone ?? null,
      bankName: bank?.bankName ?? null,
      bankIban: bank?.iban ?? null,
      period: line.accrual.period,
      title: line.accrual.title,
      fundName: line.accrual.fund.name,
      amount,
      paidAmount: paid,
      balance: roundMoney(amount - paid),
      dueDate: line.dueDate?.toISOString() ?? null,
      lineId: line.id,
      createdAt: line.createdAt,
      template,
    };
  }

  private accrualReceiptInclude() {
    return {
      fund: { include: { bankAccount: true as const } },
      lines: {
        include: {
          apartment: {
            include: {
              building: { include: { bankAccounts: { take: 1 } } },
              residents: { where: { isOwner: true }, take: 1 },
            },
          },
        },
        orderBy: { apartment: { number: 'asc' as const } },
      },
    };
  }

  /** ZIP with one PDF receipt per apartment line of an accrual. */
  async generateAccrualReceiptsZip(accrualId: string): Promise<{ buffer: Buffer; filename: string }> {
    const accrual = await this.prisma.accrual.findUnique({
      where: { id: accrualId },
      include: this.accrualReceiptInclude(),
    });
    if (!accrual) throw new NotFoundException('Нарахування не знайдено');
    if (!accrual.lines.length) {
      throw new BadRequestException('Немає рядків для квитанцій');
    }

    const files: Array<{ name: string; data: Buffer }> = [];
    for (const line of accrual.lines) {
      const page = await this.toReceiptData({
        ...line,
        accrual: {
          period: accrual.period,
          title: accrual.title,
          fund: accrual.fund,
        },
      });
      const pdf = await this.receiptPdf.generate(page);
      const safeNum = String(line.apartment.number).replace(/[^\w.-]+/g, '_');
      files.push({
        name: `kvytantsiia-${accrual.period}-kv-${safeNum}.pdf`,
        data: pdf,
      });
    }

    const buffer = createZipStore(files);
    const filename = `kvytantsii-${accrual.period}-${accrual.id.slice(-6)}.zip`;
    return { buffer, filename };
  }

  /** Print-friendly multi-page PDF (all lines). */
  async generateAccrualReceiptsPdf(accrualId: string): Promise<{ buffer: Buffer; filename: string }> {
    const accrual = await this.prisma.accrual.findUnique({
      where: { id: accrualId },
      include: this.accrualReceiptInclude(),
    });
    if (!accrual) throw new NotFoundException('Нарахування не знайдено');
    if (!accrual.lines.length) {
      throw new BadRequestException('Немає рядків для квитанцій');
    }

    const pages: ReceiptData[] = [];
    for (const line of accrual.lines) {
      pages.push(
        await this.toReceiptData({
          ...line,
          accrual: {
            period: accrual.period,
            title: accrual.title,
            fund: accrual.fund,
          },
        }),
      );
    }

    const buffer = await this.receiptPdf.generateMany(pages);
    return {
      buffer,
      filename: `kvytantsii-${accrual.period}-${accrual.id.slice(-6)}.pdf`,
    };
  }

  private async meterConsumptionByApartment(
    apartmentIds: string[],
    period: string,
    meterType?: string,
  ): Promise<Map<string, number>> {
    if (!apartmentIds.length) return new Map();
    const meters = await this.prisma.meter.findMany({
      where: {
        apartmentId: { in: apartmentIds },
        isActive: true,
        ...(meterType ? { type: meterType as never } : {}),
      },
      include: {
        readings: { where: { period }, take: 1 },
      },
    });
    const map = new Map<string, number>();
    for (const m of meters) {
      const c = m.readings[0] ? Number(m.readings[0].consumption) : 0;
      map.set(m.apartmentId, roundMoney((map.get(m.apartmentId) ?? 0) + c));
    }
    return map;
  }

  /** Excel statement for apartment (admin + resident export). */
  async exportApartmentStatementXlsx(apartmentId: string) {
    const { rowsToXlsxBuffer } = await import('../../common/utils/xlsx-export');
    const account = await this.getApartmentAccount(apartmentId);
    const timelineRows: Array<Array<string | number>> = [
      ['Тип', 'Дата', 'Опис', 'Сума', 'Сплачено', 'Залишок'],
      ...account.timeline.map((e) => {
        const amount = e.amount;
        const meta = e.meta ?? {};
        const paid =
          typeof meta.paidAmount === 'number' ? Number(meta.paidAmount) : '';
        const balance =
          e.kind === 'accrual' && typeof meta.paidAmount === 'number'
            ? roundMoney(amount - Number(meta.paidAmount))
            : '';
        return [
          e.kind === 'payment' ? 'Платіж' : 'Нарахування',
          e.at.slice(0, 10),
          e.title,
          amount,
          paid,
          balance,
        ];
      }),
    ];
    const linesRows: Array<Array<string | number>> = [
      ['Період', 'Послуга', 'Фонд', 'Сума', 'Сплачено', 'Залишок', 'Статус'],
      ...account.lines.map((l) => [
        l.period,
        l.title,
        l.fundName,
        l.amount,
        l.paidAmount,
        l.balance,
        l.status,
      ]),
    ];
    const summaryRows: Array<Array<string | number>> = [
      ['Показник', 'Сума'],
      ['Борг', account.summary.debt],
      ['Аванс', account.summary.advance],
      ['Нараховано', account.summary.totalAccrued],
      ['Сплачено', account.summary.totalPaid],
      ['Квартира', account.apartment.number],
      ['Будинок', account.apartment.buildingName],
    ];
    const buffer = await rowsToXlsxBuffer([
      { name: 'Підсумок', rows: summaryRows },
      { name: 'Історія', rows: timelineRows },
      { name: 'Нарахування', rows: linesRows },
    ]);
    return {
      filename: `account-kv-${account.apartment.number}.xlsx`,
      buffer,
    };
  }

  private assertValidDistribution(
    distribution: AccrualDistribution,
    rate?: number,
    fixedAmount?: number,
    manualLines?: { apartmentId: string; amount: number }[],
  ) {
    const error = validateAccrualDistribution(distribution, rate, fixedAmount, manualLines);
    if (error) throw new BadRequestException(error);
  }

  private defaultDueDate(period: string) {
    const [year, month] = period.split('-').map(Number);
    return new Date(year, month, 14);
  }

  private resolveLineStatus(
    status: AccrualLineStatus,
    dueDate: Date | null,
    amount: number,
    paid: number,
  ): AccrualLineStatus {
    if (paid >= amount) return AccrualLineStatus.paid;
    if (paid > 0) {
      if (dueDate && dueDate < new Date()) return AccrualLineStatus.overdue;
      return AccrualLineStatus.partially_paid;
    }
    if (dueDate && dueDate < new Date()) return AccrualLineStatus.overdue;
    return status;
  }
}