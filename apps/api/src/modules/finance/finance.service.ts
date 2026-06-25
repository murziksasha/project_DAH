import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../files/storage.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';

@Injectable()
export class FinanceService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private audit: AuditService,
  ) {}

  listFunds() {
    return this.prisma.fund.findMany({ include: { bankAccount: true } });
  }

  listCategories() {
    return this.prisma.expenseCategory.findMany({ orderBy: { name: 'asc' } });
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

  async listExpenses(params?: { fundId?: string; from?: string; to?: string }) {
    const where: Prisma.ExpenseWhereInput = { isVoided: false };
    if (params?.fundId) where.fundId = params.fundId;
    if (params?.from || params?.to) {
      where.date = {};
      if (params.from) where.date.gte = new Date(params.from);
      if (params.to) where.date.lte = new Date(params.to);
    }

    const expenses = await this.prisma.expense.findMany({
      where,
      include: {
        fund: true,
        category: true,
        supplier: true,
        createdBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { date: 'desc' },
    });

    return Promise.all(
      expenses.map(async (expense) => ({
        ...expense,
        documentUrl: expense.documentKey
          ? await this.storage.getDownloadUrl(expense.documentKey)
          : null,
      })),
    );
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
}