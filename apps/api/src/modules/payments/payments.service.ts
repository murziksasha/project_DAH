import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccrualLineStatus,
  PaymentSource,
  Prisma,
  UserRole,
} from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import {
  matchStatementRows,
  parseBankStatementCsv,
} from '../../common/utils/bank-statement-import';
import {
  FifoLineInput,
  planFifoAllocation,
  resolveAccrualLineStatus,
} from '../../common/utils/fifo-allocation';
import { roundMoney } from '../../common/utils/money';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ImportPaymentsDto } from './dto/import-payments.dto';

export interface AllocationPlan {
  accrualLineId: string;
  amount: number;
  period: string;
  title: string;
  lineBalance: number;
}

const PAYMENT_READ_ROLES: UserRole[] = [
  UserRole.chairman,
  UserRole.accountant,
  UserRole.board,
  UserRole.auditor,
  UserRole.super_admin,
];

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private mail: MailService,
  ) {}

  listPayments(
    user: AuthUser,
    opts?: { apartmentId?: string; from?: string; to?: string },
  ) {
    const where: Prisma.PaymentWhereInput = { isVoided: false };

    if (PAYMENT_READ_ROLES.includes(user.role as UserRole)) {
      if (opts?.apartmentId) where.apartmentId = opts.apartmentId;
    } else {
      const ids = user.apartmentIds?.length
        ? user.apartmentIds
        : user.apartmentId
          ? [user.apartmentId]
          : [];
      if (!ids.length) {
        throw new ForbiddenException('Квартиру не прив\'язано до облікового запису');
      }
      where.apartmentId = { in: ids };
    }

    if (opts?.from || opts?.to) {
      where.date = {};
      if (opts.from) where.date.gte = new Date(opts.from);
      if (opts.to) where.date.lte = new Date(opts.to);
    }

    return this.prisma.payment.findMany({
      where,
      include: {
        apartment: true,
        allocations: {
          include: {
            accrualLine: { include: { accrual: true } },
          },
        },
      },
      orderBy: { date: 'desc' },
      take: 500,
    });
  }

  async getPayment(id: string, user: AuthUser) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        apartment: true,
        allocations: {
          include: {
            accrualLine: { include: { accrual: true } },
          },
        },
      },
    });

    if (!payment) throw new NotFoundException('Платіж не знайдено');

    if (!PAYMENT_READ_ROLES.includes(user.role as UserRole)) {
      const ids = user.apartmentIds?.length
        ? user.apartmentIds
        : user.apartmentId
          ? [user.apartmentId]
          : [];
      if (!ids.includes(payment.apartmentId)) {
        throw new ForbiddenException('Немає доступу до цього платежу');
      }
    }

    return payment;
  }

  async previewAllocation(apartmentId: string, amount: number) {
    const apartment = await this.prisma.apartment.findUnique({
      where: { id: apartmentId },
    });
    if (!apartment) throw new NotFoundException('Квартиру не знайдено');

    const { allocations, advance } = await this.planAllocation(apartmentId, amount);

    return {
      apartment: { id: apartment.id, number: apartment.number },
      amount,
      allocations,
      advance,
      totalAllocated: roundMoney(allocations.reduce((s, a) => s + a.amount, 0)),
    };
  }

  async createPayment(dto: CreatePaymentDto, user: AuthUser) {
    const userId = user.id;
    const apartment = await this.prisma.apartment.findUnique({
      where: { id: dto.apartmentId },
    });
    if (!apartment) throw new NotFoundException('Квартиру не знайдено');

    const { allocations, openLines } = await this.planAllocation(
      dto.apartmentId,
      dto.amount,
      true,
    );

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          apartmentId: dto.apartmentId,
          amount: dto.amount,
          date: new Date(dto.date),
          source: dto.source,
          reference: dto.reference,
        },
      });

      for (const alloc of allocations) {
        await tx.paymentAllocation.create({
          data: {
            paymentId: created.id,
            accrualLineId: alloc.accrualLineId,
            amount: alloc.amount,
          },
        });

        const line = openLines.find((l) => l.id === alloc.accrualLineId)!;
        const newPaid = roundMoney(Number(line.paidAmount) + alloc.amount);
        const lineAmount = Number(line.amount);
        await tx.accrualLine.update({
          where: { id: line.id },
          data: {
            paidAmount: newPaid,
            status: resolveAccrualLineStatus(lineAmount, newPaid, line.dueDate),
          },
        });
      }

      return created;
    });

    await this.audit.log({
      userId,
      action: 'payment.created',
      entityType: 'Payment',
      entityId: payment.id,
      payload: {
        apartmentId: dto.apartmentId,
        amount: dto.amount,
        allocationsCount: allocations.length,
      },
    });

    void this.mail.notifyResidentsOfApartments([dto.apartmentId], 'payment.received', () => ({
      amount: dto.amount,
      apartmentNumber: apartment.number,
    }));

    return this.getPayment(payment.id, user);
  }

  async voidPayment(id: string, reason: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: { allocations: { include: { accrualLine: true } } },
    });
    if (!payment) throw new NotFoundException('Платіж не знайдено');
    if (payment.isVoided) throw new BadRequestException('Платіж вже анульовано');

    await this.prisma.$transaction(async (tx) => {
      for (const alloc of payment.allocations) {
        const line = alloc.accrualLine;
        const newPaid = roundMoney(Number(line.paidAmount) - Number(alloc.amount));
        const lineAmount = Number(line.amount);
        await tx.accrualLine.update({
          where: { id: line.id },
          data: {
            paidAmount: Math.max(0, newPaid),
            status: resolveAccrualLineStatus(lineAmount, Math.max(0, newPaid), line.dueDate),
          },
        });
      }

      await tx.payment.update({
        where: { id },
        data: { isVoided: true, voidReason: reason },
      });
    });

    await this.audit.log({
      userId,
      action: 'payment.voided',
      entityType: 'Payment',
      entityId: id,
      payload: { reason },
    });

    return { id, isVoided: true };
  }

  async previewBankImport(csv: string) {
    if (!csv?.trim()) {
      throw new BadRequestException('Порожній CSV');
    }

    const apartments = await this.prisma.apartment.findMany({
      select: { id: true, number: true, entrance: true },
      orderBy: [{ entrance: 'asc' }, { number: 'asc' }],
    });

    const parsed = parseBankStatementCsv(csv);
    const rows = matchStatementRows(parsed, apartments);

    // Flag possible duplicates by exact reference + amount + date already paid
    const matchedRefs = rows
      .filter((r) => r.status === 'matched' && r.reference)
      .map((r) => r.reference);

    const existing =
      matchedRefs.length > 0
        ? await this.prisma.payment.findMany({
            where: {
              isVoided: false,
              reference: { in: matchedRefs },
            },
            select: { reference: true, amount: true, date: true, apartmentId: true },
          })
        : [];

    const enriched = rows.map((row) => {
      if (row.status !== 'matched' || !row.reference) return row;
      const dup = existing.find(
        (p) =>
          p.reference === row.reference &&
          Number(p.amount) === row.amount &&
          p.date.toISOString().slice(0, 10) === row.date &&
          p.apartmentId === row.apartmentId,
      );
      if (!dup) return row;
      return {
        ...row,
        status: 'skipped' as const,
        message: 'Схожий платіж уже є в системі (той самий референс/сума/дата)',
      };
    });

    const summary = {
      total: enriched.length,
      matched: enriched.filter((r) => r.status === 'matched').length,
      unmatched: enriched.filter((r) => r.status === 'unmatched').length,
      skipped: enriched.filter((r) => r.status === 'skipped').length,
      invalid: enriched.filter((r) => r.status === 'invalid').length,
      totalAmount: roundMoney(
        enriched
          .filter((r) => r.status === 'matched' && r.amount != null)
          .reduce((s, r) => s + (r.amount ?? 0), 0),
      ),
    };

    return { rows: enriched, summary };
  }

  async importPayments(dto: ImportPaymentsDto, user: AuthUser) {
    if (!dto.rows?.length) {
      throw new BadRequestException('Немає рядків для імпорту');
    }

    const source = dto.source ?? PaymentSource.bank;
    const created: string[] = [];
    const errors: Array<{ index: number; message: string }> = [];

    for (let i = 0; i < dto.rows.length; i++) {
      const row = dto.rows[i];
      try {
        const payment = await this.createPayment(
          {
            apartmentId: row.apartmentId,
            amount: row.amount,
            date: row.date,
            source,
            reference: row.reference,
          },
          user,
        );
        created.push(payment.id);
      } catch (err) {
        errors.push({
          index: i,
          message: err instanceof Error ? err.message : 'Помилка імпорту',
        });
      }
    }

    await this.audit.log({
      userId: user.id,
      action: 'payment.import',
      entityType: 'Payment',
      entityId: created[0] ?? 'batch',
      payload: {
        requested: dto.rows.length,
        created: created.length,
        errors: errors.length,
      },
    });

    return {
      created: created.length,
      failed: errors.length,
      paymentIds: created,
      errors,
    };
  }

  async getDebtorsReport() {
    const lines = await this.prisma.accrualLine.findMany({
      where: {
        status: { in: [AccrualLineStatus.open, AccrualLineStatus.partially_paid, AccrualLineStatus.overdue] },
      },
      include: {
        apartment: { select: { number: true, entrance: true } },
        accrual: true,
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });

    const byApartment = new Map<
      string,
      {
        apartmentId: string;
        number: string;
        entrance: number;
        debt: number;
        oldestDue: Date | null;
        lines: number;
      }
    >();

    for (const line of lines) {
      const balance = roundMoney(Number(line.amount) - Number(line.paidAmount));
      if (balance <= 0) continue;

      const key = line.apartmentId;
      const existing = byApartment.get(key) ?? {
        apartmentId: line.apartmentId,
        number: line.apartment.number,
        entrance: line.apartment.entrance,
        debt: 0,
        oldestDue: null,
        lines: 0,
      };
      existing.debt = roundMoney(existing.debt + balance);
      existing.lines += 1;
      if (line.dueDate && (!existing.oldestDue || line.dueDate < existing.oldestDue)) {
        existing.oldestDue = line.dueDate;
      }
      byApartment.set(key, existing);
    }

    return Array.from(byApartment.values())
      .sort((a, b) => b.debt - a.debt)
      .map((row) => ({
        ...row,
        isOverdue: row.oldestDue ? row.oldestDue < new Date() : false,
      }));
  }

  private async planAllocation(
    apartmentId: string,
    paymentAmount: number,
    loadLines = false,
  ) {
    const openLines = await this.prisma.accrualLine.findMany({
      where: {
        apartmentId,
        status: {
          in: [
            AccrualLineStatus.open,
            AccrualLineStatus.partially_paid,
            AccrualLineStatus.overdue,
          ],
        },
      },
      include: { accrual: true },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });

    const fifoLines: FifoLineInput[] = openLines.map((line) => ({
      id: line.id,
      amount: Number(line.amount),
      paidAmount: Number(line.paidAmount),
      dueDate: line.dueDate,
      period: line.accrual.period,
      title: line.accrual.title,
    }));

    const { allocations, advance } = planFifoAllocation(fifoLines, paymentAmount);

    return {
      allocations,
      advance,
      openLines: loadLines ? openLines : [],
    };
  }
}