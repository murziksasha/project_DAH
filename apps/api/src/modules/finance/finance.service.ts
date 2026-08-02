import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JournalEntryType, Prisma } from '@prisma/client';
import { resolveBuildingId } from '../../common/utils/building-scope';
import { rowsToXlsxBuffer } from '../../common/utils/xlsx-export';
import {
  viaApartmentTenant,
  viaBuildingTenant,
} from '../../common/utils/tenant-scope';
import { createZipStore } from '../../common/utils/zip-store';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JournalService } from '../journal/journal.service';
import { StorageService } from '../files/storage.service';
import { PaymentsService } from '../payments/payments.service';
import {
  enabledExportFieldKeys,
  getExportProfile,
  normalizeDocumentTemplatesConfig,
} from '@dah/shared';
import { parseBuildingSettings } from '../building/building-settings';
import {
  BoardReportPdfService,
  resolveBoardReportTemplate,
} from './board-report-pdf.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';

@Injectable()
export class FinanceService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private audit: AuditService,
    private payments: PaymentsService,
    private boardPdf: BoardReportPdfService,
    private journal: JournalService,
  ) {}

  listFunds(buildingId?: string, tenantId?: string | null) {
    return this.prisma.fund.findMany({
      where: buildingId
        ? { buildingId, ...viaBuildingTenant(tenantId) }
        : viaBuildingTenant(tenantId),
      include: { bankAccount: true },
      orderBy: { name: 'asc' },
    });
  }

  async createFund(
    dto: {
      name: string;
      type: string;
      openingBalance?: number;
      bankAccountId?: string | null;
      buildingId?: string;
    },
    userId: string,
    tenantId?: string | null,
  ) {
    const buildingId = await resolveBuildingId(this.prisma, dto.buildingId, tenantId);
    if (dto.bankAccountId) {
      const ba = await this.prisma.bankAccount.findUnique({ where: { id: dto.bankAccountId } });
      if (!ba || ba.buildingId !== buildingId) {
        throw new BadRequestException('Банківський рахунок не знайдено для цього будинку');
      }
    }
    const created = await this.prisma.fund.create({
      data: {
        buildingId,
        name: dto.name.trim(),
        type: dto.type as 'maintenance' | 'capital_repair' | 'special',
        openingBalance: dto.openingBalance ?? 0,
        bankAccountId: dto.bankAccountId || null,
      },
      include: { bankAccount: true },
    });
    await this.audit.log({
      userId,
      action: 'fund.created',
      entityType: 'Fund',
      entityId: created.id,
      payload: { name: created.name, type: created.type, buildingId },
    });
    if (Number(created.openingBalance) !== 0) {
      await this.journal.write({
        type: JournalEntryType.opening,
        refType: 'Fund',
        refId: created.id,
        description: `Початковий залишок: ${created.name}`,
        buildingId,
        fundId: created.id,
        createdById: userId,
        lines: [
          { account: 'cash', debit: Number(created.openingBalance), fundId: created.id },
          { account: 'fund_balance', credit: Number(created.openingBalance), fundId: created.id },
        ],
      });
    }
    return created;
  }

  async updateFund(
    id: string,
    dto: { name?: string; openingBalance?: number; bankAccountId?: string | null },
    userId: string,
  ) {
    const fund = await this.prisma.fund.findUnique({ where: { id } });
    if (!fund) throw new NotFoundException('Фонд не знайдено');

    if (dto.bankAccountId) {
      const ba = await this.prisma.bankAccount.findUnique({ where: { id: dto.bankAccountId } });
      if (!ba) throw new BadRequestException('Банківський рахунок не знайдено');
    }

    const updated = await this.prisma.fund.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.openingBalance !== undefined ? { openingBalance: dto.openingBalance } : {}),
        ...(dto.bankAccountId !== undefined ? { bankAccountId: dto.bankAccountId } : {}),
      },
      include: { bankAccount: true },
    });

    await this.audit.log({
      userId,
      action: 'fund.updated',
      entityType: 'Fund',
      entityId: id,
      payload: { ...dto },
    });

    return updated;
  }

  listBankAccounts(buildingId?: string, tenantId?: string | null) {
    return this.prisma.bankAccount.findMany({
      where: buildingId
        ? { buildingId, ...viaBuildingTenant(tenantId) }
        : viaBuildingTenant(tenantId),
      orderBy: { createdAt: 'asc' },
    });
  }

  async createBankAccount(
    dto: { bankName: string; iban: string; description?: string; buildingId?: string },
    userId: string,
    tenantId?: string | null,
  ) {
    const buildingId = await resolveBuildingId(this.prisma, dto.buildingId ?? undefined, tenantId);

    const iban = dto.iban.replace(/\s+/g, '').toUpperCase();
    const created = await this.prisma.bankAccount.create({
      data: {
        buildingId,
        bankName: dto.bankName.trim(),
        iban,
        description: dto.description?.trim() || null,
      },
    });
    await this.audit.log({
      userId,
      action: 'bank_account.created',
      entityType: 'BankAccount',
      entityId: created.id,
      payload: { iban },
    });
    return created;
  }

  async updateBankAccount(
    id: string,
    dto: { bankName?: string; iban?: string; description?: string | null },
    userId: string,
  ) {
    const existing = await this.prisma.bankAccount.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Рахунок не знайдено');

    const updated = await this.prisma.bankAccount.update({
      where: { id },
      data: {
        ...(dto.bankName !== undefined ? { bankName: dto.bankName.trim() } : {}),
        ...(dto.iban !== undefined ? { iban: dto.iban.replace(/\s+/g, '').toUpperCase() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
      },
    });
    await this.audit.log({
      userId,
      action: 'bank_account.updated',
      entityType: 'BankAccount',
      entityId: id,
      payload: { ...dto },
    });
    return updated;
  }

  async deleteBankAccount(id: string, userId: string) {
    const existing = await this.prisma.bankAccount.findUnique({
      where: { id },
      include: { _count: { select: { funds: true } } },
    });
    if (!existing) throw new NotFoundException('Рахунок не знайдено');
    if (existing._count.funds > 0) {
      throw new BadRequestException('Спочатку відвʼяжіть фонди від цього рахунку');
    }
    await this.prisma.bankAccount.delete({ where: { id } });
    await this.audit.log({
      userId,
      action: 'bank_account.deleted',
      entityType: 'BankAccount',
      entityId: id,
      payload: { iban: existing.iban },
    });
    return { id, deleted: true };
  }

  listCategories() {
    return this.prisma.expenseCategory.findMany({ orderBy: { name: 'asc' } });
  }

  async createCategory(dto: { name: string; code?: string }) {
    const code =
      dto.code?.trim() ||
      dto.name
        .toLowerCase()
        .replace(/[^a-z0-9а-яіїєґ]+/gi, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 48) ||
      `cat_${Date.now().toString(36)}`;

    const existing = await this.prisma.expenseCategory.findUnique({ where: { code } });
    if (existing) throw new BadRequestException(`Категорія з кодом «${code}» вже існує`);

    return this.prisma.expenseCategory.create({
      data: { name: dto.name.trim(), code },
    });
  }

  async updateCategory(id: string, dto: { name: string; code?: string }) {
    const cat = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('Категорію не знайдено');

    if (dto.code && dto.code !== cat.code) {
      const clash = await this.prisma.expenseCategory.findUnique({ where: { code: dto.code } });
      if (clash) throw new BadRequestException('Код уже зайнятий');
    }

    return this.prisma.expenseCategory.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        ...(dto.code ? { code: dto.code } : {}),
      },
    });
  }

  async deleteCategory(id: string) {
    const cat = await this.prisma.expenseCategory.findUnique({
      where: { id },
      include: { _count: { select: { expenses: true } } },
    });
    if (!cat) throw new NotFoundException('Категорію не знайдено');
    if (cat._count.expenses > 0) {
      throw new BadRequestException('Неможливо видалити: є витрати з цією категорією');
    }
    await this.prisma.expenseCategory.delete({ where: { id } });
    return { id, deleted: true };
  }

  listSuppliers(buildingId?: string, tenantId?: string | null) {
    return this.prisma.supplier.findMany({
      where: buildingId
        ? { buildingId, ...viaBuildingTenant(tenantId) }
        : viaBuildingTenant(tenantId),
      orderBy: { name: 'asc' },
    });
  }

  async createSupplier(dto: CreateSupplierDto & { buildingId?: string }, tenantId?: string | null) {
    const buildingId = await resolveBuildingId(this.prisma, dto.buildingId, tenantId);

    return this.prisma.supplier.create({
      data: {
        buildingId,
        name: dto.name,
        edrpou: dto.edrpou,
        iban: dto.iban,
        phone: dto.phone,
        serviceType: dto.serviceType,
      },
    });
  }

  async updateSupplier(id: string, dto: CreateSupplierDto) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundException('Постачальника не знайдено');

    return this.prisma.supplier.update({
      where: { id },
      data: {
        name: dto.name,
        edrpou: dto.edrpou,
        iban: dto.iban,
        phone: dto.phone,
        serviceType: dto.serviceType,
      },
    });
  }

  async listExpenses(params?: {
    fundId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
    buildingId?: string;
    tenantId?: string | null;
  }) {
    const where: Prisma.ExpenseWhereInput = { isVoided: false };
    if (params?.fundId) where.fundId = params.fundId;
    if (params?.buildingId) {
      where.fund = {
        buildingId: params.buildingId,
        ...(params.tenantId ? { building: { tenantId: params.tenantId } } : {}),
      };
    } else if (params?.tenantId) {
      where.fund = { building: { tenantId: params.tenantId } };
    }
    if (params?.from || params?.to) {
      where.date = {};
      if (params.from) where.date.gte = new Date(params.from);
      if (params.to) where.date.lte = new Date(params.to);
    }

    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.min(Math.max(1, params?.limit ?? 50), 200);
    const skip = (page - 1) * limit;

    const [total, expenses] = await Promise.all([
      this.prisma.expense.count({ where }),
      this.prisma.expense.findMany({
        where,
        include: {
          fund: true,
          category: true,
          supplier: true,
          createdBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const items = await Promise.all(
      expenses.map(async (expense) => ({
        ...expense,
        documentUrl: expense.documentKey
          ? await this.storage.getDownloadUrl(expense.documentKey)
          : null,
      })),
    );

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getExpense(id: string) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: {
        fund: true,
        category: true,
        supplier: true,
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!expense || expense.isVoided) throw new NotFoundException('Витрату не знайдено');

    return {
      ...expense,
      documentUrl: expense.documentKey
        ? await this.storage.getDownloadUrl(expense.documentKey)
        : null,
    };
  }

  async createExpense(dto: CreateExpenseDto, userId: string) {
    const fund = await this.prisma.fund.findUnique({ where: { id: dto.fundId } });
    if (!fund) throw new NotFoundException('Фонд не знайдено');

    const expense = await this.prisma.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: {
          fundId: dto.fundId,
          categoryId: dto.categoryId,
          supplierId: dto.supplierId,
          amount: dto.amount,
          date: new Date(dto.date),
          description: dto.description,
          documentKey: dto.documentKey,
          createdById: userId,
        },
        include: { fund: true, category: true, supplier: true },
      });

      await this.journal.write(
        {
          type: JournalEntryType.expense,
          refType: 'Expense',
          refId: created.id,
          description: dto.description ?? `Витрата ${dto.amount}`,
          buildingId: fund.buildingId,
          fundId: dto.fundId,
          createdById: userId,
          lines: [
            { account: 'expense', debit: dto.amount, fundId: dto.fundId },
            { account: 'cash', credit: dto.amount, fundId: dto.fundId },
          ],
        },
        tx,
      );

      return created;
    });

    await this.audit.log({
      userId,
      action: 'expense.created',
      entityType: 'Expense',
      entityId: expense.id,
      payload: { amount: dto.amount, fundId: dto.fundId, documentKey: dto.documentKey },
    });

    return {
      ...expense,
      documentUrl: expense.documentKey
        ? await this.storage.getDownloadUrl(expense.documentKey)
        : null,
    };
  }

  async voidExpense(id: string, reason: string, userId: string) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: { fund: true },
    });
    if (!expense) throw new NotFoundException('Витрату не знайдено');
    if (expense.isVoided) throw new BadRequestException('Витрату вже анульовано');

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.expense.update({
        where: { id },
        data: { isVoided: true, voidReason: reason },
      });
      await this.journal.write(
        {
          type: JournalEntryType.void_expense,
          refType: 'Expense',
          refId: id,
          description: `Анулювання витрати: ${reason}`,
          buildingId: expense.fund.buildingId,
          fundId: expense.fundId,
          createdById: userId,
          lines: [
            { account: 'cash', debit: Number(expense.amount), fundId: expense.fundId },
            { account: 'expense', credit: Number(expense.amount), fundId: expense.fundId },
          ],
        },
        tx,
      );
      return row;
    });

    await this.audit.log({
      userId,
      action: 'expense.voided',
      entityType: 'Expense',
      entityId: id,
      payload: { reason },
    });

    return updated;
  }

  async getCashFlowReport(
    from?: string,
    to?: string,
    buildingId?: string,
    tenantId?: string | null,
  ) {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);
    const dateWhere = Object.keys(dateFilter).length ? { date: dateFilter } : {};
    const fundScope = buildingId
      ? { fund: { buildingId, ...(tenantId ? { building: { tenantId } } : {}) } }
      : tenantId
        ? { fund: { building: { tenantId } } }
        : {};
    const aptScope = buildingId
      ? { apartment: { buildingId, ...(tenantId ? { building: { tenantId } } : {}) } }
      : viaApartmentTenant(tenantId);

    const [expenses, payments, funds] = await Promise.all([
      this.prisma.expense.aggregate({
        where: { isVoided: false, ...dateWhere, ...fundScope },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: { isVoided: false, ...dateWhere, ...aptScope },
        _sum: { amount: true },
      }),
      this.prisma.fund.findMany({
        where: buildingId
          ? { buildingId, ...viaBuildingTenant(tenantId) }
          : viaBuildingTenant(tenantId),
        include: {
          expenses: { where: { isVoided: false } },
          accruals: { include: { lines: { include: { allocations: true } } } },
        },
      }),
    ]);

    const fundBalances = funds.map((fund) => {
      const totalExpenses = fund.expenses.reduce((s, e) => s + Number(e.amount), 0);
      const totalIncome = fund.accruals
        .flatMap((a) => a.lines)
        .reduce((s, l) => s + Number(l.paidAmount), 0);
      return {
        fundId: fund.id,
        fundName: fund.name,
        fundType: fund.type,
        openingBalance: Number(fund.openingBalance),
        income: totalIncome,
        expenses: totalExpenses,
        balance: Number(fund.openingBalance) + totalIncome - totalExpenses,
      };
    });

    return {
      period: { from, to },
      totalIncome: Number(payments._sum.amount ?? 0),
      totalExpenses: Number(expenses._sum.amount ?? 0),
      netFlow: Number(payments._sum.amount ?? 0) - Number(expenses._sum.amount ?? 0),
      fundBalances,
    };
  }

  async getExpensesSummary(
    from?: string,
    to?: string,
    buildingId?: string,
    tenantId?: string | null,
  ) {
    const where: Prisma.ExpenseWhereInput = { isVoided: false };
    if (buildingId) {
      where.fund = {
        buildingId,
        ...(tenantId ? { building: { tenantId } } : {}),
      };
    } else if (tenantId) {
      where.fund = { building: { tenantId } };
    }
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    const expenses = await this.prisma.expense.findMany({
      where,
      include: { category: true, fund: true },
    });

    const byCategory = new Map<string, { name: string; total: number }>();
    const byFund = new Map<string, { name: string; total: number }>();

    for (const e of expenses) {
      const amount = Number(e.amount);
      const cat = byCategory.get(e.categoryId) ?? { name: e.category.name, total: 0 };
      cat.total += amount;
      byCategory.set(e.categoryId, cat);

      const fund = byFund.get(e.fundId) ?? { name: e.fund.name, total: 0 };
      fund.total += amount;
      byFund.set(e.fundId, fund);
    }

    const total = expenses.reduce((s, e) => s + Number(e.amount), 0);

    return {
      period: { from, to },
      total,
      count: expenses.length,
      byCategory: Array.from(byCategory.values()).sort((a, b) => b.total - a.total),
      byFund: Array.from(byFund.values()).sort((a, b) => b.total - a.total),
    };
  }

  async generateBoardReportPdf(
    from?: string,
    to?: string,
    buildingId?: string,
    tenantId?: string | null,
  ) {
    const building = buildingId
      ? await this.prisma.building.findFirst({
          where: { id: buildingId, ...(tenantId ? { tenantId } : {}) },
        })
      : await this.prisma.building.findFirst({
          where: tenantId ? { tenantId } : undefined,
        });
    const [cashFlow, expensesSummary, debtors] = await Promise.all([
      this.getCashFlowReport(from, to, buildingId, tenantId),
      this.getExpensesSummary(from, to, buildingId, tenantId),
      this.payments.getDebtorsReport(buildingId, tenantId),
    ]);

    const template = resolveBoardReportTemplate(
      parseBuildingSettings(building?.settings).documentTemplates,
    );

    const buffer = await this.boardPdf.generate({
      buildingName: building?.name ?? 'Мій дім',
      buildingAddress: building?.address ?? '',
      generatedAt: new Date(),
      period: { from, to },
      cashFlow: {
        totalIncome: cashFlow.totalIncome,
        totalExpenses: cashFlow.totalExpenses,
        netFlow: cashFlow.netFlow,
        fundBalances: cashFlow.fundBalances.map((f) => ({
          fundName: f.fundName,
          balance: f.balance,
          income: f.income,
          expenses: f.expenses,
        })),
      },
      expensesSummary: {
        total: expensesSummary.total,
        byCategory: expensesSummary.byCategory,
      },
      debtors: debtors.map((d) => ({
        number: d.number,
        entrance: d.entrance,
        debt: d.debt,
        isOverdue: d.isOverdue,
      })),
      template,
    });

    const stamp = new Date().toISOString().slice(0, 10);
    return { buffer, filename: `zvit-osmd-${stamp}.pdf` };
  }

  /**
   * Export pack: ZIP of real Excel (.xlsx) workbooks.
   */
  async generateExportPack(
    from?: string,
    to?: string,
    buildingId?: string,
    tenantId?: string | null,
  ) {
    const building = buildingId
      ? await this.prisma.building.findFirst({
          where: { id: buildingId, ...(tenantId ? { tenantId } : {}) },
          select: { settings: true },
        })
      : await this.prisma.building.findFirst({
          where: tenantId ? { tenantId } : undefined,
          select: { settings: true },
        });
    const docConfig = normalizeDocumentTemplatesConfig(
      parseBuildingSettings(building?.settings).documentTemplates,
    );
    const packKeys = new Set(
      enabledExportFieldKeys(getExportProfile(docConfig, 'export_pack')),
    );
    const includeCashFlow = !packKeys.size || packKeys.has('includeCashFlow');
    const includeDebtors = !packKeys.size || packKeys.has('includeDebtors');
    const includeExpenses = !packKeys.size || packKeys.has('includeExpenses');
    const includePayments = !packKeys.size || packKeys.has('includePayments');

    const debtorsFields = enabledExportFieldKeys(getExportProfile(docConfig, 'debtors'));
    const expenseFields = enabledExportFieldKeys(getExportProfile(docConfig, 'expenses'));

    const [cashFlow, expensesSummary, debtors, expensePage] = await Promise.all([
      this.getCashFlowReport(from, to, buildingId, tenantId),
      this.getExpensesSummary(from, to, buildingId, tenantId),
      this.payments.getDebtorsReport(buildingId, tenantId),
      this.listExpenses({ from, to, buildingId, tenantId, page: 1, limit: 200 }),
    ]);

    const dateFilter: Prisma.DateTimeFilter = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);
    const payments = includePayments
      ? await this.prisma.payment.findMany({
          where: {
            isVoided: false,
            ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
            ...(buildingId
              ? { apartment: { buildingId, ...(tenantId ? { building: { tenantId } } : {}) } }
              : viaApartmentTenant(tenantId)),
          },
          include: { apartment: true },
          orderBy: { date: 'asc' },
          take: 2000,
        })
      : [];

    const zipFiles: Array<{ name: string; data: Buffer }> = [];

    if (includeCashFlow) {
      const cashFlowXlsx = await rowsToXlsxBuffer([
        {
          name: 'Cash flow',
          rows: [
            ['period_from', from ?? ''],
            ['period_to', to ?? ''],
            ['total_income', cashFlow.totalIncome],
            ['total_expenses', cashFlow.totalExpenses],
            ['net_flow', cashFlow.netFlow],
            [],
            ['fund', 'balance', 'income', 'expenses'],
            ...cashFlow.fundBalances.map((f) => [
              f.fundName,
              f.balance,
              f.income,
              f.expenses,
            ]),
          ],
        },
      ]);
      zipFiles.push({ name: 'cash-flow.xlsx', data: cashFlowXlsx });
    }

    if (includeDebtors) {
      const dKeys =
        debtorsFields.length > 0
          ? debtorsFields
          : ['number', 'entrance', 'debt', 'lines', 'oldestDue', 'isOverdue'];
      const headerMap: Record<string, string> = {
        number: 'apartment',
        entrance: 'entrance',
        debt: 'debt',
        lines: 'lines',
        oldestDue: 'oldest_due',
        isOverdue: 'overdue',
      };
      const debtorsXlsx = await rowsToXlsxBuffer([
        {
          name: 'Debtors',
          rows: [
            dKeys.map((k) => headerMap[k] ?? k),
            ...debtors.map((d) =>
              dKeys.map((k) => {
                if (k === 'number') return d.number;
                if (k === 'entrance') return d.entrance;
                if (k === 'debt') return d.debt;
                if (k === 'lines') return d.lines;
                if (k === 'oldestDue')
                  return d.oldestDue ? d.oldestDue.toISOString().slice(0, 10) : '';
                if (k === 'isOverdue') return d.isOverdue ? 1 : 0;
                return '';
              }),
            ),
          ],
        },
      ]);
      zipFiles.push({ name: 'debtors.xlsx', data: debtorsXlsx });
    }

    if (includeExpenses) {
      const eKeys =
        expenseFields.length > 0
          ? expenseFields
          : ['date', 'amount', 'fund', 'category', 'supplier', 'description'];
      const expensesXlsx = await rowsToXlsxBuffer([
        {
          name: 'Expenses',
          rows: [
            eKeys,
            ...expensePage.items.map((e) =>
              eKeys.map((k) => {
                if (k === 'date') return new Date(e.date).toISOString().slice(0, 10);
                if (k === 'amount') return Number(e.amount);
                if (k === 'fund') return e.fund?.name ?? '';
                if (k === 'category') return e.category?.name ?? '';
                if (k === 'supplier') return e.supplier?.name ?? '';
                if (k === 'description') return e.description ?? '';
                return '';
              }),
            ),
          ],
        },
      ]);
      zipFiles.push({ name: 'expenses.xlsx', data: expensesXlsx });

      const summaryXlsx = await rowsToXlsxBuffer([
        {
          name: 'Summary',
          rows: [
            ['metric', 'value'],
            ['expenses_total', expensesSummary.total],
            ['expenses_count', expensesSummary.count],
            ...expensesSummary.byCategory.map((c) => [`category:${c.name}`, c.total]),
          ],
        },
      ]);
      zipFiles.push({ name: 'expenses-summary.xlsx', data: summaryXlsx });
    }

    if (includePayments) {
      const txRows: Array<Array<string | number>> = [
        ['date', 'type', 'amount', 'debit_account', 'credit_account', 'counterpart', 'ref', 'note'],
      ];
      for (const p of payments) {
        txRows.push([
          p.date.toISOString().slice(0, 10),
          'payment',
          Number(p.amount),
          'cash',
          'receivable',
          `kv.${p.apartment.number}`,
          p.reference ?? p.id,
          'incoming payment',
        ]);
      }
      if (includeExpenses) {
        for (const e of expensePage.items) {
          txRows.push([
            new Date(e.date).toISOString().slice(0, 10),
            'expense',
            Number(e.amount),
            'expense',
            'cash',
            e.supplier?.name ?? e.category?.name ?? '',
            e.id,
            e.description ?? '',
          ]);
        }
      }
      const oneCXlsx = await rowsToXlsxBuffer([{ name: 'Transactions', rows: txRows }]);
      zipFiles.push({ name: '1c_transactions.xlsx', data: oneCXlsx });
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const buffer = createZipStore([
      ...zipFiles,
      {
        name: 'README.txt',
        data: Buffer.from(
          [
            'Мій дім export pack (Excel .xlsx)',
            `Generated: ${new Date().toISOString()}`,
            `Period: ${from ?? '…'} – ${to ?? '…'}`,
            `Files: ${zipFiles.map((f) => f.name).join(', ') || '(none — check constructor)'}`,
            '',
            'Склад пакету налаштовується в «Конструктор документів» → Excel / звіти.',
            'Open .xlsx in Excel / LibreOffice.',
          ].join('\n'),
          'utf8',
        ),
      },
    ]);

    return { buffer, filename: `dah-export-${stamp}.zip` };
  }
}