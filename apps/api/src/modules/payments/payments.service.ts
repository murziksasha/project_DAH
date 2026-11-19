import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccrualLineStatus,
  BankStatementLineStatus,
  BankStatementStatus,
  JournalEntryType,
  PaymentSource,
  Prisma,
  UserRole,
} from '@prisma/client';
import { createHash } from 'crypto';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import {
  matchStatementRows,
  normalizeIban,
  parseBankStatement,
  STATEMENT_FORMATS,
  type StatementFormat,
} from '../../common/utils/bank-statement-import';
import {
  FifoLineInput,
  planFifoAllocation,
  resolveAccrualLineStatus,
} from '../../common/utils/fifo-allocation';
import { planManualAllocation } from '../../common/utils/manual-allocation';
import { roundMoney } from '../../common/utils/money';
import { normalizePage, toPageResult } from '../../common/utils/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { domainEvents } from '../../common/utils/domain-events';
import { AccountingPeriodsService } from '../accounting-periods/accounting-periods.service';
import { AuditService } from '../audit/audit.service';
import { JournalService } from '../journal/journal.service';
import { PostingService, buildPaymentLines } from '../journal/posting.service';
import type { JournalLineInput } from '../journal/journal.service';
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

function mapLineStatus(
  status: string,
): BankStatementLineStatus {
  switch (status) {
    case 'matched':
      return BankStatementLineStatus.matched;
    case 'skipped':
      return BankStatementLineStatus.skipped;
    case 'invalid':
      return BankStatementLineStatus.invalid;
    case 'manual':
      return BankStatementLineStatus.manual;
    case 'imported':
      return BankStatementLineStatus.imported;
    case 'ignored':
      return BankStatementLineStatus.ignored;
    default:
      return BankStatementLineStatus.unmatched;
  }
}

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private mail: MailService,
    private journal: JournalService,
    private posting: PostingService,
    private periods: AccountingPeriodsService,
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
      if (user.role !== UserRole.super_admin) {
        if (!user.tenantId) throw new ForbiddenException('Немає активної організації');
        where.apartment = {
          ...((where.apartment as object) ?? {}),
          building: { tenantId: user.tenantId },
        };
      } else if (opts?.tenantId) {
        where.apartment = {
          ...((where.apartment as object) ?? {}),
          building: { tenantId: opts.tenantId },
        };
      }
      if (opts?.buildingId) {
        where.apartment = {
          ...((where.apartment as object) ?? {}),
          buildingId: opts.buildingId,
        };
      }
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
        apartment: { include: { building: true } },
        allocations: {
          include: {
            accrualLine: { include: { accrual: true } },
          },
        },
      },
    });

    if (!payment) throw new NotFoundException('Платіж не знайдено');

    if (user.role !== UserRole.super_admin) {
      if (!user.tenantId || (payment.apartment?.building && payment.apartment.building.tenantId !== user.tenantId)) {
        throw new ForbiddenException('Немає доступу до цього платежу (інша організація)');
      }
    }

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

  async previewAllocation(apartmentId: string, amount: number, user?: AuthUser) {
    const apartment = await this.prisma.apartment.findUnique({
      where: { id: apartmentId },
      include: { building: true },
    });
    if (!apartment) throw new NotFoundException('Квартиру не знайдено');

    if (user && user.role !== UserRole.super_admin) {
      if (!user.tenantId || (apartment.building && apartment.building.tenantId !== user.tenantId)) {
        throw new ForbiddenException('Немає доступу до цієї квартири (інша організація)');
      }
    }

    const { allocations, advance } = await this.planAllocation(apartmentId, amount);

    return {
      apartment: { id: apartment.id, number: apartment.number },
      amount,
      allocations,
      advance,
      totalAllocated: roundMoney(allocations.reduce((s, a) => s + a.amount, 0)),
    };
  }

  async createPayment(
    dto: CreatePaymentDto,
    user: AuthUser,
    txClient?: Prisma.TransactionClient,
  ) {
    const userId = user.id;
    const client = txClient ?? this.prisma;
    const apartment = await client.apartment.findUnique({
      where: { id: dto.apartmentId },
      include: { building: true },
    });
    if (!apartment) throw new NotFoundException('Квартиру не знайдено');

    if (user.role !== UserRole.super_admin) {
      if (!user.tenantId || (apartment.building && apartment.building.tenantId !== user.tenantId)) {
        throw new ForbiddenException('Немає доступу до цієї квартири / організації');
      }
    }

    const executeInTx = async (tx: Prisma.TransactionClient) => {
      // 1. Period check under transaction lock
      await this.periods.assertAllowsMutation(
        apartment.buildingId,
        dto.date,
        'payment',
        tx,
      );

      // 2. Order lock if reference matches an online order
      if (dto.reference) {
        if (typeof tx.$queryRaw === 'function') {
          await tx.$queryRaw`SELECT id FROM "OnlinePaymentOrder" WHERE "orderId" = ${dto.reference} FOR UPDATE`;
        }
      }

      // 3. Apartment row lock
      if (typeof tx.$queryRaw === 'function') {
        await tx.$queryRaw`SELECT id FROM "Apartment" WHERE id = ${dto.apartmentId} FOR UPDATE`;
      }

      // 4. Open accrual lines row lock
      let lockedLines: Array<{
        id: string;
        amount: Prisma.Decimal;
        paidAmount: Prisma.Decimal;
        dueDate: Date | null;
        period: string;
        title: string;
        fundId: string;
      }> = [];

      if (typeof tx.$queryRaw === 'function') {
        lockedLines = await tx.$queryRaw<
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
      }

      if (!lockedLines.length) {
        const found = await tx.accrualLine.findMany({
          where: {
            apartmentId: dto.apartmentId,
            status: { in: ['open', 'partially_paid', 'overdue'] },
          },
          include: { accrual: true },
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
        });
        lockedLines = found.map((f) => ({
          id: f.id,
          amount: f.amount,
          paidAmount: f.paidAmount,
          dueDate: f.dueDate,
          period: f.accrual.period,
          title: f.accrual.title,
          fundId: f.accrual.fundId,
        }));
      }

      const fifoLines: FifoLineInput[] = lockedLines.map((line) => ({
        id: line.id,
        amount: Number(line.amount),
        paidAmount: Number(line.paidAmount),
        dueDate: line.dueDate,
        period: line.period,
        title: line.title,
      }));

      let allocations;
      let advance: number;
      if (dto.allocations?.length) {
        const manual = planManualAllocation(
          fifoLines,
          dto.amount,
          dto.allocations.map((a) => ({
            accrualLineId: a.accrualLineId,
            amount: a.amount,
          })),
        );
        if (manual.errors.length) {
          throw new BadRequestException(manual.errors.join('; '));
        }
        allocations = manual.allocations;
        advance = manual.advance;
      } else {
        const fifo = planFifoAllocation(fifoLines, dto.amount);
        allocations = fifo.allocations;
        advance = fifo.advance;
      }

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
      const fundId =
        lockedLines.find((l) => allocations.some((a) => a.accrualLineId === l.id))
          ?.fundId ??
        lockedLines[0]?.fundId ??
        null;

      // M4: receivable/cash split per fund of the allocated accrual lines.
      const byFund = new Map<string | null, number>();
      for (const a of allocations) {
        const f = lockedLines.find((l) => l.id === a.accrualLineId)?.fundId ?? null;
        byFund.set(f, roundMoney((byFund.get(f) ?? 0) + a.amount));
      }
      const fundSplit = [...byFund.entries()].map(([fid, amount]) => ({ fundId: fid, amount }));

      await this.posting.postPayment(
        created.id,
        dto.amount,
        totalAllocated,
        advance,
        {
          buildingId: apartment.buildingId,
          apartmentId: dto.apartmentId,
          fundId,
          createdById: userId,
          valueDate: dto.date,
          description: `Платіж ${dto.amount} грн, кв. ${apartment.number}${
            dto.allocations?.length ? ' (ручна розноска)' : ''
          }`,
        },
        tx,
        fundSplit,
      );

      return created;
    };

    const payment = txClient
      ? await executeInTx(txClient)
      : typeof this.prisma.$transaction === 'function'
        ? await this.prisma.$transaction(executeInTx)
        : await executeInTx(this.prisma as unknown as Prisma.TransactionClient);

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

    void domainEvents.emit('payment.allocated', {
      paymentId: payment.id,
      apartmentId: dto.apartmentId,
      amount: dto.amount,
    });

    return this.getPayment(payment.id, user);
  }

  /**
   * Journal lines that exactly reverse a payment: the inverted original posting
   * (keeps per-fund cash split) plus a reversal of advance later applied to accruals
   * (receivable Dr / advance Cr), so every account nets to zero.
   */
  private async buildVoidLines(
    tx: Prisma.TransactionClient,
    p: {
      paymentId: string;
      apartmentId: string;
      amount: number;
      allocated: number;
      advancePart: number;
      fundId: string | null;
      byFund: Map<string | null, number>;
    },
  ): Promise<JournalLineInput[]> {
    const original =
      typeof tx.journalEntry?.findUnique === 'function'
        ? await tx.journalEntry.findUnique({
            where: { idempotencyKey: `Payment:${p.paymentId}:${JournalEntryType.payment}` },
            include: { lines: true },
          })
        : null;
    if (!original?.lines?.length) {
      return buildPaymentLines(
        p.amount,
        p.allocated,
        p.advancePart,
        p.fundId,
        (f) => ({ apartmentId: p.apartmentId, fundId: f }),
        [...p.byFund.entries()].map(([f, amount]) => ({ fundId: f, amount })),
      ).map((l) => ({ ...l, debit: l.credit, credit: l.debit }));
    }
    const lines: JournalLineInput[] = original.lines.map((l) => ({
      account: l.account,
      debit: Number(l.credit) || undefined,
      credit: Number(l.debit) || undefined,
      apartmentId: l.apartmentId ?? p.apartmentId,
      fundId: l.fundId,
    }));
    const originallyAllocated = roundMoney(
      original.lines
        .filter((l) => l.account === 'receivable')
        .reduce((s, l) => s + Number(l.credit), 0),
    );
    const appliedLater = roundMoney(p.allocated - originallyAllocated);
    if (appliedLater > 0.005) {
      lines.push(
        { account: 'receivable', debit: appliedLater, apartmentId: p.apartmentId, fundId: p.fundId },
        { account: 'advance', credit: appliedLater, apartmentId: p.apartmentId, fundId: p.fundId },
      );
    }
    return lines;
  }

  async voidPayment(id: string, reason: string, userOrUserId: AuthUser | string) {
    const user: AuthUser | null = typeof userOrUserId === 'object' ? userOrUserId : null;
    const userId: string = typeof userOrUserId === 'string' ? userOrUserId : userOrUserId.id;

    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        allocations: { include: { accrualLine: { include: { accrual: true } } } },
        apartment: { include: { building: true } },
      },
    });
    if (!payment) throw new NotFoundException('Платіж не знайдено');
    if (payment.isVoided) throw new BadRequestException('Платіж вже анульовано');

    if (user && user.role !== UserRole.super_admin) {
      if (!user.tenantId || (payment.apartment?.building && payment.apartment.building.tenantId !== user.tenantId)) {
        throw new ForbiddenException('Немає доступу до цього платежу (інша організація)');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Check period under tx lock
      await this.periods.assertAllowsMutation(
        payment.apartment.buildingId,
        payment.date,
        'void_payment',
        tx,
      );

      // 2. Lock payment row to prevent concurrent void
      if (typeof tx.$queryRaw === 'function') {
        await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${id} FOR UPDATE`;
      }

      const freshPayment = await tx.payment.findUnique({
        where: { id },
        include: { allocations: true },
      });
      if (!freshPayment || freshPayment.isVoided) {
        throw new BadRequestException('Платіж вже анульовано');
      }

      // 3. Lock apartment row
      if (typeof tx.$queryRaw === 'function') {
        await tx.$queryRaw`SELECT id, "advanceBalance" FROM "Apartment" WHERE id = ${payment.apartmentId} FOR UPDATE`;
      }

      // 4. Lock and re-read current accrual lines to avoid using stale snapshots
      const lineIds = freshPayment.allocations.map((a) => a.accrualLineId);
      let lockedLines: Array<{
        id: string;
        amount: Prisma.Decimal;
        paidAmount: Prisma.Decimal;
        dueDate: Date | null;
      }> = [];

      if (lineIds.length && typeof tx.$queryRaw === 'function') {
        lockedLines = await tx.$queryRaw<
          Array<{
            id: string;
            amount: Prisma.Decimal;
            paidAmount: Prisma.Decimal;
            dueDate: Date | null;
          }>
        >`
          SELECT id, amount, "paidAmount", "dueDate"
          FROM "AccrualLine"
          WHERE id IN (${Prisma.join(lineIds)})
          FOR UPDATE
        `;
      }

      if (lineIds.length && !lockedLines.length) {
        lockedLines = await tx.accrualLine.findMany({
          where: { id: { in: lineIds } },
          select: { id: true, amount: true, paidAmount: true, dueDate: true },
        });
      }

      for (const alloc of freshPayment.allocations) {
        const line =
          lockedLines.find((l) => l.id === alloc.accrualLineId) ??
          (await tx.accrualLine.findUnique({ where: { id: alloc.accrualLineId } }));
        if (line) {
          const currentPaid = Number(line.paidAmount);
          const newPaid = roundMoney(Math.max(0, currentPaid - Number(alloc.amount)));
          const lineAmount = Number(line.amount);
          await tx.accrualLine.update({
            where: { id: line.id },
            data: {
              paidAmount: newPaid,
              status: resolveAccrualLineStatus(lineAmount, newPaid, line.dueDate),
            },
          });
        }
      }

      const allocated = freshPayment.allocations.reduce((s, a) => s + Number(a.amount), 0);
      const advancePart = roundMoney(Math.max(0, Number(freshPayment.amount) - allocated));
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
      // Mirror of the (possibly fund-split) payment posting: reverse each side.
      const byFund = new Map<string | null, number>();
      for (const a of payment.allocations) {
        const f = a.accrualLine?.accrual?.fundId ?? null;
        byFund.set(f, roundMoney((byFund.get(f) ?? 0) + Number(a.amount)));
      }
      const voidLines = await this.buildVoidLines(tx, {
        paymentId: id,
        apartmentId: payment.apartmentId,
        amount: Number(payment.amount),
        allocated: roundMoney(allocated),
        advancePart,
        fundId,
        byFund,
      });
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
          lines: voidLines,
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

  /**
   * @param scope verified building scope: `buildingIds` = buildings the caller may match
   *   against (null = unrestricted platform admin), `tenantId` stored on the statement.
   */
  async previewBankImport(
    csv: string,
    buildingId?: string,
    format?: string,
    userId?: string,
    sourceFileName?: string,
    scope?: { buildingIds: string[] | null; tenantId: string | null },
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

    const buildingIds = buildingId ? [buildingId] : (scope?.buildingIds ?? null);
    const bWhere = buildingIds ? { buildingId: { in: buildingIds } } : undefined;
    const apartments = await this.prisma.apartment.findMany({
      where: bWhere,
      select: { id: true, number: true, entrance: true },
      orderBy: [{ entrance: 'asc' }, { number: 'asc' }],
    });

    const residents = await this.prisma.resident.findMany({
      where: bWhere ? { apartment: bWhere } : undefined,
      select: {
        firstName: true,
        lastName: true,
        iban: true,
        apartment: { select: { id: true, number: true } },
      },
    });

    const aliases = bWhere
      ? await this.prisma.ibanApartmentAlias.findMany({
          where: bWhere,
          select: { iban: true, apartmentId: true },
        })
      : [];
    const aliasAptIds = [...new Set(aliases.map((a) => a.apartmentId))];
    const aliasApts =
      aliasAptIds.length > 0
        ? await this.prisma.apartment.findMany({
            where: { id: { in: aliasAptIds } },
            select: { id: true, number: true },
          })
        : [];
    const aptNum = new Map(aliasApts.map((a) => [a.id, a.number]));

    const { rows: parsed, format: usedFormat, detectedFormat } = parseBankStatement(
      csv,
      { format: fmt },
    );
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
      ibanAliases: aliases.map((a) => ({
        iban: a.iban,
        apartmentId: a.apartmentId,
        apartmentNumber: aptNum.get(a.apartmentId) ?? '?',
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
              ...(bWhere ? { apartment: bWhere } : {}),
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

    const rawHash = createHash('sha256').update(csv).digest('hex');
    const statement = await this.prisma.bankStatement.create({
      data: {
        buildingId: buildingId ?? null,
        tenantId: scope?.tenantId ?? null,
        format: usedFormat,
        sourceFileName: sourceFileName ?? null,
        rawHash,
        status: BankStatementStatus.preview,
        lineCount: enriched.length,
        importedById: userId ?? null,
        lines: {
          create: enriched.map((row) => ({
            lineNo: row.line,
            date: row.date ? new Date(row.date) : null,
            amount: row.amount,
            reference: row.reference ?? '',
            counterpartyIban: row.counterpartyIban ?? null,
            extractedApartment: row.extractedApartment,
            raw: row.raw?.slice(0, 2000) ?? '',
            status: mapLineStatus(row.status),
            matchMethod: row.matchMethod ?? null,
            confidence: row.confidence ?? null,
            apartmentId: row.apartmentId,
            message: row.message ?? null,
          })),
        },
      },
      include: { lines: { orderBy: { lineNo: 'asc' } } },
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
      statementId: statement.id,
      rows: enriched.map((row, i) => ({
        ...row,
        lineId: statement.lines[i]?.id,
        confidence: row.confidence ?? null,
        matchMethod: row.matchMethod ?? null,
        candidates: row.candidates ?? [],
      })),
      summary,
      format: usedFormat,
      detectedFormat,
      formats: STATEMENT_FORMATS,
    };
  }

  /**
   * Statement line visible to the caller's organization (404 otherwise).
   * `tenantId` null = unrestricted platform admin.
   */
  private async loadScopedStatementLine(lineId: string, tenantId: string | null) {
    const line = await this.prisma.bankStatementLine.findUnique({
      where: { id: lineId },
      include: {
        statement: {
          select: {
            id: true,
            buildingId: true,
            tenantId: true,
            building: { select: { tenantId: true } },
          },
        },
      },
    });
    if (!line) throw new NotFoundException('Рядок виписки не знайдено');
    if (tenantId) {
      const owner = line.statement.tenantId ?? line.statement.building?.tenantId ?? null;
      if (owner !== tenantId) throw new NotFoundException('Рядок виписки не знайдено');
    }
    return line;
  }

  private async assertStatementScope(statementId: string, tenantId: string | null) {
    if (!tenantId) return;
    const st = await this.prisma.bankStatement.findUnique({
      where: { id: statementId },
      select: { tenantId: true, building: { select: { tenantId: true } } },
    });
    const owner = st ? (st.tenantId ?? st.building?.tenantId ?? null) : null;
    if (owner !== tenantId) throw new NotFoundException('Виписку не знайдено');
  }

  /** Ignore a bank statement line (won't import). */
  async ignoreStatementLine(lineId: string, user: AuthUser, tenantId: string | null = null) {
    const line = await this.loadScopedStatementLine(lineId, tenantId);
    if (line.paymentId) {
      throw new BadRequestException('Рядок уже імпортовано');
    }
    const updated = await this.prisma.bankStatementLine.update({
      where: { id: lineId },
      data: {
        status: BankStatementLineStatus.ignored,
        message: 'Проігноровано вручну',
        apartmentId: null,
        confidence: null,
        matchMethod: null,
      },
    });
    await this.audit.log({
      userId: user.id,
      action: 'bank_statement.line_ignore',
      entityType: 'BankStatementLine',
      entityId: lineId,
      payload: {},
    });
    return updated;
  }

  /** Unmatched / not-imported lines for the last N days. */
  async unmatchedStatementReport(
    buildingId?: string,
    days = 30,
    tenantId: string | null = null,
  ) {
    const since = new Date();
    since.setDate(since.getDate() - Math.min(Math.max(days, 1), 90));
    const lines = await this.prisma.bankStatementLine.findMany({
      where: {
        paymentId: null,
        status: {
          in: [
            BankStatementLineStatus.unmatched,
            BankStatementLineStatus.matched,
            BankStatementLineStatus.manual,
          ],
        },
        createdAt: { gte: since },
        ...(buildingId
          ? { statement: { buildingId } }
          : tenantId
            ? {
                statement: {
                  OR: [{ tenantId }, { tenantId: null, building: { tenantId } }],
                },
              }
            : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        statement: { select: { id: true, format: true, importedAt: true, buildingId: true } },
      },
    });
    return {
      days,
      since: since.toISOString(),
      count: lines.length,
      totalAmount: roundMoney(
        lines.reduce((s, l) => s + (l.amount != null ? Number(l.amount) : 0), 0),
      ),
      lines,
    };
  }

  /** Manual assign apartment on a preview line; learns IBAN alias. */
  async assignStatementLine(
    lineId: string,
    apartmentId: string,
    user: AuthUser,
    tenantId: string | null = null,
  ) {
    const line = await this.loadScopedStatementLine(lineId, tenantId);
    if (line.paymentId) {
      throw new BadRequestException('Рядок уже імпортовано як платіж');
    }

    const apartment = await this.prisma.apartment.findUnique({
      where: { id: apartmentId },
      include: { building: { select: { tenantId: true } } },
    });
    if (!apartment || (tenantId && apartment.building.tenantId !== tenantId)) {
      throw new NotFoundException('Квартиру не знайдено');
    }
    if (line.statement.buildingId && line.statement.buildingId !== apartment.buildingId) {
      throw new BadRequestException('Квартира не належить будинку цієї виписки');
    }

    const iban = normalizeIban(line.counterpartyIban);
    const buildingId = apartment.buildingId;

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.bankStatementLine.update({
        where: { id: lineId },
        data: {
          apartmentId,
          status: BankStatementLineStatus.manual,
          matchMethod: 'manual',
          confidence: 1,
          message: 'Призначено вручну',
        },
      });
      if (iban && buildingId) {
        await tx.ibanApartmentAlias.upsert({
          where: {
            buildingId_iban: { buildingId, iban },
          },
          create: { buildingId, iban, apartmentId },
          update: { apartmentId },
        });
      }
      return u;
    });

    await this.audit.log({
      userId: user.id,
      action: 'bank_statement.line_assign',
      entityType: 'BankStatementLine',
      entityId: lineId,
      payload: { apartmentId, iban },
    });

    return updated;
  }

  async importPayments(dto: ImportPaymentsDto, user: AuthUser, tenantId: string | null = null) {
    if (!dto.rows?.length) {
      throw new BadRequestException('Немає рядків для імпорту');
    }
    if (dto.statementId) await this.assertStatementScope(dto.statementId, tenantId);

    const source = dto.source ?? PaymentSource.bank;
    const created: string[] = [];
    const errors: Array<{ index: number; message: string }> = [];

    for (let i = 0; i < dto.rows.length; i++) {
      const row = dto.rows[i];
      try {
        // Validate the line before creating money (other org's line → 404, row skipped).
        if (row.lineId) await this.loadScopedStatementLine(row.lineId, tenantId);
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

        if (row.lineId) {
          const line = await this.prisma.bankStatementLine.findUnique({
            where: { id: row.lineId },
          });
          if (line && !line.paymentId) {
            await this.prisma.bankStatementLine.update({
              where: { id: row.lineId },
              data: {
                paymentId: payment.id,
                status: BankStatementLineStatus.imported,
                apartmentId: row.apartmentId,
              },
            });
            // Learn IBAN from successful import
            const iban = normalizeIban(line.counterpartyIban);
            const apt = await this.prisma.apartment.findUnique({
              where: { id: row.apartmentId },
              select: { buildingId: true },
            });
            if (iban && apt) {
              await this.prisma.ibanApartmentAlias.upsert({
                where: {
                  buildingId_iban: { buildingId: apt.buildingId, iban },
                },
                create: {
                  buildingId: apt.buildingId,
                  iban,
                  apartmentId: row.apartmentId,
                },
                update: { apartmentId: row.apartmentId },
              });
            }
          }
        }
      } catch (err) {
        errors.push({
          index: i,
          message: err instanceof Error ? err.message : 'Помилка імпорту',
        });
      }
    }

    if (dto.statementId) {
      const remaining = await this.prisma.bankStatementLine.count({
        where: {
          statementId: dto.statementId,
          status: {
            in: [
              BankStatementLineStatus.matched,
              BankStatementLineStatus.manual,
              BankStatementLineStatus.unmatched,
            ],
          },
          paymentId: null,
        },
      });
      const imported = await this.prisma.bankStatementLine.count({
        where: {
          statementId: dto.statementId,
          status: BankStatementLineStatus.imported,
        },
      });
      await this.prisma.bankStatement.update({
        where: { id: dto.statementId },
        data: {
          status:
            imported > 0 && remaining === 0
              ? BankStatementStatus.committed
              : imported > 0
                ? BankStatementStatus.partial
                : BankStatementStatus.preview,
          committedAt: remaining === 0 && imported > 0 ? new Date() : undefined,
        },
      });
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
        statementId: dto.statementId ?? null,
      },
    });

    return {
      created: created.length,
      failed: errors.length,
      paymentIds: created,
      errors,
      statementId: dto.statementId ?? null,
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
