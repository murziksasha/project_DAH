import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountingPeriodStatus,
  AccrualDistribution,
  BankReconciliationStatus,
  DebtWriteOffStatus,
  JournalEntryType,
  PaymentSource,
  Prisma,
  SupplierInvoiceStatus,
  UserRole,
} from '@prisma/client';
import { roundMoney } from '../../common/utils/money';
import { resolveAccrualLineStatus } from '../../common/utils/fifo-allocation';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountingPeriodsService } from '../accounting-periods/accounting-periods.service';
import { AuditService } from '../audit/audit.service';
import { JournalService } from '../journal/journal.service';
import { PostingService } from '../journal/posting.service';
import { AccrualsService } from '../accruals/accruals.service';

@Injectable()
export class DeepAccountingService {
  constructor(
    private prisma: PrismaService,
    private journal: JournalService,
    private posting: PostingService,
    private periods: AccountingPeriodsService,
    private audit: AuditService,
    private accruals: AccrualsService,
  ) {}

  // ── AR Aging ────────────────────────────────────────────────────

  async arAging(buildingId: string, asOf?: string) {
    if (!buildingId) throw new BadRequestException('buildingId обовʼязковий');
    const asOfDate = asOf ? new Date(asOf) : new Date();
    const apts = await this.prisma.apartment.findMany({
      where: { buildingId },
      select: { id: true, number: true, entrance: true, advanceBalance: true },
      orderBy: { number: 'asc' },
    });
    const lines = await this.prisma.accrualLine.findMany({
      where: {
        apartmentId: { in: apts.map((a) => a.id) },
        status: { in: ['open', 'partially_paid', 'overdue'] },
      },
      include: {
        accrual: { select: { period: true, title: true, fundId: true } },
      },
    });

    const buckets = {
      current: 0,
      d1_30: 0,
      d31_60: 0,
      d61_90: 0,
      d90_plus: 0,
    };

    type Row = {
      apartmentId: string;
      number: string;
      advance: number;
      current: number;
      d1_30: number;
      d31_60: number;
      d61_90: number;
      d90_plus: number;
      total: number;
    };
    const byApt = new Map<string, Row>();
    for (const a of apts) {
      byApt.set(a.id, {
        apartmentId: a.id,
        number: a.number,
        advance: roundMoney(Number(a.advanceBalance)),
        current: 0,
        d1_30: 0,
        d31_60: 0,
        d61_90: 0,
        d90_plus: 0,
        total: 0,
      });
    }

    for (const l of lines) {
      const bal = roundMoney(Math.max(0, Number(l.amount) - Number(l.paidAmount)));
      if (bal <= 0) continue;
      const due = l.dueDate ? new Date(l.dueDate) : asOfDate;
      const days = Math.floor(
        (asOfDate.getTime() - due.getTime()) / (24 * 60 * 60 * 1000),
      );
      const row = byApt.get(l.apartmentId);
      if (!row) continue;
      let key: keyof typeof buckets = 'current';
      if (days <= 0) key = 'current';
      else if (days <= 30) key = 'd1_30';
      else if (days <= 60) key = 'd31_60';
      else if (days <= 90) key = 'd61_90';
      else key = 'd90_plus';
      row[key] = roundMoney(row[key] + bal);
      row.total = roundMoney(row.total + bal);
      buckets[key] = roundMoney(buckets[key] + bal);
    }

    const apartments = [...byApt.values()].filter((r) => r.total > 0 || r.advance > 0);
    return {
      buildingId,
      asOf: asOfDate.toISOString(),
      buckets,
      totalDebt: roundMoney(
        buckets.current + buckets.d1_30 + buckets.d31_60 + buckets.d61_90 + buckets.d90_plus,
      ),
      apartments,
    };
  }

  // ── Apartment statement (ОСВ по квартирі) ───────────────────────

  async apartmentStatement(apartmentId: string, from?: string, to?: string) {
    const apt = await this.prisma.apartment.findUnique({
      where: { id: apartmentId },
      include: { building: { select: { id: true, name: true } } },
    });
    if (!apt) throw new NotFoundException('Квартиру не знайдено');

    const dateFilter: Prisma.DateTimeFilter = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    const accruals = await this.prisma.accrualLine.findMany({
      where: {
        apartmentId,
        ...(from || to
          ? { accrual: { createdAt: dateFilter } }
          : {}),
      },
      include: {
        accrual: { select: { period: true, title: true, createdAt: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const payments = await this.prisma.payment.findMany({
      where: {
        apartmentId,
        isVoided: false,
        ...(from || to ? { date: dateFilter } : {}),
      },
      orderBy: { date: 'asc' },
    });

    const events: Array<{
      date: string;
      kind: 'accrual' | 'payment' | 'write_off';
      description: string;
      debit: number;
      credit: number;
      balance: number;
    }> = [];

    type Ev = {
      date: Date;
      kind: 'accrual' | 'payment' | 'write_off';
      description: string;
      debit: number;
      credit: number;
    };
    const raw: Ev[] = [];

    for (const l of accruals) {
      raw.push({
        date: l.accrual.createdAt,
        kind: 'accrual',
        description: `${l.accrual.title} (${l.accrual.period})`,
        debit: Number(l.amount),
        credit: 0,
      });
    }
    for (const p of payments) {
      raw.push({
        date: p.date,
        kind: 'payment',
        description: p.reference ?? `Платіж ${p.amount}`,
        debit: 0,
        credit: Number(p.amount),
      });
    }

    const writeOffs = await this.prisma.debtWriteOff.findMany({
      where: {
        apartmentId,
        status: DebtWriteOffStatus.approved,
        ...(from || to ? { approvedAt: dateFilter } : {}),
      },
    });
    for (const w of writeOffs) {
      raw.push({
        date: w.approvedAt ?? w.createdAt,
        kind: 'write_off',
        description: `Списання: ${w.reason}`,
        debit: 0,
        credit: Number(w.amount),
      });
    }

    raw.sort((a, b) => a.date.getTime() - b.date.getTime());
    let bal = 0;
    for (const e of raw) {
      bal = roundMoney(bal + e.debit - e.credit);
      events.push({
        date: e.date.toISOString(),
        kind: e.kind,
        description: e.description,
        debit: e.debit,
        credit: e.credit,
        balance: bal,
      });
    }

    const openLines = await this.prisma.accrualLine.findMany({
      where: {
        apartmentId,
        status: { in: ['open', 'partially_paid', 'overdue'] },
      },
    });
    const openDebt = roundMoney(
      openLines.reduce(
        (s, l) => s + Math.max(0, Number(l.amount) - Number(l.paidAmount)),
        0,
      ),
    );

    return {
      apartment: {
        id: apt.id,
        number: apt.number,
        buildingId: apt.buildingId,
        buildingName: apt.building.name,
        advanceBalance: Number(apt.advanceBalance),
      },
      openDebt,
      netBalance: roundMoney(openDebt - Number(apt.advanceBalance)),
      events,
    };
  }

  // ── Write-off ───────────────────────────────────────────────────

  async createWriteOff(
    dto: {
      apartmentId: string;
      amount: number;
      reason: string;
      accrualLineId?: string;
    },
    userId: string,
  ) {
    if (!dto.amount || dto.amount <= 0) {
      throw new BadRequestException('Сума списання має бути > 0');
    }
    if (!dto.reason?.trim()) throw new BadRequestException('Причина обовʼязкова');

    const apt = await this.prisma.apartment.findUnique({
      where: { id: dto.apartmentId },
    });
    if (!apt) throw new NotFoundException('Квартиру не знайдено');

    await this.periods.assertAllowsMutation(
      apt.buildingId,
      new Date(),
      'expense',
    );

    const row = await this.prisma.debtWriteOff.create({
      data: {
        buildingId: apt.buildingId,
        apartmentId: dto.apartmentId,
        accrualLineId: dto.accrualLineId,
        amount: dto.amount,
        reason: dto.reason.trim(),
        status: DebtWriteOffStatus.pending,
        createdById: userId,
      },
    });

    await this.audit.log({
      userId,
      action: 'write_off.created',
      entityType: 'DebtWriteOff',
      entityId: row.id,
      payload: { amount: dto.amount, apartmentId: dto.apartmentId },
    });
    return row;
  }

  async approveWriteOff(id: string, userId: string, role: string) {
    if (
      role !== UserRole.chairman &&
      role !== UserRole.accountant &&
      role !== UserRole.super_admin
    ) {
      throw new ForbiddenException('Недостатньо прав для approve write-off');
    }

    const row = await this.prisma.debtWriteOff.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Списання не знайдено');
    if (row.status !== DebtWriteOffStatus.pending) {
      throw new BadRequestException('Списання вже оброблено');
    }
    if (row.createdById === userId && role !== UserRole.super_admin) {
      throw new ForbiddenException('Maker-checker: approve має зробити інший користувач');
    }

    await this.periods.assertAllowsMutation(row.buildingId, new Date(), 'expense');

    const amount = Number(row.amount);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (row.accrualLineId) {
        const line = await tx.accrualLine.findUnique({
          where: { id: row.accrualLineId },
        });
        if (line) {
          const open = roundMoney(Number(line.amount) - Number(line.paidAmount));
          const apply = Math.min(open, amount);
          const newPaid = roundMoney(Number(line.paidAmount) + apply);
          await tx.accrualLine.update({
            where: { id: line.id },
            data: {
              paidAmount: newPaid,
              status: resolveAccrualLineStatus(
                Number(line.amount),
                newPaid,
                line.dueDate,
              ),
            },
          });
        }
      } else {
        // FIFO write-off across open lines
        let left = amount;
        const openLines = await tx.accrualLine.findMany({
          where: {
            apartmentId: row.apartmentId,
            status: { in: ['open', 'partially_paid', 'overdue'] },
          },
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
        });
        for (const line of openLines) {
          if (left <= 0) break;
          const open = roundMoney(Number(line.amount) - Number(line.paidAmount));
          if (open <= 0) continue;
          const apply = Math.min(open, left);
          const newPaid = roundMoney(Number(line.paidAmount) + apply);
          await tx.accrualLine.update({
            where: { id: line.id },
            data: {
              paidAmount: newPaid,
              status: resolveAccrualLineStatus(
                Number(line.amount),
                newPaid,
                line.dueDate,
              ),
            },
          });
          left = roundMoney(left - apply);
        }
      }

      await this.posting.postWriteOff(
        id,
        amount,
        {
          buildingId: row.buildingId,
          apartmentId: row.apartmentId,
          createdById: userId,
          description: `Списання боргу: ${row.reason}`,
        },
        tx,
      );

      return tx.debtWriteOff.update({
        where: { id },
        data: {
          status: DebtWriteOffStatus.approved,
          approvedById: userId,
          approvedAt: new Date(),
        },
      });
    });

    await this.audit.log({
      userId,
      action: 'write_off.approved',
      entityType: 'DebtWriteOff',
      entityId: id,
      payload: { amount },
    });
    return updated;
  }

  listWriteOffs(buildingId: string) {
    return this.prisma.debtWriteOff.findMany({
      where: { buildingId },
      orderBy: { createdAt: 'desc' },
      include: {
        apartment: { select: { id: true, number: true } },
      },
      take: 200,
    });
  }

  // ── Service tariffs ─────────────────────────────────────────────

  listTariffs(buildingId: string) {
    return this.prisma.serviceTariff.findMany({
      where: { buildingId },
      include: { fund: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createTariff(
    dto: {
      buildingId: string;
      fundId: string;
      name: string;
      distribution?: AccrualDistribution;
      rate?: number;
      fixedAmount?: number;
      effectiveFrom: string;
      effectiveTo?: string;
    },
    userId: string,
  ) {
    const fund = await this.prisma.fund.findUnique({ where: { id: dto.fundId } });
    if (!fund || fund.buildingId !== dto.buildingId) {
      throw new BadRequestException('Фонд не належить будинку');
    }
    const row = await this.prisma.serviceTariff.create({
      data: {
        buildingId: dto.buildingId,
        fundId: dto.fundId,
        name: dto.name,
        distribution: dto.distribution ?? AccrualDistribution.by_area,
        rate: dto.rate,
        fixedAmount: dto.fixedAmount,
        effectiveFrom: new Date(dto.effectiveFrom),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
      },
    });
    await this.audit.log({
      userId,
      action: 'tariff.created',
      entityType: 'ServiceTariff',
      entityId: row.id,
      payload: { name: dto.name },
    });
    return row;
  }

  async updateTariff(
    id: string,
    dto: {
      name?: string;
      rate?: number;
      fixedAmount?: number;
      isActive?: boolean;
      effectiveTo?: string | null;
    },
    userId: string,
  ) {
    const row = await this.prisma.serviceTariff.update({
      where: { id },
      data: {
        name: dto.name,
        rate: dto.rate,
        fixedAmount: dto.fixedAmount,
        isActive: dto.isActive,
        effectiveTo:
          dto.effectiveTo === null
            ? null
            : dto.effectiveTo
              ? new Date(dto.effectiveTo)
              : undefined,
      },
    });
    await this.audit.log({
      userId,
      action: 'tariff.updated',
      entityType: 'ServiceTariff',
      entityId: id,
      payload: dto as object,
    });
    return row;
  }

  // ── Supplier invoices (AP) ──────────────────────────────────────

  listInvoices(buildingId: string, status?: string) {
    return this.prisma.supplierInvoice.findMany({
      where: {
        buildingId,
        isVoided: false,
        ...(status ? { status: status as SupplierInvoiceStatus } : {}),
      },
      include: {
        supplier: { select: { id: true, name: true } },
        fund: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
      },
      orderBy: { date: 'desc' },
      take: 300,
    });
  }

  async createInvoice(
    dto: {
      buildingId: string;
      supplierId: string;
      fundId: string;
      categoryId?: string;
      number?: string;
      amount: number;
      date: string;
      dueDate?: string;
      description?: string;
      documentKey?: string;
      approve?: boolean;
    },
    userId: string,
  ) {
    if (!dto.amount || dto.amount <= 0) {
      throw new BadRequestException('Сума рахунку має бути > 0');
    }
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: dto.supplierId },
    });
    if (!supplier || supplier.buildingId !== dto.buildingId) {
      throw new BadRequestException('Постачальник не з цього будинку');
    }
    const fund = await this.prisma.fund.findUnique({ where: { id: dto.fundId } });
    if (!fund || fund.buildingId !== dto.buildingId) {
      throw new BadRequestException('Фонд не з цього будинку');
    }

    await this.periods.assertAllowsMutation(
      dto.buildingId,
      dto.date,
      'expense',
    );

    const status = dto.approve
      ? SupplierInvoiceStatus.approved
      : SupplierInvoiceStatus.draft;

    const inv = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supplierInvoice.create({
        data: {
          buildingId: dto.buildingId,
          supplierId: dto.supplierId,
          fundId: dto.fundId,
          categoryId: dto.categoryId,
          number: dto.number,
          amount: dto.amount,
          date: new Date(dto.date),
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          description: dto.description,
          documentKey: dto.documentKey,
          status,
          createdById: userId,
          approvedAt: dto.approve ? new Date() : null,
          approvedById: dto.approve ? userId : null,
        },
      });

      if (dto.approve) {
        await this.posting.postSupplierInvoice(
          created.id,
          dto.amount,
          {
            buildingId: dto.buildingId,
            fundId: dto.fundId,
            supplierId: dto.supplierId,
            categoryId: dto.categoryId,
            createdById: userId,
            valueDate: dto.date,
            description:
              dto.description ?? `Рахунок ${dto.number ?? created.id.slice(-6)}`,
          },
          tx,
        );
      }
      return created;
    });

    await this.audit.log({
      userId,
      action: 'supplier_invoice.created',
      entityType: 'SupplierInvoice',
      entityId: inv.id,
      payload: { amount: dto.amount, status },
    });
    return inv;
  }

  async approveInvoice(id: string, userId: string) {
    const inv = await this.prisma.supplierInvoice.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException('Рахунок не знайдено');
    if (inv.status !== SupplierInvoiceStatus.draft) {
      throw new BadRequestException('Рахунок не в статусі draft');
    }
    await this.periods.assertAllowsMutation(inv.buildingId, inv.date, 'expense');

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.supplierInvoice.update({
        where: { id },
        data: {
          status: SupplierInvoiceStatus.approved,
          approvedAt: new Date(),
          approvedById: userId,
        },
      });
      await this.posting.postSupplierInvoice(
        id,
        Number(inv.amount),
        {
          buildingId: inv.buildingId,
          fundId: inv.fundId,
          supplierId: inv.supplierId,
          categoryId: inv.categoryId ?? undefined,
          createdById: userId,
          valueDate: inv.date,
          description: inv.description ?? `Рахунок ${inv.number ?? id.slice(-6)}`,
        },
        tx,
      );
      return u;
    });

    await this.audit.log({
      userId,
      action: 'supplier_invoice.approved',
      entityType: 'SupplierInvoice',
      entityId: id,
    });
    return updated;
  }

  async payInvoice(
    dto: {
      invoiceId: string;
      amount: number;
      date: string;
      source?: PaymentSource;
      reference?: string;
      description?: string;
    },
    userId: string,
  ) {
    const inv = await this.prisma.supplierInvoice.findUnique({
      where: { id: dto.invoiceId },
      include: { supplier: true },
    });
    if (!inv) throw new NotFoundException('Рахунок не знайдено');
    if (
      inv.status !== SupplierInvoiceStatus.approved &&
      inv.status !== SupplierInvoiceStatus.partially_paid
    ) {
      throw new BadRequestException('Рахунок не затверджено');
    }
    const open = roundMoney(Number(inv.amount) - Number(inv.paidAmount));
    if (dto.amount <= 0 || dto.amount > open + 0.001) {
      throw new BadRequestException(`Сума оплати має бути в межах 0…${open}`);
    }

    await this.periods.assertAllowsMutation(inv.buildingId, dto.date, 'payment');

    const payment = await this.prisma.$transaction(async (tx) => {
      const pay = await tx.supplierPayment.create({
        data: {
          supplierId: inv.supplierId,
          amount: dto.amount,
          date: new Date(dto.date),
          source: dto.source ?? PaymentSource.bank,
          reference: dto.reference,
          description: dto.description,
          createdById: userId,
          allocations: {
            create: [{ invoiceId: inv.id, amount: dto.amount }],
          },
        },
      });

      const newPaid = roundMoney(Number(inv.paidAmount) + dto.amount);
      const status =
        newPaid + 0.001 >= Number(inv.amount)
          ? SupplierInvoiceStatus.paid
          : SupplierInvoiceStatus.partially_paid;

      await tx.supplierInvoice.update({
        where: { id: inv.id },
        data: { paidAmount: newPaid, status },
      });

      await this.posting.postSupplierPayment(
        pay.id,
        dto.amount,
        {
          buildingId: inv.buildingId,
          fundId: inv.fundId,
          supplierId: inv.supplierId,
          createdById: userId,
          valueDate: dto.date,
          description:
            dto.description ?? `Оплата рахунку ${inv.number ?? inv.id.slice(-6)}`,
        },
        tx,
      );
      return pay;
    });

    await this.audit.log({
      userId,
      action: 'supplier_payment.created',
      entityType: 'SupplierPayment',
      entityId: payment.id,
      payload: { invoiceId: inv.id, amount: dto.amount },
    });
    return payment;
  }

  async apAging(buildingId: string) {
    const invoices = await this.prisma.supplierInvoice.findMany({
      where: {
        buildingId,
        isVoided: false,
        status: {
          in: [
            SupplierInvoiceStatus.approved,
            SupplierInvoiceStatus.partially_paid,
          ],
        },
      },
      include: { supplier: { select: { id: true, name: true } } },
    });
    const asOf = new Date();
    const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
    const rows = invoices.map((inv) => {
      const open = roundMoney(Number(inv.amount) - Number(inv.paidAmount));
      const due = inv.dueDate ?? inv.date;
      const days = Math.floor(
        (asOf.getTime() - new Date(due).getTime()) / (24 * 60 * 60 * 1000),
      );
      let bucket: keyof typeof buckets = 'current';
      if (days <= 0) bucket = 'current';
      else if (days <= 30) bucket = 'd1_30';
      else if (days <= 60) bucket = 'd31_60';
      else if (days <= 90) bucket = 'd61_90';
      else bucket = 'd90_plus';
      buckets[bucket] = roundMoney(buckets[bucket] + open);
      return {
        id: inv.id,
        number: inv.number,
        supplier: inv.supplier,
        open,
        dueDate: inv.dueDate,
        date: inv.date,
        bucket,
      };
    });
    return {
      buildingId,
      buckets,
      total: roundMoney(
        buckets.current + buckets.d1_30 + buckets.d31_60 + buckets.d61_90 + buckets.d90_plus,
      ),
      invoices: rows,
    };
  }

  // ── Bank reconciliation ─────────────────────────────────────────

  async glBankBalance(buildingId: string, bankAccountId?: string) {
    const lines = await this.prisma.journalLine.findMany({
      where: {
        account: 'cash',
        entry: { buildingId },
        ...(bankAccountId ? { bankAccountId } : {}),
      },
      select: { debit: true, credit: true },
    });
    return roundMoney(
      lines.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0),
    );
  }

  async createBankReconciliation(
    dto: {
      buildingId: string;
      bankAccountId: string;
      period: string;
      statementBalance: number;
      notes?: string;
    },
    userId: string,
  ) {
    this.periods.assertPeriodFormat(dto.period);
    const bank = await this.prisma.bankAccount.findUnique({
      where: { id: dto.bankAccountId },
    });
    if (!bank || bank.buildingId !== dto.buildingId) {
      throw new BadRequestException('Рахунок не з цього будинку');
    }
    const glBalance = await this.glBankBalance(dto.buildingId, dto.bankAccountId);
    const diff = roundMoney(dto.statementBalance - glBalance);
    const status =
      Math.abs(diff) <= 0.005
        ? BankReconciliationStatus.balanced
        : BankReconciliationStatus.open;

    const row = await this.prisma.bankReconciliation.upsert({
      where: {
        bankAccountId_period: {
          bankAccountId: dto.bankAccountId,
          period: dto.period,
        },
      },
      create: {
        buildingId: dto.buildingId,
        bankAccountId: dto.bankAccountId,
        period: dto.period,
        statementBalance: dto.statementBalance,
        glBalance,
        status,
        notes: dto.notes,
        createdById: userId,
      },
      update: {
        statementBalance: dto.statementBalance,
        glBalance,
        status,
        notes: dto.notes,
      },
    });

    await this.audit.log({
      userId,
      action: 'bank_reconciliation.upsert',
      entityType: 'BankReconciliation',
      entityId: row.id,
      payload: { period: dto.period, statementBalance: dto.statementBalance, glBalance, diff },
    });
    return { ...row, difference: diff };
  }

  async closeBankReconciliation(id: string, userId: string) {
    const row = await this.prisma.bankReconciliation.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Звірку не знайдено');
    const glBalance = await this.glBankBalance(row.buildingId, row.bankAccountId);
    const diff = roundMoney(Number(row.statementBalance) - glBalance);
    if (Math.abs(diff) > 0.005) {
      throw new BadRequestException(
        `Неможливо закрити: різниця ${diff} (statement vs GL cash)`,
      );
    }
    const updated = await this.prisma.bankReconciliation.update({
      where: { id },
      data: {
        status: BankReconciliationStatus.closed,
        glBalance,
        closedAt: new Date(),
        closedById: userId,
      },
    });
    await this.audit.log({
      userId,
      action: 'bank_reconciliation.closed',
      entityType: 'BankReconciliation',
      entityId: id,
    });
    return updated;
  }

  listBankReconciliations(buildingId: string) {
    return this.prisma.bankReconciliation.findMany({
      where: { buildingId },
      include: {
        bankAccount: { select: { id: true, bankName: true, iban: true } },
      },
      orderBy: { period: 'desc' },
    });
  }

  /** Cash book for a day / period (PaymentSource.cash + journal cash). */
  async cashBook(buildingId: string, from?: string, to?: string) {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    const payments = await this.prisma.payment.findMany({
      where: {
        isVoided: false,
        source: PaymentSource.cash,
        apartment: { buildingId },
        ...(from || to ? { date: dateFilter } : {}),
      },
      include: {
        apartment: { select: { number: true } },
      },
      orderBy: { date: 'asc' },
    });

    const totalIn = roundMoney(
      payments.reduce((s, p) => s + Number(p.amount), 0),
    );

    return {
      buildingId,
      from: from ?? null,
      to: to ?? null,
      totalIn,
      totalOut: 0,
      lines: payments.map((p) => ({
        id: p.id,
        date: p.date,
        direction: 'in' as const,
        amount: Number(p.amount),
        description: `Каса: кв. ${p.apartment.number}`,
        reference: p.reference,
      })),
    };
  }

  // ── Period close pack ───────────────────────────────────────────

  async createCloseSnapshot(
    buildingId: string,
    period: string,
    userId: string,
  ) {
    this.periods.assertPeriodFormat(period);
    const [tb, aging, reconcile, cashFlowFunds, bankRecs, ap] =
      await Promise.all([
        this.journal.trialBalance(buildingId, period),
        this.arAging(buildingId),
        this.journal.reconcile(buildingId),
        this.prisma.fund.findMany({
          where: { buildingId },
          select: { id: true, name: true, openingBalance: true },
        }),
        this.prisma.bankReconciliation.findMany({
          where: { buildingId, period },
        }),
        this.apAging(buildingId),
      ]);

    const payload = {
      version: 1,
      createdAt: new Date().toISOString(),
      buildingId,
      period,
      trialBalance: tb,
      arAging: {
        buckets: aging.buckets,
        totalDebt: aging.totalDebt,
        apartmentCount: aging.apartments.length,
      },
      apAging: { buckets: ap.buckets, total: ap.total },
      reconcile: {
        ok: reconcile.ok,
        mismatchCount: reconcile.mismatchCount,
        trialBalance: reconcile.trialBalance,
      },
      funds: cashFlowFunds,
      bankReconciliations: bankRecs,
    };

    const snap = await this.prisma.periodCloseSnapshot.create({
      data: {
        buildingId,
        period,
        payload: payload as object,
        createdById: userId,
      },
    });

    await this.audit.log({
      userId,
      action: 'period.close_snapshot',
      entityType: 'PeriodCloseSnapshot',
      entityId: snap.id,
      payload: { period, buildingId },
    });
    return snap;
  }

  listCloseSnapshots(buildingId: string, period?: string) {
    return this.prisma.periodCloseSnapshot.findMany({
      where: { buildingId, ...(period ? { period } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ── Budget with encumbrance ─────────────────────────────────────

  async budgetPlanFactWithEncumbrance(buildingId: string, year: number) {
    const lines = await this.prisma.budgetLine.findMany({
      where: { buildingId, year },
      include: {
        fund: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, code: true } },
      },
    });

    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

    const expenses = await this.prisma.expense.findMany({
      where: {
        isVoided: false,
        approvalStatus: 'approved',
        fund: { buildingId },
        date: { gte: yearStart, lte: yearEnd },
      },
      select: {
        amount: true,
        fundId: true,
        categoryId: true,
        date: true,
      },
    });

    const openInvoices = await this.prisma.supplierInvoice.findMany({
      where: {
        buildingId,
        isVoided: false,
        status: {
          in: [
            SupplierInvoiceStatus.approved,
            SupplierInvoiceStatus.partially_paid,
          ],
        },
      },
      select: {
        amount: true,
        paidAmount: true,
        fundId: true,
        categoryId: true,
      },
    });

    const actualByKey = new Map<string, number>();
    for (const e of expenses) {
      const m = new Date(e.date).getUTCMonth() + 1;
      const key = `${e.fundId ?? ''}|${e.categoryId ?? ''}|${m}`;
      actualByKey.set(
        key,
        roundMoney((actualByKey.get(key) ?? 0) + Number(e.amount)),
      );
    }

    const encumbranceByKey = new Map<string, number>();
    for (const inv of openInvoices) {
      const open = roundMoney(Number(inv.amount) - Number(inv.paidAmount));
      const key = `${inv.fundId ?? ''}|${inv.categoryId ?? ''}|`;
      encumbranceByKey.set(
        key,
        roundMoney((encumbranceByKey.get(key) ?? 0) + open),
      );
    }

    const result = lines.map((l) => {
      const month = l.month ?? null;
      let actual = 0;
      if (month) {
        actual =
          actualByKey.get(`${l.fundId ?? ''}|${l.categoryId ?? ''}|${month}`) ??
          0;
      } else {
        for (let m = 1; m <= 12; m++) {
          actual = roundMoney(
            actual +
              (actualByKey.get(
                `${l.fundId ?? ''}|${l.categoryId ?? ''}|${m}`,
              ) ?? 0),
          );
        }
      }
      const enc =
        encumbranceByKey.get(`${l.fundId ?? ''}|${l.categoryId ?? ''}|`) ?? 0;
      const planned = Number(l.plannedAmount);
      const committed = roundMoney(actual + enc);
      const variance = roundMoney(planned - committed);
      const usagePct = planned > 0 ? roundMoney((committed / planned) * 100) : 0;
      return {
        ...l,
        plannedAmount: planned,
        actual,
        encumbrance: enc,
        committed,
        variance,
        usagePct,
        alert: usagePct >= 100 ? 'over' : usagePct >= 80 ? 'warn' : null,
      };
    });

    return { buildingId, year, lines: result };
  }

  // ── Export map (CoA → external) ─────────────────────────────────

  async exportCoaMapping(buildingId?: string) {
    await this.journal.ensureDefaultChartOfAccounts();
    const accounts = await this.journal.listChartOfAccounts(buildingId);
    return {
      buildingId: buildingId ?? null,
      mapping: accounts.map((a) => ({
        code: a.code,
        name: a.name,
        type: a.type,
        externalCode: a.externalCode,
        isControl: a.isControl,
      })),
    };
  }

  /**
   * Mass accrual from active ServiceTariff rows for a period.
   */
  async runTariffs(
    dto: {
      buildingId: string;
      period: string;
      tariffIds?: string[];
      dryRun?: boolean;
      dueDate?: string;
    },
    userId: string,
  ) {
    this.periods.assertPeriodFormat(dto.period);
    const asOf = new Date(`${dto.period}-15T12:00:00.000Z`);
    const tariffs = await this.prisma.serviceTariff.findMany({
      where: {
        buildingId: dto.buildingId,
        isActive: true,
        ...(dto.tariffIds?.length ? { id: { in: dto.tariffIds } } : {}),
        effectiveFrom: { lte: asOf },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
      },
      include: { fund: true },
    });
    if (!tariffs.length) {
      throw new BadRequestException('Немає активних тарифів на період');
    }

    const previews = [];
    const created = [];
    for (const t of tariffs) {
      const accrualDto = {
        fundId: t.fundId,
        period: dto.period,
        title: `${t.name} ${dto.period}`,
        distribution: t.distribution,
        rate: t.rate != null ? Number(t.rate) : undefined,
        fixedAmount: t.fixedAmount != null ? Number(t.fixedAmount) : undefined,
        dueDate: dto.dueDate,
      };
      const preview = await this.accruals.previewAmounts(accrualDto);
      const total = roundMoney(
        preview.reduce((s: number, r: { amount: number }) => s + Number(r.amount), 0),
      );
      previews.push({
        tariffId: t.id,
        name: t.name,
        fundId: t.fundId,
        lines: preview.length,
        total,
      });
      if (!dto.dryRun) {
        try {
          const acc = await this.accruals.createAccrual(accrualDto, userId);
          if (!acc?.id) {
            created.push({ tariffId: t.id, error: 'Accrual not returned' });
          } else {
            created.push({ tariffId: t.id, accrualId: acc.id, total });
          }
        } catch (err) {
          created.push({
            tariffId: t.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    await this.audit.log({
      userId,
      action: 'tariff.mass_run',
      entityType: 'ServiceTariff',
      entityId: dto.buildingId,
      payload: {
        period: dto.period,
        dryRun: !!dto.dryRun,
        count: tariffs.length,
      },
    });

    return {
      buildingId: dto.buildingId,
      period: dto.period,
      dryRun: !!dto.dryRun,
      previews,
      created: dto.dryRun ? [] : created,
    };
  }

  /**
   * Owner / resident change policy: debits stay on apartment personal account.
   * Documents the rule; optionally reassigns UserApartment without moving balances.
   */
  async ownerChangePolicy(apartmentId: string) {
    const apt = await this.prisma.apartment.findUnique({
      where: { id: apartmentId },
      include: {
        building: { select: { id: true, name: true } },
      },
    });
    if (!apt) throw new NotFoundException('Квартиру не знайдено');
    const openDebt = await this.prisma.accrualLine.findMany({
      where: {
        apartmentId,
        status: { in: ['open', 'partially_paid', 'overdue'] },
      },
      select: { amount: true, paidAmount: true },
    });
    const debt = roundMoney(
      openDebt.reduce(
        (s, l) => s + Math.max(0, Number(l.amount) - Number(l.paidAmount)),
        0,
      ),
    );
    return {
      apartmentId,
      buildingId: apt.buildingId,
      number: apt.number,
      policy: 'balance_stays_on_apartment',
      description:
        'При зміні власника/мешканця борг і аванс лишаються на особовому рахунку квартири. ' +
        'Перерахунок між особами — поза системою (договір купівлі-продажу). ' +
        'Система не переносить AccrualLine / advanceBalance на іншу квартиру.',
      current: {
        advanceBalance: Number(apt.advanceBalance),
        openDebt: debt,
        net: roundMoney(debt - Number(apt.advanceBalance)),
      },
    };
  }

  /**
   * Year-end close helper: soft_close all months of year that are still open,
   * create annual close snapshot, return checklist summary.
   */
  async yearEndClose(
    buildingId: string,
    year: number,
    userId: string,
    role: string,
  ) {
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      throw new BadRequestException('Некоректний рік');
    }
    const months: string[] = [];
    for (let m = 1; m <= 12; m++) {
      months.push(`${year}-${String(m).padStart(2, '0')}`);
    }
    const results = [];
    for (const period of months) {
      const checklist = await this.periods.closeChecklist(buildingId, period);
      let statusAction: string | null = null;
      if (checklist.status === 'open' && checklist.canSoftClose) {
        await this.periods.setStatus(
          buildingId,
          period,
          AccountingPeriodStatus.soft_closed,
          userId,
          role,
          `year-end ${year}`,
        );
        statusAction = 'soft_closed';
      }
      results.push({
        period,
        status: checklist.status,
        canSoftClose: checklist.canSoftClose,
        statusAction,
        blocking: checklist.checks.filter((c: { ok: boolean }) => !c.ok).length,
      });
    }
    const snap = await this.createCloseSnapshot(
      buildingId,
      `${year}-12`,
      userId,
    );
    await this.audit.log({
      userId,
      action: 'period.year_end',
      entityType: 'Building',
      entityId: buildingId,
      payload: { year, snapshotId: snap.id },
    });
    return {
      buildingId,
      year,
      months: results,
      yearEndSnapshotId: snap.id,
    };
  }

  /**
   * Manual GL adjustment (balanced dual entry) — for rare corrections.
   */
  async postManualAdjustment(
    dto: {
      buildingId: string;
      description: string;
      valueDate?: string;
      lines: Array<{
        account: string;
        debit?: number;
        credit?: number;
        fundId?: string;
        apartmentId?: string;
        supplierId?: string;
      }>;
    },
    userId: string,
  ) {
    if (!dto.description?.trim()) {
      throw new BadRequestException('Опис обовʼязковий');
    }
    if (!dto.lines?.length || dto.lines.length < 2) {
      throw new BadRequestException('Потрібно ≥2 рядки проводки');
    }
    const date = dto.valueDate ? new Date(dto.valueDate) : new Date();
    await this.periods.assertAllowsMutation(dto.buildingId, date, 'expense');

    const entry = await this.journal.write({
      type: JournalEntryType.adjustment,
      refType: 'ManualAdjustment',
      refId: `adj-${Date.now()}`,
      description: dto.description.trim(),
      buildingId: dto.buildingId,
      createdById: userId,
      valueDate: date,
      lines: dto.lines.map((l) => ({
        account: l.account,
        debit: l.debit,
        credit: l.credit,
        fundId: l.fundId,
        apartmentId: l.apartmentId,
        supplierId: l.supplierId,
      })),
    });

    await this.audit.log({
      userId,
      action: 'journal.manual_adjustment',
      entityType: 'JournalEntry',
      entityId: entry.id,
      payload: { description: dto.description, lineCount: dto.lines.length },
    });
    return entry;
  }

  /** Accountant home strip: mismatches, AR total, unmatched bank, pending AP. */
  async accountantOverview(buildingId: string) {
    const [shadow, aging, unmatchedBank, pendingInv, pendingWo, pendingExp] =
      await Promise.all([
        this.journal.shadowCompare(buildingId),
        this.arAging(buildingId),
        this.prisma.bankStatementLine.count({
          where: {
            statement: { buildingId },
            status: { in: ['unmatched', 'matched', 'manual'] },
            paymentId: null,
          },
        }),
        this.prisma.supplierInvoice.count({
          where: {
            buildingId,
            isVoided: false,
            status: { in: ['approved', 'partially_paid'] },
          },
        }),
        this.prisma.debtWriteOff.count({
          where: { buildingId, status: 'pending' },
        }),
        this.prisma.expense.count({
          where: {
            fund: { buildingId },
            isVoided: false,
            approvalStatus: 'pending',
          },
        }),
      ]);

    return {
      buildingId,
      readyForSot: shadow.readyForSot,
      reconcileOk: shadow.reconcileOk,
      mismatchCount: shadow.mismatchCount,
      trialBalance: shadow.trialBalance,
      arTotalDebt: aging.totalDebt,
      unmatchedBankLines: unmatchedBank,
      openSupplierInvoices: pendingInv,
      pendingWriteOffs: pendingWo,
      pendingExpenses: pendingExp,
    };
  }
}
