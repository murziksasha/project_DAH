import { roundMoney } from '../../common/utils/money';
import { Injectable } from '@nestjs/common';
import { JournalEntryType } from '@prisma/client';
import { JournalService, type JournalLineInput, type TxClient } from './journal.service';

export type PostingContext = {
  buildingId?: string | null;
  fundId?: string | null;
  apartmentId?: string | null;
  supplierId?: string | null;
  bankAccountId?: string | null;
  categoryId?: string | null;
  serviceId?: string | null;
  createdById?: string | null;
  valueDate?: Date | string | null;
  description?: string;
};

/**
 * Central posting helpers — all money events should go through JournalService.write
 * with balanced lines. This service standardizes line pairs for document events.
 */
@Injectable()
export class PostingService {
  constructor(private journal: JournalService) {}

  private dim(
    ctx: PostingContext,
    extra?: Partial<JournalLineInput>,
  ): Partial<JournalLineInput> {
    return {
      fundId: ctx.fundId,
      apartmentId: ctx.apartmentId,
      supplierId: ctx.supplierId,
      bankAccountId: ctx.bankAccountId,
      categoryId: ctx.categoryId,
      serviceId: ctx.serviceId,
      ...extra,
    };
  }

  postAccrual(
    refId: string,
    amount: number,
    ctx: PostingContext,
    tx?: TxClient,
  ) {
    return this.journal.write(
      {
        type: JournalEntryType.accrual,
        refType: 'Accrual',
        refId,
        description: ctx.description,
        buildingId: ctx.buildingId,
        fundId: ctx.fundId,
        createdById: ctx.createdById,
        valueDate: ctx.valueDate,
        lines: [
          { account: 'receivable', debit: amount, ...this.dim(ctx) },
          { account: 'fund_balance', credit: amount, ...this.dim(ctx) },
        ],
      },
      tx,
    );
  }

  /**
   * Payment: cash Dr / receivable Cr (allocated) / advance Cr (rest).
   * M4: when `fundSplit` is given (allocations across several funds), the cash and
   * receivable lines are split per fund so each fund's cash balance is correct;
   * the advance part stays on `ctx.fundId`.
   */
  postPayment(
    refId: string,
    amount: number,
    allocated: number,
    advance: number,
    ctx: PostingContext,
    tx?: TxClient,
    fundSplit?: Array<{ fundId: string | null; amount: number }>,
  ) {
    const lines: JournalLineInput[] = buildPaymentLines(
      amount,
      allocated,
      advance,
      ctx.fundId ?? null,
      (fundId) => this.dim({ ...ctx, fundId }),
      fundSplit,
    );
    return this.journal.write(
      {
        type: JournalEntryType.payment,
        refType: 'Payment',
        refId,
        description: ctx.description,
        buildingId: ctx.buildingId,
        apartmentId: ctx.apartmentId,
        fundId: ctx.fundId,
        createdById: ctx.createdById,
        valueDate: ctx.valueDate,
        lines,
      },
      tx,
    );
  }

  /**
   * M5: apply an apartment advance to new accrual lines: advance Dr / receivable Cr.
   */
  postAdvanceApplication(
    refId: string,
    amount: number,
    ctx: PostingContext,
    tx?: TxClient,
  ) {
    return this.journal.write(
      {
        type: JournalEntryType.adjustment,
        refType: 'AdvanceApplication',
        refId,
        description: ctx.description ?? 'Зарахування авансу',
        buildingId: ctx.buildingId,
        apartmentId: ctx.apartmentId,
        fundId: ctx.fundId,
        createdById: ctx.createdById,
        valueDate: ctx.valueDate,
        lines: [
          { account: 'advance', debit: amount, ...this.dim(ctx) },
          { account: 'receivable', credit: amount, ...this.dim(ctx) },
        ],
      },
      tx,
    );
  }

  postCashExpense(
    refId: string,
    amount: number,
    ctx: PostingContext,
    tx?: TxClient,
  ) {
    return this.journal.write(
      {
        type: JournalEntryType.expense,
        refType: 'Expense',
        refId,
        description: ctx.description,
        buildingId: ctx.buildingId,
        fundId: ctx.fundId,
        createdById: ctx.createdById,
        valueDate: ctx.valueDate,
        lines: [
          { account: 'expense', debit: amount, ...this.dim(ctx) },
          { account: 'cash', credit: amount, ...this.dim(ctx) },
        ],
      },
      tx,
    );
  }

  postSupplierInvoice(
    refId: string,
    amount: number,
    ctx: PostingContext,
    tx?: TxClient,
  ) {
    return this.journal.write(
      {
        type: JournalEntryType.supplier_invoice,
        refType: 'SupplierInvoice',
        refId,
        description: ctx.description,
        buildingId: ctx.buildingId,
        fundId: ctx.fundId,
        createdById: ctx.createdById,
        valueDate: ctx.valueDate,
        lines: [
          { account: 'expense', debit: amount, ...this.dim(ctx) },
          { account: 'payable', credit: amount, ...this.dim(ctx) },
        ],
      },
      tx,
    );
  }

  postSupplierPayment(
    refId: string,
    amount: number,
    ctx: PostingContext,
    tx?: TxClient,
  ) {
    return this.journal.write(
      {
        type: JournalEntryType.supplier_payment,
        refType: 'SupplierPayment',
        refId,
        description: ctx.description,
        buildingId: ctx.buildingId,
        fundId: ctx.fundId,
        createdById: ctx.createdById,
        valueDate: ctx.valueDate,
        lines: [
          { account: 'payable', debit: amount, ...this.dim(ctx) },
          { account: 'cash', credit: amount, ...this.dim(ctx) },
        ],
      },
      tx,
    );
  }

  postFundTransfer(
    refId: string,
    amount: number,
    fromFundId: string,
    toFundId: string,
    ctx: PostingContext,
    tx?: TxClient,
  ) {
    return this.journal.write(
      {
        type: JournalEntryType.fund_transfer,
        refType: 'FundTransfer',
        refId,
        description: ctx.description,
        buildingId: ctx.buildingId,
        createdById: ctx.createdById,
        valueDate: ctx.valueDate,
        lines: [
          { account: 'fund_balance', debit: amount, fundId: fromFundId },
          { account: 'fund_balance', credit: amount, fundId: toFundId },
        ],
      },
      tx,
    );
  }

  postWriteOff(
    refId: string,
    amount: number,
    ctx: PostingContext,
    tx?: TxClient,
  ) {
    return this.journal.write(
      {
        type: JournalEntryType.write_off,
        refType: 'DebtWriteOff',
        refId,
        description: ctx.description,
        buildingId: ctx.buildingId,
        apartmentId: ctx.apartmentId,
        createdById: ctx.createdById,
        valueDate: ctx.valueDate,
        lines: [
          { account: 'write_off', debit: amount, ...this.dim(ctx) },
          { account: 'receivable', credit: amount, ...this.dim(ctx) },
        ],
      },
      tx,
    );
  }

  postCreditNote(
    refId: string,
    amount: number,
    ctx: PostingContext,
    tx?: TxClient,
  ) {
    return this.journal.write(
      {
        type: JournalEntryType.adjustment,
        refType: 'CreditNote',
        refId,
        description: ctx.description,
        buildingId: ctx.buildingId,
        apartmentId: ctx.apartmentId,
        fundId: ctx.fundId,
        createdById: ctx.createdById,
        valueDate: ctx.valueDate,
        lines: [
          { account: 'fund_balance', debit: amount, ...this.dim(ctx) },
          { account: 'receivable', credit: amount, ...this.dim(ctx) },
        ],
      },
      tx,
    );
  }

  postPenalty(
    refId: string,
    amount: number,
    ctx: PostingContext,
    tx?: TxClient,
  ) {
    return this.journal.write(
      {
        type: JournalEntryType.penalty,
        refType: 'Accrual',
        refId,
        description: ctx.description,
        buildingId: ctx.buildingId,
        fundId: ctx.fundId,
        createdById: ctx.createdById,
        valueDate: ctx.valueDate,
        lines: [
          { account: 'receivable', debit: amount, ...this.dim(ctx) },
          { account: 'penalty_income', credit: amount, ...this.dim(ctx) },
        ],
      },
      tx,
    );
  }
}

/**
 * Pure helper (unit-tested): journal lines for a payment, optionally split by fund.
 * Σ cash Dr = amount; Σ receivable Cr = allocated; advance Cr = advance.
 */
export function buildPaymentLines(
  amount: number,
  allocated: number,
  advance: number,
  defaultFundId: string | null,
  dim: (fundId: string | null) => Partial<JournalLineInput>,
  fundSplit?: Array<{ fundId: string | null; amount: number }>,
): JournalLineInput[] {
  const split = (fundSplit ?? []).filter((f) => f.amount > 0);
  const splitTotal = roundMoney(split.reduce((s, f) => s + f.amount, 0));
  const useSplit = split.length > 1 && Math.abs(splitTotal - allocated) <= 0.005;
  if (!useSplit) {
    const lines: JournalLineInput[] = [{ account: 'cash', debit: amount, ...dim(defaultFundId) }];
    if (allocated > 0) lines.push({ account: 'receivable', credit: allocated, ...dim(defaultFundId) });
    if (advance > 0) lines.push({ account: 'advance', credit: advance, ...dim(defaultFundId) });
    return lines;
  }
  const lines: JournalLineInput[] = [];
  for (const f of split) {
    lines.push({ account: 'cash', debit: roundMoney(f.amount), ...dim(f.fundId) });
    lines.push({ account: 'receivable', credit: roundMoney(f.amount), ...dim(f.fundId) });
  }
  if (advance > 0) {
    lines.push({ account: 'cash', debit: advance, ...dim(defaultFundId) });
    lines.push({ account: 'advance', credit: advance, ...dim(defaultFundId) });
  }
  return lines;
}
