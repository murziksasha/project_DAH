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
import { PostingService } from '../journal/posting.service';
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

    await this.periods.assertAllowsMutation(
      apartment.buildingId,
      dto.date,
      'payment',
    );

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

    void domainEvents.emit('payment.allocated', {
      paymentId: payment.id,
      apartmentId: dto.apartmentId,
      amount: dto.amount,
    });

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

    await this.periods.assertAllowsMutation(
      payment.apartment.buildingId,
      payment.date,
      'void_payment',
    );

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
    userId?: string,
    sourceFileName?: string,
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

    const aliases = buildingId
      ? await this.prisma.ibanApartmentAlias.findMany({
          where: { buildingId },
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

  /** Ignore a bank statement line (won't import). */
  async ignoreStatementLine(lineId: string, user: AuthUser) {
    const line = await this.prisma.bankStatementLine.findUnique({
      where: { id: lineId },
    });
    if (!line) throw new NotFoundException('Рядок виписки не знайдено');
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
  async unmatchedStatementReport(buildingId?: string, days = 30) {
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
        ...(buildingId ? { statement: { buildingId } } : {}),
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
  ) {
    const line = await this.prisma.bankStatementLine.findUnique({
      where: { id: lineId },
      include: { statement: true },
    });
    if (!line) throw new NotFoundException('Рядок виписки не знайдено');
    if (line.paymentId) {
      throw new BadRequestException('Рядок уже імпортовано як платіж');
    }

    const apartment = await this.prisma.apartment.findUnique({
      where: { id: apartmentId },
    });
    if (!apartment) throw new NotFoundException('Квартиру не знайдено');

    const iban = normalizeIban(line.counterpartyIban);
    const buildingId = line.statement.buildingId ?? apartment.buildingId;

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
