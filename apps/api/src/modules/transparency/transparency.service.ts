import { ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '../../prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
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

  private async resolveUserBuilding(user: AuthUser | { role: UserRole; apartmentId?: string | null; tenantId?: string | null }) {
    let buildingId: string | undefined;
    if (user.apartmentId) {
      const apt = await this.prisma.apartment.findUnique({
        where: { id: user.apartmentId },
        select: { buildingId: true },
      });
      buildingId = apt?.buildingId;
    }
    if (buildingId) {
      return this.prisma.building.findUnique({ where: { id: buildingId } });
    }
    if (user.tenantId) {
      return this.prisma.building.findFirst({ where: { tenantId: user.tenantId } });
    }
    return this.prisma.building.findFirst();
  }

  async getResidentDashboard(userOrRole: AuthUser | UserRole) {
    const user = typeof userOrRole === 'string' ? { role: userOrRole, tenantId: null } : userOrRole;
    const building = await this.resolveUserBuilding(user);
    const settingsJson = parseBuildingSettings(building?.settings);
    const showBankDetails =
      settingsJson.showBankDetailsToResidents ??
      DEFAULT_BUILDING_SETTINGS.showBankDetailsToResidents;

    const tenantId = 'tenantId' in user ? user.tenantId : null;
    const [expenseSummary, cashFlow, documents, debtors, bankAccounts] = await Promise.all([
      this.finance.getExpensesSummary(undefined, undefined, building?.id, tenantId),
      this.finance.getCashFlowReport(undefined, undefined, building?.id, tenantId),
      this.documents.listPublic(),
      this.canShowDebtors(user.role as UserRole, building?.showDebtorsToResidents ?? false)
        ? this.payments.getDebtorsReport(building?.id, tenantId)
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

  async getDebtorsForUser(userOrRole: AuthUser | UserRole) {
    const user = typeof userOrRole === 'string' ? { role: userOrRole, tenantId: null } : userOrRole;
    const building = await this.resolveUserBuilding(user);
    if (!building) return [];
    if (!this.canShowDebtors(user.role as UserRole, building.showDebtorsToResidents)) {
      throw new ForbiddenException('Список боржників недоступний');
    }
    const tenantId = 'tenantId' in user ? user.tenantId : null;
    return this.payments.getDebtorsReport(building.id, tenantId);
  }
}
