import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../files/storage.service';
import { PaymentsService } from '../payments/payments.service';
import { BoardReportPdfService } from './board-report-pdf.service';
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
  ) {}

  listFunds() {
    return this.prisma.fund.findMany({
      include: { bankAccount: true },
      orderBy: { name: 'asc' },
    });
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

  listBankAccounts() {
    return this.prisma.bankAccount.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async createBankAccount(
    dto: { bankName: string; iban: string; description?: string },
    userId: string,
  ) {
    const building = await this.prisma.building.findFirst();
    if (!building) throw new BadRequestException('Будинок не налаштовано');

    const iban = dto.iban.replace(/\s+/g, '').toUpperCase();
    const created = await this.prisma.bankAccount.create({
      data: {
        buildingId: building.id,
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

  listSuppliers() {
    return this.prisma.supplier.findMany({ orderBy: { name: 'asc' } });
  }

  async createSupplier(dto: CreateSupplierDto) {
    const building = await this.prisma.building.findFirst();
    if (!building) throw new BadRequestException('Будинок не налаштовано');

    return this.prisma.supplier.create({
      data: {
        buildingId: building.id,
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
  }) {
    const where: Prisma.ExpenseWhereInput = { isVoided: false };
    if (params?.fundId) where.fundId = params.fundId;
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

    const expense = await this.prisma.expense.create({
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
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException('Витрату не знайдено');
    if (expense.isVoided) throw new BadRequestException('Витрату вже анульовано');

    const updated = await this.prisma.expense.update({
      where: { id },
      data: { isVoided: true, voidReason: reason },
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

  async getCashFlowReport(from?: string, to?: string) {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    const [expenses, payments, funds] = await Promise.all([
      this.prisma.expense.aggregate({
        where: { isVoided: false, ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}) },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: { isVoided: false, ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}) },
        _sum: { amount: true },
      }),
      this.prisma.fund.findMany({
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

  async getExpensesSummary(from?: string, to?: string) {
    const where: Prisma.ExpenseWhereInput = { isVoided: false };
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

  async generateBoardReportPdf(from?: string, to?: string) {
    const building = await this.prisma.building.findFirst();
    const [cashFlow, expensesSummary, debtors] = await Promise.all([
      this.getCashFlowReport(from, to),
      this.getExpensesSummary(from, to),
      this.payments.getDebtorsReport(),
    ]);

    const buffer = await this.boardPdf.generate({
      buildingName: building?.name ?? 'ОСМД',
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
    });

    const stamp = new Date().toISOString().slice(0, 10);
    return { buffer, filename: `zvit-osmd-${stamp}.pdf` };
  }
}