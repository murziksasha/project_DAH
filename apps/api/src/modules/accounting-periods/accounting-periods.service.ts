import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountingPeriodStatus, UserRole } from '@prisma/client';
import { isJournalSotEnabled } from '../../common/utils/finance-sot';
import { parseBuildingSettings } from '../building/building-settings';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export type PeriodMutation =
  | 'payment'
  | 'expense'
  | 'accrual'
  | 'void_payment'
  | 'void_expense';

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

@Injectable()
export class AccountingPeriodsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Extract YYYY-MM from ISO date or Date. */
  periodKeyFromDate(date: string | Date): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException('Некоректна дата для облікового періоду');
    }
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  assertPeriodFormat(period: string) {
    if (!PERIOD_RE.test(period)) {
      throw new BadRequestException('Період має бути у форматі YYYY-MM');
    }
  }

  async list(buildingId: string) {
    if (!buildingId) throw new BadRequestException('buildingId обовʼязковий');
    return this.prisma.accountingPeriod.findMany({
      where: { buildingId },
      orderBy: { period: 'desc' },
    });
  }

  /**
   * Close-month checklist before soft_closed / locked.
   */
  async closeChecklist(buildingId: string, period: string) {
    this.assertPeriodFormat(period);
    const [y, m] = period.split('-').map(Number);
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

    const aptIds = (
      await this.prisma.apartment.findMany({
        where: { buildingId },
        select: { id: true },
      })
    ).map((a) => a.id);

    const openLines = await this.prisma.accrualLine.count({
      where: {
        apartmentId: { in: aptIds },
        status: { in: ['open', 'partially_paid', 'overdue'] },
        dueDate: { gte: from, lte: to },
      },
    });

    const paymentsInPeriod = await this.prisma.payment.count({
      where: {
        isVoided: false,
        apartmentId: { in: aptIds },
        date: { gte: from, lte: to },
      },
    });

    const pendingExpenses = await this.prisma.expense.count({
      where: {
        fund: { buildingId },
        isVoided: false,
        approvalStatus: 'pending',
        date: { gte: from, lte: to },
      },
    });

    const unmatchedLines = await this.prisma.bankStatementLine.count({
      where: {
        statement: { buildingId },
        status: { in: ['unmatched', 'matched', 'manual'] },
        paymentId: null,
        date: { gte: from, lte: to },
      },
    });

    const periodRow = await this.prisma.accountingPeriod.findUnique({
      where: { buildingId_period: { buildingId, period } },
    });

    const bankRecOpen = await this.prisma.bankReconciliation.count({
      where: {
        buildingId,
        period,
        status: { in: ['open'] },
      },
    });
    const bankRecClosedOrBalanced = await this.prisma.bankReconciliation.count({
      where: {
        buildingId,
        period,
        status: { in: ['balanced', 'closed'] },
      },
    });
    const pendingWriteOffs = await this.prisma.debtWriteOff.count({
      where: { buildingId, status: 'pending' },
    });
    const draftInvoices = await this.prisma.supplierInvoice.count({
      where: {
        buildingId,
        status: 'draft',
        isVoided: false,
        date: { gte: from, lte: to },
      },
    });

    const building = await this.prisma.building.findUnique({
      where: { id: buildingId },
      select: { settings: true },
    });
    const settings = parseBuildingSettings(building?.settings);
    const strictBankRec = !!settings.finance?.strictBankRec;
    const journalSot = isJournalSotEnabled(building?.settings);

    const checks = [
      {
        id: 'pending_expenses',
        ok: pendingExpenses === 0,
        label: 'Немає витрат, що очікують dual-approve',
        detail: pendingExpenses,
      },
      {
        id: 'unmatched_bank',
        ok: unmatchedLines === 0,
        label: 'Немає нерознесених рядків виписки',
        detail: unmatchedLines,
      },
      {
        id: 'bank_rec',
        ok: bankRecOpen === 0,
        label: strictBankRec
          ? 'Немає відкритих звірок банку (strictBankRec)'
          : 'Немає відкритих (незбалансованих) звірок банку',
        detail: bankRecOpen,
      },
      {
        id: 'bank_rec_info',
        ok: true,
        label: 'Звірки банку balanced/closed за період (інфо)',
        detail: bankRecClosedOrBalanced,
      },
      {
        id: 'pending_write_offs',
        ok: pendingWriteOffs === 0,
        label: 'Немає pending списань боргу',
        detail: pendingWriteOffs,
      },
      {
        id: 'draft_invoices',
        ok: draftInvoices === 0,
        label: 'Немає draft рахунків постачальників за період',
        detail: draftInvoices,
      },
      {
        id: 'open_lines_info',
        ok: true,
        label: 'Відкриті нарахування за dueDate періоду (інфо)',
        detail: openLines,
      },
      {
        id: 'payments_info',
        ok: true,
        label: 'Платежі за період (інфо)',
        detail: paymentsInPeriod,
      },
      {
        id: 'journal_sot_info',
        ok: true,
        label: journalSot
          ? 'Journal SoT увімкнено (reads з journal)'
          : 'Journal SoT вимкнено (legacy reads)',
        detail: journalSot ? 1 : 0,
      },
    ];

    // bank_rec blocks only when strictBankRec OR always was blocking when open —
    // previous behavior: bank_rec always blocking if open. Keep always blocking.
    const infoIds = new Set([
      'open_lines_info',
      'payments_info',
      'bank_rec_info',
      'journal_sot_info',
    ]);
    const blocking = checks.filter((c) => !c.ok && !infoIds.has(c.id));
    return {
      buildingId,
      period,
      status: periodRow?.status ?? 'open',
      canSoftClose: blocking.length === 0,
      canLock: blocking.length === 0,
      strictBankRec,
      journalSot,
      checks,
    };
  }

  async getOrCreate(buildingId: string, period: string) {
    this.assertPeriodFormat(period);
    const existing = await this.prisma.accountingPeriod.findUnique({
      where: { buildingId_period: { buildingId, period } },
    });
    if (existing) return existing;
    return this.prisma.accountingPeriod.create({
      data: { buildingId, period, status: AccountingPeriodStatus.open },
    });
  }

  /**
   * Enforce period status for finance mutations.
   * - open: all allowed
   * - soft_closed: payments OK; block accruals, expenses, voids
   * - locked: all blocked
   * Missing period row is treated as open.
   */
  async assertAllowsMutation(
    buildingId: string,
    dateOrPeriod: string | Date,
    mutation: PeriodMutation,
  ) {
    const period =
      typeof dateOrPeriod === 'string' && PERIOD_RE.test(dateOrPeriod)
        ? dateOrPeriod
        : this.periodKeyFromDate(dateOrPeriod);

    const row = await this.prisma.accountingPeriod.findUnique({
      where: { buildingId_period: { buildingId, period } },
    });
    const status = row?.status ?? AccountingPeriodStatus.open;

    if (status === AccountingPeriodStatus.open) return { period, status };

    if (status === AccountingPeriodStatus.locked) {
      throw new ForbiddenException(
        `Обліковий період ${period} заблоковано. Фінансові зміни заборонені.`,
      );
    }

    // soft_closed
    if (mutation === 'payment') {
      return { period, status };
    }

    throw new ForbiddenException(
      `Обліковий період ${period} мʼяко закрито. ` +
        `Дозволені лише нові платежі; ${mutation} заборонено.`,
    );
  }

  async setStatus(
    buildingId: string,
    period: string,
    status: AccountingPeriodStatus,
    userId: string,
    role: string,
    notes?: string,
  ) {
    this.assertPeriodFormat(period);
    const building = await this.prisma.building.findUnique({ where: { id: buildingId } });
    if (!building) throw new NotFoundException('Будинок не знайдено');

    if (status === AccountingPeriodStatus.locked) {
      if (role !== UserRole.chairman && role !== UserRole.super_admin) {
        throw new ForbiddenException('Повне блокування періоду — лише голова / super-admin');
      }
    }

    const existing = await this.getOrCreate(buildingId, period);

    if (
      existing.status === AccountingPeriodStatus.locked &&
      status !== AccountingPeriodStatus.locked &&
      role !== UserRole.super_admin &&
      role !== UserRole.chairman
    ) {
      throw new ForbiddenException('Розблокувати locked-період може лише голова / super-admin');
    }

    if (
      existing.status === AccountingPeriodStatus.locked &&
      status === AccountingPeriodStatus.open &&
      role !== UserRole.super_admin
    ) {
      // Chairman may reopen only to soft_closed first (extra safety)
      throw new ForbiddenException(
        'З locked дозволено лише soft_closed (голова) або open (super-admin)',
      );
    }

    if (
      existing.status === AccountingPeriodStatus.locked &&
      status === AccountingPeriodStatus.soft_closed &&
      role !== UserRole.chairman &&
      role !== UserRole.super_admin
    ) {
      throw new ForbiddenException('Недостатньо прав для зміни locked періоду');
    }

    // Reopen from locked/soft_closed requires reason in notes for audit trail
    const isReopen =
      (existing.status === AccountingPeriodStatus.locked ||
        existing.status === AccountingPeriodStatus.soft_closed) &&
      (status === AccountingPeriodStatus.open ||
        (existing.status === AccountingPeriodStatus.locked &&
          status === AccountingPeriodStatus.soft_closed));
    if (isReopen && !notes?.trim()) {
      throw new BadRequestException(
        'Для повторного відкриття періоду вкажіть reason у notes',
      );
    }

    const updated = await this.prisma.accountingPeriod.update({
      where: { id: existing.id },
      data: {
        status,
        notes: notes
          ? isReopen
            ? `[reopen ${new Date().toISOString().slice(0, 10)}] ${notes}`
            : notes
          : existing.notes,
        closedAt:
          status === AccountingPeriodStatus.open ? null : new Date(),
        closedById: status === AccountingPeriodStatus.open ? null : userId,
      },
    });

    await this.audit.log({
      userId,
      action: 'accounting_period.status',
      entityType: 'AccountingPeriod',
      entityId: updated.id,
      payload: { buildingId, period, status, previous: existing.status },
    });

    return updated;
  }
}
