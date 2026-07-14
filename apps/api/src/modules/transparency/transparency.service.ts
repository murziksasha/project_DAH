import { ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DEFAULT_BUILDING_SETTINGS,
  parseBuildingSettings,
} from '../building/building-settings';
import { DocumentsService } from '../documents/documents.service';
import { FinanceService } from '../finance/finance.service';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class TransparencyService {
  constructor(
    private prisma: PrismaService,
    private finance: FinanceService,
    private payments: PaymentsService,
    private documents: DocumentsService,
  ) {}

  async getResidentDashboard(userRole: UserRole) {
    const building = await this.prisma.building.findFirst();
    const settingsJson = parseBuildingSettings(building?.settings);
    const showBankDetails =
      settingsJson.showBankDetailsToResidents ??
      DEFAULT_BUILDING_SETTINGS.showBankDetailsToResidents;

    const [expenseSummary, cashFlow, documents, debtors, bankAccounts] = await Promise.all([
      this.finance.getExpensesSummary(),
      this.finance.getCashFlowReport(),
      this.documents.listPublic(),
      this.canShowDebtors(userRole, building?.showDebtorsToResidents ?? false)
        ? this.payments.getDebtorsReport()
        : Promise.resolve(null),
      showBankDetails && building
        ? this.prisma.bankAccount.findMany({
            where: { buildingId: building.id },
            select: {
              id: true,
              bankName: true,
              iban: true,
              description: true,
            },
            orderBy: { createdAt: 'asc' },
          })
        : Promise.resolve(null),
    ]);

    return {
      building: building
        ? {
            name: building.name,
            address: building.address,
            edrpou: building.edrpou,
            showDebtorsToResidents: building.showDebtorsToResidents,
            showBankDetailsToResidents: showBankDetails,
          }
        : null,
      expenseSummary,
      cashFlow: {
        totalIncome: cashFlow.totalIncome,
        totalExpenses: cashFlow.totalExpenses,
        netFlow: cashFlow.netFlow,
        fundBalances: cashFlow.fundBalances,
      },
      documents,
      debtors,
      bankAccounts,
    };
  }

  private canShowDebtors(role: UserRole, setting: boolean) {
    const adminRoles: UserRole[] = [
      UserRole.chairman,
      UserRole.accountant,
      UserRole.board,
      UserRole.auditor,
    ];
    if (adminRoles.includes(role)) return true;
    return role === UserRole.resident && setting;
  }

  async getDebtorsForUser(role: UserRole) {
    const building = await this.prisma.building.findFirst();
    if (!this.canShowDebtors(role, building?.showDebtorsToResidents ?? false)) {
      throw new ForbiddenException('Список боржників недоступний');
    }
    return this.payments.getDebtorsReport();
  }
}
