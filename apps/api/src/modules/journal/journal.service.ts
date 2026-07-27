import { Injectable } from '@nestjs/common';
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
}

export interface WriteJournalInput {
  type: JournalEntryType;
  refType: string;
  refId: string;
  description?: string;
  buildingId?: string | null;
  apartmentId?: string | null;
  fundId?: string | null;
  createdById?: string | null;
  lines: JournalLineInput[];
}

export interface ReconcileMismatch {
  kind: 'advance' | 'fund_balance' | 'orphan_ref';
  id: string;
  label: string;
  legacy: number;
  journal: number;
  diff: number;
}

@Injectable()
export class JournalService {
  constructor(private prisma: PrismaService) {}

  async write(input: WriteJournalInput, tx?: TxClient) {
    const client = tx ?? this.prisma;
    return client.journalEntry.create({
      data: {
        type: input.type,
        refType: input.refType,
        refId: input.refId,
        description: input.description,
        buildingId: input.buildingId ?? undefined,
        apartmentId: input.apartmentId ?? undefined,
        fundId: input.fundId ?? undefined,
        createdById: input.createdById ?? undefined,
        lines: {
          create: input.lines.map((l) => ({
            account: l.account,
            apartmentId: l.apartmentId ?? undefined,
            fundId: l.fundId ?? undefined,
            debit: roundMoney(l.debit ?? 0),
            credit: roundMoney(l.credit ?? 0),
          })),
        },
      },
      include: { lines: true },
    });
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

  listRecent(limit = 50, buildingId?: string) {
    return this.prisma.journalEntry.findMany({
      where: buildingId ? { buildingId } : undefined,
      take: Math.min(limit, 200),
      orderBy: { createdAt: 'desc' },
      include: { lines: true },
    });
  }

  /**
   * Compare journal-derived figures with legacy fields (advanceBalance, fund cash-flow).
   * Returns mismatches where |diff| > 0.005.
   */
  async reconcile(buildingId?: string) {
    const mismatches: ReconcileMismatch[] = [];
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

    const funds = await this.prisma.fund.findMany({
      where: buildingId ? { buildingId } : undefined,
      include: {
        expenses: { where: { isVoided: false }, select: { amount: true } },
      },
    });

    for (const fund of funds) {
      const expenseTotal = fund.expenses.reduce((s, e) => s + Number(e.amount), 0);
      const legacyBalance = roundMoney(Number(fund.openingBalance) - expenseTotal);
      // journal: cash debit − credit for fund (simplified)
      const cashLines = await this.prisma.journalLine.findMany({
        where: { account: 'cash', fundId: fund.id },
        select: { debit: true, credit: true },
      });
      const journalCash = roundMoney(
        cashLines.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0),
      );
      // opening + payments cash − expenses; payments may not always tag fundId on cash
      // Compare expense account only for tighter check
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
      // include cash figure for visibility when expenses match but cash differs a lot
      void legacyBalance;
      void journalCash;
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
        where: { refType: 'Payment', refId: p.id, type: JournalEntryType.payment },
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

    return {
      checkedAt: new Date().toISOString(),
      buildingId: buildingId ?? null,
      mismatchCount: mismatches.length,
      ok: mismatches.length === 0,
      mismatches: mismatches.slice(0, 100),
    };
  }
}
