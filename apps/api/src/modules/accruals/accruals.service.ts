import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccrualDistribution, AccrualLineStatus, Prisma } from '@prisma/client';
import {
  calcAccrualLineAmount,
  validateAccrualDistribution,
} from '../../common/utils/accrual-distribution';
import { roundMoney } from '../../common/utils/money';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateAccrualDto } from './dto/create-accrual.dto';
import { CreateAccrualTemplateDto } from './dto/create-accrual-template.dto';
import { ReceiptPdfService } from './receipt-pdf.service';

@Injectable()
export class AccrualsService {
  constructor(
    private prisma: PrismaService,
    private receiptPdf: ReceiptPdfService,
    private audit: AuditService,
  ) {}

  listTemplates() {
    return this.prisma.accrualTemplate.findMany({
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

  listAccruals(period?: string) {
    const where: Prisma.AccrualWhereInput = {};
    if (period) where.period = period;

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

  async previewAmounts(dto: Pick<CreateAccrualDto, 'distribution' | 'rate' | 'fixedAmount' | 'manualLines'>) {
    const apartments = await this.prisma.apartment.findMany({
      orderBy: [{ entrance: 'asc' }, { number: 'asc' }],
    });

    return apartments.map((apt) => ({
      apartmentId: apt.id,
      number: apt.number,
      entrance: apt.entrance,
      area: apt.area,
      amount: calcAccrualLineAmount(apt, dto.distribution, dto.rate, dto.fixedAmount, dto.manualLines),
    }));
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

    const apartments = await this.prisma.apartment.findMany();
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : this.defaultDueDate(dto.period);

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
          amount: calcAccrualLineAmount(apt, dto.distribution, dto.rate, dto.fixedAmount, dto.manualLines),
        }))
        .filter((l) => l.amount > 0);
    }

    if (lines.length === 0) {
      throw new BadRequestException('Немає рядків для нарахування');
    }

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

    const advance = apartment.payments.reduce((s, p) => {
      const allocated = p.allocations.reduce((a, x) => a + Number(x.amount), 0);
      return s + Math.max(0, Number(p.amount) - allocated);
    }, 0);

    return {
      apartment: {
        id: apartment.id,
        number: apartment.number,
        entrance: apartment.entrance,
        area: apartment.area,
        buildingName: apartment.building.name,
      },
      summary: {
        totalAccrued: roundMoney(totalAccrued),
        totalPaid: roundMoney(totalPaidOnLines),
        debt: roundMoney(debt),
        advance: roundMoney(advance),
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
    };
  }

  async getMyAccount(apartmentId: string | null | undefined) {
    if (!apartmentId) {
      throw new ForbiddenException('Квартиру не прив\'язано до облікового запису');
    }
    return this.getApartmentAccount(apartmentId);
  }

  async generateReceipt(lineId: string, apartmentId: string | null, isAdmin: boolean) {
    const line = await this.prisma.accrualLine.findUnique({
      where: { id: lineId },
      include: {
        apartment: { include: { building: true } },
        accrual: { include: { fund: true } },
      },
    });

    if (!line) throw new NotFoundException('Рядок нарахування не знайдено');

    if (!isAdmin && line.apartmentId !== apartmentId) {
      throw new ForbiddenException('Немає доступу до цієї квитанції');
    }

    const amount = Number(line.amount);
    const paid = Number(line.paidAmount);

    return this.receiptPdf.generate({
      buildingName: line.apartment.building.name,
      buildingAddress: line.apartment.building.address,
      apartmentNumber: line.apartment.number,
      period: line.accrual.period,
      title: line.accrual.title,
      fundName: line.accrual.fund.name,
      amount,
      paidAmount: paid,
      balance: roundMoney(amount - paid),
      dueDate: line.dueDate?.toISOString() ?? null,
      lineId: line.id,
      createdAt: line.createdAt,
    });
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