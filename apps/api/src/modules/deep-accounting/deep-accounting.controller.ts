import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccrualDistribution, PaymentSource, UserRole } from '@prisma/client';
import { Permission } from '@dah/shared';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { DeepAccountingService } from './deep-accounting.service';

const READ = [
  UserRole.chairman,
  UserRole.accountant,
  UserRole.board,
  UserRole.auditor,
  UserRole.super_admin,
];
const WRITE = [UserRole.chairman, UserRole.accountant, UserRole.board];

@ApiTags('accounting')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard, PermissionsGuard)
@RequirePermissions(Permission.READ_FINANCE)
@Controller('accounting')
export class DeepAccountingController {
  constructor(private svc: DeepAccountingService) {}

  // AR
  @Roles(...READ)
  @Get('ar-aging')
  arAging(
    @Query('buildingId') buildingId: string,
    @Query('asOf') asOf?: string,
  ) {
    return this.svc.arAging(buildingId, asOf);
  }

  @Roles(...READ)
  @Get('apartments/:apartmentId/statement')
  apartmentStatement(
    @Param('apartmentId') apartmentId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.apartmentStatement(apartmentId, from, to);
  }

  // Write-offs
  @Roles(...READ)
  @Get('write-offs')
  listWriteOffs(@Query('buildingId') buildingId: string) {
    return this.svc.listWriteOffs(buildingId);
  }

  @Roles(...WRITE)
  @RequirePermissions(Permission.MANAGE_FINANCE)
  @Post('write-offs')
  createWriteOff(
    @Body()
    body: {
      apartmentId: string;
      amount: number;
      reason: string;
      accrualLineId?: string;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.createWriteOff(body, user.id);
  }

  @Roles(UserRole.chairman, UserRole.accountant, UserRole.super_admin)
  @RequirePermissions(Permission.MANAGE_FINANCE)
  @Post('write-offs/:id/approve')
  approveWriteOff(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.approveWriteOff(id, user.id, user.role);
  }

  // Tariffs
  @Roles(...READ)
  @Get('tariffs')
  listTariffs(@Query('buildingId') buildingId: string) {
    return this.svc.listTariffs(buildingId);
  }

  @Roles(...WRITE)
  @RequirePermissions(Permission.MANAGE_FINANCE)
  @Post('tariffs')
  createTariff(
    @Body()
    body: {
      buildingId: string;
      fundId: string;
      name: string;
      distribution?: AccrualDistribution;
      rate?: number;
      fixedAmount?: number;
      effectiveFrom: string;
      effectiveTo?: string;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.createTariff(body, user.id);
  }

  @Roles(...WRITE)
  @RequirePermissions(Permission.MANAGE_FINANCE)
  @Patch('tariffs/:id')
  updateTariff(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      rate?: number;
      fixedAmount?: number;
      isActive?: boolean;
      effectiveTo?: string | null;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.updateTariff(id, body, user.id);
  }

  // AP
  @Roles(...READ)
  @Get('supplier-invoices')
  listInvoices(
    @Query('buildingId') buildingId: string,
    @Query('status') status?: string,
  ) {
    return this.svc.listInvoices(buildingId, status);
  }

  @Roles(...WRITE)
  @RequirePermissions(Permission.MANAGE_FINANCE)
  @Post('supplier-invoices')
  createInvoice(
    @Body()
    body: {
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
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.createInvoice(body, user.id);
  }

  @Roles(...WRITE)
  @RequirePermissions(Permission.MANAGE_FINANCE)
  @Post('supplier-invoices/:id/approve')
  approveInvoice(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.approveInvoice(id, user.id);
  }

  @Roles(...WRITE)
  @RequirePermissions(Permission.MANAGE_FINANCE)
  @Post('supplier-invoices/pay')
  payInvoice(
    @Body()
    body: {
      invoiceId: string;
      amount: number;
      date: string;
      source?: PaymentSource;
      reference?: string;
      description?: string;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.payInvoice(body, user.id);
  }

  @Roles(...READ)
  @Get('ap-aging')
  apAging(@Query('buildingId') buildingId: string) {
    return this.svc.apAging(buildingId);
  }

  // Bank rec
  @Roles(...READ)
  @Get('bank-reconciliations')
  listBankRec(@Query('buildingId') buildingId: string) {
    return this.svc.listBankReconciliations(buildingId);
  }

  @Roles(...READ)
  @Get('bank-gl-balance')
  glBalance(
    @Query('buildingId') buildingId: string,
    @Query('bankAccountId') bankAccountId?: string,
  ) {
    return this.svc.glBankBalance(buildingId, bankAccountId).then((balance) => ({
      buildingId,
      bankAccountId: bankAccountId ?? null,
      balance,
    }));
  }

  @Roles(...WRITE)
  @RequirePermissions(Permission.MANAGE_FINANCE)
  @Post('bank-reconciliations')
  createBankRec(
    @Body()
    body: {
      buildingId: string;
      bankAccountId: string;
      period: string;
      statementBalance: number;
      notes?: string;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.createBankReconciliation(body, user.id);
  }

  @Roles(...WRITE)
  @RequirePermissions(Permission.MANAGE_FINANCE)
  @Post('bank-reconciliations/:id/close')
  closeBankRec(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.closeBankReconciliation(id, user.id);
  }

  @Roles(...READ)
  @Get('cash-book')
  cashBook(
    @Query('buildingId') buildingId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.cashBook(buildingId, from, to);
  }

  // Close pack
  @Roles(...WRITE)
  @RequirePermissions(Permission.MANAGE_FINANCE)
  @Post('periods/close-snapshot')
  closeSnapshot(
    @Body() body: { buildingId: string; period: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.createCloseSnapshot(body.buildingId, body.period, user.id);
  }

  @Roles(...READ)
  @Get('periods/close-snapshots')
  listSnapshots(
    @Query('buildingId') buildingId: string,
    @Query('period') period?: string,
  ) {
    return this.svc.listCloseSnapshots(buildingId, period);
  }

  // Budget encumbrance
  @Roles(...READ)
  @Get('budget/plan-fact-encumbrance')
  budgetEnc(
    @Query('buildingId') buildingId: string,
    @Query('year') year?: string,
  ) {
    return this.svc.budgetPlanFactWithEncumbrance(
      buildingId,
      Number(year) || new Date().getFullYear(),
    );
  }

  // CoA export map
  @Roles(...READ)
  @Get('coa-export-map')
  coaMap(@Query('buildingId') buildingId?: string) {
    return this.svc.exportCoaMapping(buildingId);
  }

  @Roles(...WRITE)
  @RequirePermissions(Permission.MANAGE_FINANCE)
  @Post('tariffs/run')
  runTariffs(
    @Body()
    body: {
      buildingId: string;
      period: string;
      tariffIds?: string[];
      dryRun?: boolean;
      dueDate?: string;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.runTariffs(body, user.id);
  }

  @Roles(...READ)
  @Get('overview')
  overview(@Query('buildingId') buildingId: string) {
    return this.svc.accountantOverview(buildingId);
  }

  @Roles(...READ)
  @Get('owner-change-policy')
  ownerPolicy(@Query('apartmentId') apartmentId: string) {
    return this.svc.ownerChangePolicy(apartmentId);
  }

  @Roles(UserRole.chairman, UserRole.accountant, UserRole.super_admin)
  @RequirePermissions(Permission.MANAGE_FINANCE)
  @Post('year-end')
  yearEnd(
    @Body() body: { buildingId: string; year: number },
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.yearEndClose(
      body.buildingId,
      Number(body.year),
      user.id,
      user.role,
    );
  }

  @Roles(UserRole.chairman, UserRole.accountant, UserRole.super_admin)
  @RequirePermissions(Permission.MANAGE_FINANCE)
  @Post('adjustments')
  adjustment(
    @Body()
    body: {
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
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.postManualAdjustment(body, user.id);
  }
}
