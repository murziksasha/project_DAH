import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccrualLineStatus,
  JournalEntryType,
  PaymentSource,
  Prisma,
  UserRole,
} from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import {
  matchStatementRows,
  parseBankStatement,
  STATEMENT_FORMATS,
  type StatementFormat,
} from '../../common/utils/bank-statement-import';
import {
  FifoLineInput,
  planFifoAllocation,
  resolveAccrualLineStatus,
} from '../../common/utils/fifo-allocation';
import { roundMoney } from '../../common/utils/money';
import { normalizePage, toPageResult } from '../../common/utils/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JournalService } from '../journal/journal.service';
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
    private journal: JournalService,
  ) {}

  async listPayments(
    user: AuthUser,
    opts?: {
      apartmentId?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
      buildingId?: string;
      tenantId?: string | null;
    },
  ) {
    const where: Prisma.PaymentWhereInput = { isVoided: false };

    if (PAYMENT_READ_ROLES.includes(user.role as UserRole)) {
      if (opts?.apartmentId) where.apartmentId = opts.apartmentId;
      if (opts?.buildingId) {
        where.apartment = {
          buildingId: opts.buildingId,
          ...(opts.tenantId ? { building: { tenantId: opts.tenantId } } : {}),
        };
      } else if (opts?.tenantId) {
        where.apartment = { building: { tenantId: opts.tenantId } };
      }
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

    const { page, limit, skip } = normalizePage(opts, 50, 200);
    const [total, items] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
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
        skip,
        take: limit,
      }),
    ]);

    return toPageResult(items, total, page, limit);
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

    const payment = await this.prisma.$transaction(async (tx) => {
      // Row lock apartment + open accrual lines to prevent double-allocation races
      await tx.$queryRaw`SELECT id FROM "Apartment" WHERE id = ${dto.apartmentId} FOR UPDATE`;
      const lockedLines = await tx.$queryRaw<
        Array<{
          id: string;
          amount: Prisma.Decimal;
          paidAmount: Prisma.Decimal;
          dueDate: Date | null;
          period: string;
          title: string;
          fundId: string;
        }>
      >`
        SELECT al.id, al.amount, al."paidAmount", al."dueDate",
               a.period, a.title, a."fundId"
        FROM "AccrualLine" al
        JOIN "Accrual" a ON a.id = al."accrualId"
        WHERE al."apartmentId" = ${dto.apartmentId}
          AND al.status IN ('open', 'partially_paid', 'overdue')
        ORDER BY al."dueDate" ASC NULLS LAST, al."createdAt" ASC
        FOR UPDATE OF al
      `;

      const fifoLines: FifoLineInput[] = lockedLines.map((line) => ({
        id: line.id,
        amount: Number(line.amount),
        paidAmount: Number(line.paidAmount),
        dueDate: line.dueDate,
        period: line.period,
        title: line.title,
      }));

      const { allocations, advance } = planFifoAllocation(fifoLines, dto.amount);

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

        const line = lockedLines.find((l) => l.id === alloc.accrualLineId)!;
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

      if (advance > 0) {
        await tx.apartment.update({
          where: { id: dto.apartmentId },
          data: {
            advanceBalance: {
              increment: advance,
            },
          },
        });
      }

      const totalAllocated = roundMoney(allocations.reduce((s, a) => s + a.amount, 0));
      const fundId = lockedLines[0]?.fundId ?? null;

      await this.journal.write(
        {
          type: JournalEntryType.payment,
          refType: 'Payment',
          refId: created.id,
          description: `Платіж ${dto.amount} грн, кв. ${apartment.number}`,
          buildingId: apartment.buildingId,
          apartmentId: dto.apartmentId,
          fundId,
          createdById: userId,
          lines: [
            {
              account: 'cash',
              debit: dto.amount,
              fundId,
              apartmentId: dto.apartmentId,
            },
            {
              account: 'receivable',
              credit: totalAllocated,
              fundId,
              apartmentId: dto.apartmentId,
            },
            ...(advance > 0
              ? [
                  {
                    account: 'advance',
                    credit: advance,
                    apartmentId: dto.apartmentId,
                    fundId,
                  },
                ]
              : []),
          ],
        },
        tx,
      );

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
      },
    });

    void this.mail.notifyResidentsOfApartments([dto.apartmentId], 'payment.received', () => ({
      amount: dto.amount,
      apartmentNumber: apartment.number,
      actionPath: '/resident?tab=account',
      actionLabel: 'Відкрити рахунок',
    }));

    return this.getPayment(payment.id, user);
  }

  async voidPayment(id: string, reason: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        allocations: { include: { accrualLine: { include: { accrual: true } } } },
        apartment: true,
      },
    });
    if (!payment) throw new NotFoundException('Платіж не знайдено');
    if (payment.isVoided) throw new BadRequestException('Платіж вже анульовано');

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Apartment" WHERE id = ${payment.apartmentId} FOR UPDATE`;

      const lineIds = payment.allocations.map((a) => a.accrualLineId);
      if (lineIds.length) {
        await tx.$queryRaw`
          SELECT id FROM "AccrualLine" WHERE id IN (${Prisma.join(lineIds)}) FOR UPDATE
        `;
      }

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

      const allocated = payment.allocations.reduce((s, a) => s + Number(a.amount), 0);
      const advancePart = roundMoney(Math.max(0, Number(payment.amount) - allocated));
      if (advancePart > 0) {
        const apt = await tx.apartment.findUnique({ where: { id: payment.apartmentId } });
        const next = roundMoney(Math.max(0, Number(apt?.advanceBalance ?? 0) - advancePart));
        await tx.apartment.update({
          where: { id: payment.apartmentId },
          data: { advanceBalance: next },
        });
      }

      await tx.payment.update({
        where: { id },
        data: { isVoided: true, voidReason: reason },
      });

      const fundId = payment.allocations[0]?.accrualLine?.accrual?.fundId ?? null;
      await this.journal.write(
        {
          type: JournalEntryType.void_payment,
          refType: 'Payment',
          refId: id,
          description: `Анулювання платежу: ${reason}`,
          buildingId: payment.apartment.buildingId,
          apartmentId: payment.apartmentId,
          fundId,
          createdById: userId,
          lines: [
            {
              account: 'cash',
              credit: Number(payment.amount),
              apartmentId: payment.apartmentId,
              fundId,
            },
            {
              account: 'receivable',
              debit: allocated,
              apartmentId: payment.apartmentId,
              fundId,
            },
            ...(advancePart > 0
              ? [
                  {
                    account: 'advance',
                    debit: advancePart,
                    apartmentId: payment.apartmentId,
                    fundId,
                  },
                ]
              : []),
          ],
        },
        tx,
      );
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

  async previewBankImport(
    csv: string,
    buildingId?: string,
    format?: string,
  ) {
    if (!csv?.trim()) {
      throw new BadRequestException('Порожній файл виписки');
    }

    const fmt = (format?.trim() || 'auto') as StatementFormat;
    if (!STATEMENT_FORMATS.includes(fmt)) {
      throw new BadRequestException(
        `Невідомий format. Доступні: ${STATEMENT_FORMATS.join(', ')}`,
      );
    }

    const apartments = await this.prisma.apartment.findMany({
      where: buildingId ? { buildingId } : undefined,
      select: { id: true, number: true, entrance: true },
      orderBy: [{ entrance: 'asc' }, { number: 'asc' }],
    });

    const residents = await this.prisma.resident.findMany({
      where: buildingId
        ? { apartment: { buildingId } }
        : undefined,
      select: {
        firstName: true,
        lastName: true,
        iban: true,
        apartment: { select: { id: true, number: true } },
      },
    });

    const { rows: parsed, format: usedFormat, detectedFormat } = parseBankStatement(
      csv,
      { format: fmt },
    );
    // Enrich counterparty IBAN from purpose when column missing
    const withIban = parsed.map((r) => ({
      ...r,
      counterpartyIban:
        r.counterpartyIban ??
        (r.reference.match(/UA\d{2}[\d\s]{20,}/i)
          ? r.reference.replace(/\s/g, '').match(/UA\d{27}/i)?.[0] ?? null
          : null),
    }));
    const rows = matchStatementRows(withIban, {
      apartments,
      residents: residents.map((r) => ({
        apartmentId: r.apartment.id,
        apartmentNumber: r.apartment.number,
        firstName: r.firstName,
        lastName: r.lastName,
        iban: r.iban,
      })),
    });

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

    return {
      rows: enriched,
      summary,
      format: usedFormat,
      detectedFormat,
      formats: STATEMENT_FORMATS,
    };
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

  async getDebtorsReport(buildingId?: string, tenantId?: string | null) {
    const lines = await this.prisma.accrualLine.findMany({
      where: {
        status: {
          in: [
            AccrualLineStatus.open,
            AccrualLineStatus.partially_paid,
            AccrualLineStatus.overdue,
          ],
        },
        ...(buildingId
          ? {
              apartment: {
                buildingId,
                ...(tenantId ? { building: { tenantId } } : {}),
              },
            }
          : tenantId
            ? { apartment: { building: { tenantId } } }
            : {}),
      },
      include: {
        apartment: { select: { number: true, entrance: true, buildingId: true } },
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
        buildingId: string;
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
        buildingId: line.apartment.buildingId,
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
