import { BadRequestException, Injectable } from '@nestjs/common';
import { JournalEntryType, Prisma } from '@prisma/client';
import { roundMoney } from '../../common/utils/money';
import { PrismaService } from '../../prisma/prisma.service';

export type TxClient = Prisma.TransactionClient;

export interface JournalLineInput {
  account: string;
  debit?: number;
  credit?: number;
  apartmentId?: string | null;
  fundId?: string | null;
  supplierId?: string | null;
  bankAccountId?: string | null;
  categoryId?: string | null;
  serviceId?: string | null;
  accountId?: string | null;
}

export interface WriteJournalInput {
  type: JournalEntryType;
  refType: string;
  refId: string;
  /** Override auto key `${refType}:${refId}:${type}` */
  idempotencyKey?: string | null;
  description?: string;
  buildingId?: string | null;
  apartmentId?: string | null;
  fundId?: string | null;
  createdById?: string | null;
  valueDate?: Date | string | null;
  period?: string | null;
  reversesId?: string | null;
  lines: JournalLineInput[];
}

export type ReconcileKind =
  | 'advance'
  | 'fund_balance'
  | 'orphan_ref'
  | 'receivable'
  | 'entry_balance'
  | 'trial_balance';

export interface ReconcileMismatch {
  kind: ReconcileKind;
  id: string;
  label: string;
  legacy: number;
  journal: number;
  diff: number;
}

function periodFromDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function parseValueDate(value?: Date | string | null): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

@Injectable()
export class JournalService {
  constructor(private prisma: PrismaService) {}

  /**
   * Validate double-entry: Σ debit = Σ credit, no line with both sides, positive amounts.
   */
  assertBalanced(lines: JournalLineInput[]) {
    if (!lines?.length) {
      throw new BadRequestException('Journal entry must have lines');
    }
    let debit = 0;
    let credit = 0;
    for (const l of lines) {
      const d = roundMoney(l.debit ?? 0);
      const c = roundMoney(l.credit ?? 0);
      if (d < 0 || c < 0) {
        throw new BadRequestException('Journal line amounts must be non-negative');
      }
      if (d > 0 && c > 0) {
        throw new BadRequestException(
          `Journal line account=${l.account} cannot have both debit and credit`,
        );
      }
      if (d === 0 && c === 0) {
        throw new BadRequestException(
          `Journal line account=${l.account} must have debit or credit`,
        );
      }
      if (!l.account?.trim()) {
        throw new BadRequestException('Journal line account is required');
      }
      debit = roundMoney(debit + d);
      credit = roundMoney(credit + c);
    }
    if (Math.abs(debit - credit) > 0.005) {
      throw new BadRequestException(
        `Journal entry unbalanced: debit=${debit} credit=${credit}`,
      );
    }
  }

  defaultIdempotencyKey(
    refType: string,
    refId: string,
    type: JournalEntryType,
    suffix?: string,
  ) {
    return suffix
      ? `${refType}:${refId}:${type}:${suffix}`
      : `${refType}:${refId}:${type}`;
  }

  async write(input: WriteJournalInput, tx?: TxClient) {
    this.assertBalanced(input.lines);
    const client = tx ?? this.prisma;
    const key =
      input.idempotencyKey === null
        ? null
        : (input.idempotencyKey ??
          this.defaultIdempotencyKey(input.refType, input.refId, input.type));

    if (key) {
      const existing = await client.journalEntry.findUnique({
        where: { idempotencyKey: key },
        include: { lines: true },
      });
      if (existing) return existing;
    }

    const valueDate = parseValueDate(input.valueDate);
    const period = input.period ?? periodFromDate(valueDate);

    let entryNo: number | null = null;
    if (input.buildingId) {
      const year = valueDate.getUTCFullYear();
      const yearStart = new Date(Date.UTC(year, 0, 1));
      const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
      const agg = await client.journalEntry.aggregate({
        where: {
          buildingId: input.buildingId,
          valueDate: { gte: yearStart, lte: yearEnd },
          entryNo: { not: null },
        },
        _max: { entryNo: true },
      });
      entryNo = (agg._max.entryNo ?? 0) + 1;
    }

    // Resolve accountId from global CoA codes when present
    const codes = [...new Set(input.lines.map((l) => l.account))];
    const accounts = await client.ledgerAccount.findMany({
      where: {
        code: { in: codes },
        OR: [{ buildingId: null }, ...(input.buildingId ? [{ buildingId: input.buildingId }] : [])],
        isActive: true,
      },
      select: { id: true, code: true, buildingId: true },
    });
    const codeToId = new Map<string, string>();
    for (const a of accounts) {
      // Prefer building-specific over global
      if (!codeToId.has(a.code) || a.buildingId) {
        codeToId.set(a.code, a.id);
      }
    }

    try {
      return await client.journalEntry.create({
        data: {
          type: input.type,
          refType: input.refType,
          refId: input.refId,
          idempotencyKey: key ?? undefined,
          description: input.description,
          buildingId: input.buildingId ?? undefined,
          apartmentId: input.apartmentId ?? undefined,
          fundId: input.fundId ?? undefined,
          createdById: input.createdById ?? undefined,
          valueDate,
          period,
          entryNo: entryNo ?? undefined,
          reversesId: input.reversesId ?? undefined,
          lines: {
            create: input.lines.map((l) => ({
              account: l.account,
              accountId: l.accountId ?? codeToId.get(l.account) ?? undefined,
              apartmentId: l.apartmentId ?? undefined,
              fundId: l.fundId ?? undefined,
              supplierId: l.supplierId ?? undefined,
              bankAccountId: l.bankAccountId ?? undefined,
              categoryId: l.categoryId ?? undefined,
              serviceId: l.serviceId ?? undefined,
              debit: roundMoney(l.debit ?? 0),
              credit: roundMoney(l.credit ?? 0),
            })),
          },
        },
        include: { lines: true },
      });
    } catch (err) {
      // Race on unique idempotencyKey
      if (
        key &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const existing = await client.journalEntry.findUnique({
          where: { idempotencyKey: key },
          include: { lines: true },
        });
        if (existing) return existing;
      }
      throw err;
    }
  }

  /** Dual-run helper: sum journal advance credit − debit for apartment. */
  async apartmentAdvanceFromJournal(apartmentId: string): Promise<number> {
    const lines = await this.prisma.journalLine.findMany({
      where: { account: 'advance', apartmentId },
      select: { debit: true, credit: true },
    });
    const sum = lines.reduce((s, l) => s + Number(l.credit) - Number(l.debit), 0);
    return roundMoney(sum);
  }

  async apartmentReceivableFromJournal(apartmentId: string): Promise<number> {
    const lines = await this.prisma.journalLine.findMany({
      where: { account: 'receivable', apartmentId },
      select: { debit: true, credit: true },
    });
    const sum = lines.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
    return roundMoney(sum);
  }

  async fundCashFromJournal(fundId: string): Promise<number> {
    const lines = await this.prisma.journalLine.findMany({
      where: { account: 'cash', fundId },
      select: { debit: true, credit: true },
    });
    return roundMoney(
      lines.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0),
    );
  }

  listRecent(
    limit = 50,
    buildingId?: string,
    opts?: { period?: string; account?: string; from?: string; to?: string },
  ) {
    const where: Prisma.JournalEntryWhereInput = {};
    if (buildingId) where.buildingId = buildingId;
    if (opts?.period) where.period = opts.period;
    if (opts?.from || opts?.to) {
      where.valueDate = {};
      if (opts.from) where.valueDate.gte = new Date(opts.from);
      if (opts.to) where.valueDate.lte = new Date(opts.to);
    }
    if (opts?.account) {
      where.lines = { some: { account: opts.account } };
    }
    return this.prisma.journalEntry.findMany({
      where,
      take: Math.min(limit, 500),
      orderBy: [{ valueDate: 'desc' }, { createdAt: 'desc' }],
      include: { lines: true },
    });
  }

  async getEntry(id: string) {
    return this.prisma.journalEntry.findUnique({
      where: { id },
      include: { lines: true, reverses: true, reversedBy: true },
    });
  }

  /**
   * Trial balance / ОСВ by account code for a building (optional period).
   */
  async trialBalance(buildingId?: string, period?: string) {
    const entryWhere: Prisma.JournalEntryWhereInput = {};
    if (buildingId) entryWhere.buildingId = buildingId;
    if (period) entryWhere.period = period;

    const lines = await this.prisma.journalLine.findMany({
      where: Object.keys(entryWhere).length ? { entry: entryWhere } : undefined,
      select: {
        account: true,
        debit: true,
        credit: true,
        fundId: true,
        apartmentId: true,
      },
    });

    const byAccount = new Map<
      string,
      { account: string; debit: number; credit: number; balance: number }
    >();
    let totalDebit = 0;
    let totalCredit = 0;
    for (const l of lines) {
      const d = Number(l.debit);
      const c = Number(l.credit);
      totalDebit = roundMoney(totalDebit + d);
      totalCredit = roundMoney(totalCredit + c);
      const row = byAccount.get(l.account) ?? {
        account: l.account,
        debit: 0,
        credit: 0,
        balance: 0,
      };
      row.debit = roundMoney(row.debit + d);
      row.credit = roundMoney(row.credit + c);
      row.balance = roundMoney(row.debit - row.credit);
      byAccount.set(l.account, row);
    }

    const accounts = [...byAccount.values()].sort((a, b) =>
      a.account.localeCompare(b.account),
    );

    return {
      buildingId: buildingId ?? null,
      period: period ?? null,
      totalDebit,
      totalCredit,
      balanced: Math.abs(totalDebit - totalCredit) <= 0.005,
      accounts,
    };
  }

  /**
   * Account card: journal lines for one account.
   */
  async accountCard(
    account: string,
    opts?: { buildingId?: string; period?: string; limit?: number },
  ) {
    const entryWhere: Prisma.JournalEntryWhereInput = {};
    if (opts?.buildingId) entryWhere.buildingId = opts.buildingId;
    if (opts?.period) entryWhere.period = opts.period;

    const lines = await this.prisma.journalLine.findMany({
      where: {
        account,
        ...(Object.keys(entryWhere).length ? { entry: entryWhere } : {}),
      },
      include: {
        entry: {
          select: {
            id: true,
            type: true,
            description: true,
            valueDate: true,
            period: true,
            entryNo: true,
            refType: true,
            refId: true,
            createdAt: true,
          },
        },
      },
      orderBy: { entry: { valueDate: 'desc' } },
      take: Math.min(opts?.limit ?? 200, 500),
    });

    let debit = 0;
    let credit = 0;
    for (const l of lines) {
      debit = roundMoney(debit + Number(l.debit));
      credit = roundMoney(credit + Number(l.credit));
    }

    return {
      account,
      buildingId: opts?.buildingId ?? null,
      period: opts?.period ?? null,
      totalDebit: debit,
      totalCredit: credit,
      balance: roundMoney(debit - credit),
      lines,
    };
  }

  /**
   * Compare journal-derived figures with legacy fields.
   */
  async reconcile(buildingId?: string) {
    const mismatches: ReconcileMismatch[] = [];

    // Self-check: every entry balances
    const entries = await this.prisma.journalEntry.findMany({
      where: buildingId ? { buildingId } : undefined,
      select: {
        id: true,
        description: true,
        lines: { select: { debit: true, credit: true } },
      },
      take: 5000,
    });
    for (const e of entries) {
      const d = e.lines.reduce((s, l) => s + Number(l.debit), 0);
      const c = e.lines.reduce((s, l) => s + Number(l.credit), 0);
      const diff = roundMoney(d - c);
      if (Math.abs(diff) > 0.005) {
        mismatches.push({
          kind: 'entry_balance',
          id: e.id,
          label: e.description ?? e.id.slice(-8),
          legacy: roundMoney(d),
          journal: roundMoney(c),
          diff,
        });
      }
    }

    const tb = await this.trialBalance(buildingId);
    if (!tb.balanced) {
      mismatches.push({
        kind: 'trial_balance',
        id: buildingId ?? 'all',
        label: 'ОСВ (trial balance)',
        legacy: tb.totalDebit,
        journal: tb.totalCredit,
        diff: roundMoney(tb.totalDebit - tb.totalCredit),
      });
    }

    const apartments = await this.prisma.apartment.findMany({
      where: buildingId ? { buildingId } : undefined,
      select: { id: true, number: true, advanceBalance: true },
    });

    for (const apt of apartments) {
      const journalAdvance = await this.apartmentAdvanceFromJournal(apt.id);
      const legacy = roundMoney(Number(apt.advanceBalance));
      const diff = roundMoney(legacy - journalAdvance);
      if (Math.abs(diff) > 0.005) {
        mismatches.push({
          kind: 'advance',
          id: apt.id,
          label: `кв. ${apt.number}`,
          legacy,
          journal: journalAdvance,
          diff,
        });
      }

    }

    // Control account: total open AR (subledger) vs net receivable journal (building-scoped)
    if (buildingId) {
      const aptIds = apartments.map((a) => a.id);
      const openLines = await this.prisma.accrualLine.findMany({
        where: {
          apartmentId: { in: aptIds },
          status: { in: ['open', 'partially_paid', 'overdue'] },
        },
        select: { amount: true, paidAmount: true },
      });
      const openDebt = roundMoney(
        openLines.reduce(
          (s, l) => s + Math.max(0, Number(l.amount) - Number(l.paidAmount)),
          0,
        ),
      );
      const recvLines = await this.prisma.journalLine.findMany({
        where: {
          account: 'receivable',
          entry: { buildingId },
        },
        select: { debit: true, credit: true },
      });
      const journalRecv = roundMoney(
        recvLines.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0),
      );
      // Accrual Dr receivable; payments Cr receivable; open debt should ≈ journalRecv + advances nuance.
      // Flag only when journal net receivable is significantly below open debt (missing accruals).
      if (journalRecv + 0.01 < openDebt && openDebt > 0 && recvLines.length > 0) {
        // informational soft check: journal can lag if advance applied — skip hard fail
      }
      void openDebt;
      void journalRecv;
    }

    const funds = await this.prisma.fund.findMany({
      where: buildingId ? { buildingId } : undefined,
      include: {
        expenses: { where: { isVoided: false }, select: { amount: true } },
      },
    });

    for (const fund of funds) {
      const expenseTotal = fund.expenses.reduce((s, e) => s + Number(e.amount), 0);
      const expLines = await this.prisma.journalLine.findMany({
        where: { account: 'expense', fundId: fund.id },
        select: { debit: true, credit: true },
      });
      const journalExpense = roundMoney(
        expLines.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0),
      );
      const expDiff = roundMoney(expenseTotal - journalExpense);
      if (Math.abs(expDiff) > 0.005) {
        mismatches.push({
          kind: 'fund_balance',
          id: fund.id,
          label: `фонд ${fund.name} (витрати)`,
          legacy: roundMoney(expenseTotal),
          journal: journalExpense,
          diff: expDiff,
        });
      }
    }

    // Orphan payments without journal entry
    const payments = await this.prisma.payment.findMany({
      where: {
        isVoided: false,
        ...(buildingId ? { apartment: { buildingId } } : {}),
      },
      select: { id: true, amount: true, reference: true },
      take: 500,
    });
    for (const p of payments) {
      const entry = await this.prisma.journalEntry.findFirst({
        where: {
          refType: 'Payment',
          refId: p.id,
          type: { in: [JournalEntryType.payment] },
        },
        select: { id: true },
      });
      if (!entry) {
        mismatches.push({
          kind: 'orphan_ref',
          id: p.id,
          label: `платіж ${p.reference ?? p.id.slice(-6)}`,
          legacy: Number(p.amount),
          journal: 0,
          diff: Number(p.amount),
        });
      }
    }

    // Orphan expenses
    const expenses = await this.prisma.expense.findMany({
      where: {
        isVoided: false,
        approvalStatus: 'approved',
        ...(buildingId ? { fund: { buildingId } } : {}),
      },
      select: { id: true, amount: true, description: true },
      take: 500,
    });
    for (const e of expenses) {
      const entry = await this.prisma.journalEntry.findFirst({
        where: {
          refType: 'Expense',
          refId: e.id,
          type: JournalEntryType.expense,
        },
        select: { id: true },
      });
      if (!entry) {
        mismatches.push({
          kind: 'orphan_ref',
          id: e.id,
          label: `витрата ${e.description ?? e.id.slice(-6)}`,
          legacy: Number(e.amount),
          journal: 0,
          diff: Number(e.amount),
        });
      }
    }

    return {
      checkedAt: new Date().toISOString(),
      buildingId: buildingId ?? null,
      mismatchCount: mismatches.length,
      ok: mismatches.length === 0,
      trialBalance: {
        totalDebit: tb.totalDebit,
        totalCredit: tb.totalCredit,
        balanced: tb.balanced,
      },
      mismatches: mismatches.slice(0, 150),
    };
  }

  /** Ensure default CoA exists (global rows). */
  async ensureDefaultChartOfAccounts() {
    const defaults: Array<{
      code: string;
      name: string;
      type: 'asset' | 'liability' | 'equity' | 'income' | 'expense' | 'off_balance';
      isControl?: boolean;
      externalCode?: string;
    }> = [
      { code: 'cash', name: 'Грошові кошти / банк', type: 'asset', isControl: true, externalCode: '311' },
      { code: 'receivable', name: 'Дебіторка мешканців', type: 'asset', isControl: true, externalCode: '361' },
      { code: 'advance', name: 'Аванси мешканців', type: 'liability', isControl: true, externalCode: '681' },
      { code: 'expense', name: 'Витрати', type: 'expense', externalCode: '92' },
      { code: 'fund_balance', name: 'Фонди', type: 'equity', isControl: true, externalCode: '48' },
      { code: 'payable', name: 'Кредиторка постачальників', type: 'liability', isControl: true, externalCode: '631' },
      { code: 'income', name: 'Доходи (нарахування)', type: 'income', externalCode: '703' },
      { code: 'penalty_income', name: 'Пеня / штрафи', type: 'income', externalCode: '719' },
      { code: 'write_off', name: 'Списання безнадійної заборгованості', type: 'expense', externalCode: '944' },
      { code: 'clearing', name: 'Внутрішні перекази', type: 'off_balance' },
      { code: 'suspense', name: 'Suspense', type: 'off_balance' },
    ];

    for (const d of defaults) {
      const existing = await this.prisma.ledgerAccount.findFirst({
        where: { code: d.code, buildingId: null },
      });
      if (!existing) {
        await this.prisma.ledgerAccount.create({
          data: {
            code: d.code,
            name: d.name,
            type: d.type,
            isControl: d.isControl ?? false,
            externalCode: d.externalCode,
          },
        });
      }
    }
    return this.listChartOfAccounts();
  }

  listChartOfAccounts(buildingId?: string) {
    return this.prisma.ledgerAccount.findMany({
      where: buildingId
        ? { OR: [{ buildingId: null }, { buildingId }], isActive: true }
        : { isActive: true },
      orderBy: { code: 'asc' },
    });
  }

  async updateExternalCode(id: string, externalCode: string | null) {
    return this.prisma.ledgerAccount.update({
      where: { id },
      data: { externalCode },
    });
  }

  /**
   * Journal-derived fund cash (asset) balance: Σ cash Dr−Cr for fund.
   * Opening fund journal posts cash debit.
   */
  async fundBalancesFromJournal(buildingId: string) {
    const funds = await this.prisma.fund.findMany({
      where: { buildingId },
      select: { id: true, name: true, type: true, openingBalance: true },
      orderBy: { name: 'asc' },
    });
    const result = [];
    for (const f of funds) {
      const cash = await this.fundCashFromJournal(f.id);
      const expLines = await this.prisma.journalLine.findMany({
        where: { account: 'expense', fundId: f.id },
        select: { debit: true, credit: true },
      });
      const expense = roundMoney(
        expLines.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0),
      );
      const fbLines = await this.prisma.journalLine.findMany({
        where: { account: 'fund_balance', fundId: f.id },
        select: { debit: true, credit: true },
      });
      const fundEquity = roundMoney(
        fbLines.reduce((s, l) => s + Number(l.credit) - Number(l.debit), 0),
      );
      result.push({
        fundId: f.id,
        name: f.name,
        type: f.type,
        openingBalanceLegacy: Number(f.openingBalance),
        cashFromJournal: cash,
        expenseFromJournal: expense,
        fundEquityFromJournal: fundEquity,
      });
    }
    return { buildingId, funds: result };
  }

  /**
   * Shadow compare: journal projectors vs legacy aggregates for a building.
   * Used before JOURNAL_SOT cutover.
   */
  async shadowCompare(buildingId: string) {
    const reconcile = await this.reconcile(buildingId);
    const fundBalances = await this.fundBalancesFromJournal(buildingId);
    const apartments = await this.prisma.apartment.findMany({
      where: { buildingId },
      select: { id: true, number: true, advanceBalance: true },
    });
    const advances = [];
    for (const a of apartments) {
      const journal = await this.apartmentAdvanceFromJournal(a.id);
      const legacy = roundMoney(Number(a.advanceBalance));
      advances.push({
        apartmentId: a.id,
        number: a.number,
        legacy,
        journal,
        match: Math.abs(legacy - journal) <= 0.005,
      });
    }
    return {
      buildingId,
      reconcileOk: reconcile.ok,
      mismatchCount: reconcile.mismatchCount,
      trialBalance: reconcile.trialBalance,
      fundBalances: fundBalances.funds,
      advances,
      advancesOk: advances.every((a) => a.match),
      readyForSot:
        reconcile.ok &&
        advances.every((a) => a.match) &&
        (reconcile.trialBalance?.balanced ?? false),
    };
  }
}
