import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Permission } from '@dah/shared';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CreateBankAccountDto, UpdateBankAccountDto } from './dto/bank-account.dto';
import { CreateBudgetLineDto, UpdateBudgetLineDto } from './dto/budget.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateFundDto } from './dto/create-fund.dto';
import {
  CreateFundTransferDto,
  VoidFundTransferDto,
} from './dto/fund-transfer.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateFundDto } from './dto/update-fund.dto';
import { VoidExpenseDto } from './dto/void-expense.dto';
import { FinanceService } from './finance.service';
import { TenantAccessService } from '../../common/tenant-access/tenant-access.service';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('finance')
export class FinanceController {
  constructor(
    private finance: FinanceService,
    private access: TenantAccessService,
    private prisma: PrismaService,
  ) {}

  private scope(user: AuthUser, tenantId?: string | null) {
    return this.access.effectiveTenantId(user, tenantId ?? null);
  }

  @RequirePermissions(Permission.READ_FINANCE)
  @UseGuards(PermissionsGuard)
  @Get('funds')
  listFunds(
    @Query('buildingId') buildingId?: string,
    @TenantId() tenantId?: string | null,
  ) {
    return this.finance.listFunds(buildingId, tenantId);
  }

  @RequirePermissions(Permission.MANAGE_FINANCE)
  @UseGuards(PermissionsGuard)
  @Post('funds')
  createFund(
    @Body() dto: CreateFundDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId?: string | null,
  ) {
    return this.finance.createFund(dto, user.id, tenantId);
  }

  @RequirePermissions(Permission.READ_FINANCE)
  @UseGuards(PermissionsGuard)
  @Get('bank-accounts')
  listBankAccounts(
    @Query('buildingId') buildingId?: string,
    @TenantId() tenantId?: string | null,
  ) {
    return this.finance.listBankAccounts(buildingId, tenantId);
  }

  @RequirePermissions(Permission.FINANCE_ADMIN)
  @UseGuards(PermissionsGuard)
  @Post('bank-accounts')
  createBankAccount(
    @Body() dto: CreateBankAccountDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId?: string | null,
  ) {
    return this.finance.createBankAccount(dto, user.id, tenantId);
  }

  @RequirePermissions(Permission.FINANCE_ADMIN)
  @UseGuards(PermissionsGuard)
  @Patch('bank-accounts/:id')
  async updateBankAccount(
    @Param('id') id: string,
    @Body() dto: UpdateBankAccountDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId?: string | null,
  ) {
    const ba = await this.prisma.bankAccount.findUnique({
      where: { id },
      select: { buildingId: true },
    });
    if (!ba) throw new NotFoundException('Рахунок не знайдено');
    await this.access.assertBuilding(user, ba.buildingId, tenantId);
    return this.finance.updateBankAccount(id, dto, user.id);
  }

  @RequirePermissions(Permission.FINANCE_ADMIN)
  @UseGuards(PermissionsGuard)
  @Delete('bank-accounts/:id')
  deleteBankAccount(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.finance.deleteBankAccount(
      id,
      user.id,
      user.role === 'super_admin' ? null : user.tenantId,
    );
  }

  @RequirePermissions(Permission.FINANCE_ADMIN)
  @UseGuards(PermissionsGuard)
  @Patch('funds/:id')
  async updateFund(
    @Param('id') id: string,
    @Body() dto: UpdateFundDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId?: string | null,
  ) {
    const fund = await this.access.assertFund(user, id, tenantId);
    if (dto.bankAccountId) {
      await this.access.assertRefsInBuilding(fund.buildingId, { bankAccountIds: [dto.bankAccountId] });
    }
    return this.finance.updateFund(id, dto, user.id);
  }

  @RequirePermissions(Permission.READ_FINANCE)
  @UseGuards(PermissionsGuard)
  @Get('categories')
  listCategories(@CurrentUser() user: AuthUser, @TenantId() tenantId?: string | null) {
    return this.finance.listCategories(this.scope(user, tenantId));
  }

  @RequirePermissions(Permission.MANAGE_FINANCE)
  @UseGuards(PermissionsGuard)
  @Post('categories')
  createCategory(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId?: string | null,
  ) {
    return this.finance.createCategory(dto, this.scope(user, tenantId));
  }

  @RequirePermissions(Permission.MANAGE_FINANCE)
  @UseGuards(PermissionsGuard)
  @Patch('categories/:id')
  updateCategory(
    @Param('id') id: string,
    @Body() dto: CreateCategoryDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId?: string | null,
  ) {
    return this.finance.updateCategory(id, dto, this.scope(user, tenantId));
  }

  @RequirePermissions(Permission.FINANCE_ADMIN)
  @UseGuards(PermissionsGuard)
  @Delete('categories/:id')
  deleteCategory(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId?: string | null,
  ) {
    return this.finance.deleteCategory(id, this.scope(user, tenantId));
  }

  @RequirePermissions(Permission.READ_FINANCE)
  @UseGuards(PermissionsGuard)
  @Get('suppliers')
  listSuppliers(
    @Query('buildingId') buildingId?: string,
    @TenantId() tenantId?: string | null,
  ) {
    return this.finance.listSuppliers(buildingId, tenantId);
  }

  @RequirePermissions(Permission.MANAGE_FINANCE)
  @UseGuards(PermissionsGuard)
  @Post('suppliers')
  createSupplier(
    @Body() dto: CreateSupplierDto,
    @TenantId() tenantId?: string | null,
  ) {
    return this.finance.createSupplier(dto, tenantId);
  }

  @RequirePermissions(Permission.MANAGE_FINANCE)
  @UseGuards(PermissionsGuard)
  @Patch('suppliers/:id')
  updateSupplier(
    @Param('id') id: string,
    @Body() dto: CreateSupplierDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId?: string | null,
  ) {
    return this.finance.updateSupplier(id, dto, this.scope(user, tenantId));
  }

  @RequirePermissions(Permission.READ_FINANCE)
  @UseGuards(PermissionsGuard)
  @Get('expenses')
  listExpenses(
    @Query('fundId') fundId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('buildingId') buildingId?: string,
    @Query('approvalStatus') approvalStatus?: string,
    @TenantId() tenantId?: string | null,
  ) {
    return this.finance.listExpenses({
      fundId,
      from,
      to,
      buildingId,
      tenantId,
      approvalStatus,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @RequirePermissions(Permission.READ_FINANCE)
  @UseGuards(PermissionsGuard)
  @Get('expenses/:id')
  getExpense(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId?: string | null,
  ) {
    return this.finance.getExpense(id, this.scope(user, tenantId));
  }

  @RequirePermissions(Permission.MANAGE_FINANCE)
  @UseGuards(PermissionsGuard)
  @Post('expenses')
  createExpense(@Body() dto: CreateExpenseDto, @CurrentUser() user: AuthUser) {
    return this.finance.createExpense(dto, user);
  }

  @RequirePermissions(Permission.MANAGE_FINANCE)
  @UseGuards(PermissionsGuard)
  @Post('expenses/:id/approve')
  approveExpense(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.finance.approveExpense(id, user);
  }

  @RequirePermissions(Permission.FINANCE_ADMIN)
  @UseGuards(PermissionsGuard)
  @Patch('expenses/:id/void')
  voidExpense(
    @Param('id') id: string,
    @Body() dto: VoidExpenseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.finance.voidExpense(id, dto.reason, user);
  }

  @RequirePermissions(Permission.READ_FINANCE)
  @UseGuards(PermissionsGuard)
  @Get('reports/cash-flow')
  cashFlow(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('buildingId') buildingId?: string,
    @Query('source') source?: 'legacy' | 'journal' | 'both',
    @TenantId() tenantId?: string | null,
  ) {
    const src =
      source === 'journal' || source === 'both' || source === 'legacy'
        ? source
        : undefined;
    return this.finance.getCashFlowReport(from, to, buildingId, tenantId, src);
  }

  @RequirePermissions(Permission.READ_FINANCE)
  @UseGuards(PermissionsGuard)
  @Get('sot-status')
  async sotStatus(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId?: string | null,
    @Query('buildingId') buildingId?: string,
  ) {
    return this.finance.getSotStatus(
      await this.access.resolveBuilding(user, buildingId, tenantId).catch(() => undefined),
    );
  }

  @RequirePermissions(Permission.READ_FINANCE)
  @UseGuards(PermissionsGuard)
  @Get('reports/expenses-summary')
  expensesSummary(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('buildingId') buildingId?: string,
    @TenantId() tenantId?: string | null,
  ) {
    return this.finance.getExpensesSummary(from, to, buildingId, tenantId);
  }

  @RequirePermissions(Permission.READ_FINANCE)
  @UseGuards(PermissionsGuard)
  @Get('reports/board.pdf')
  async boardReportPdf(
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('buildingId') buildingId: string | undefined,
    @TenantId() tenantId: string | null | undefined,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.finance.generateBoardReportPdf(
      from,
      to,
      buildingId,
      tenantId,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  /** ZIP of Excel (.xlsx) reports (cash-flow, debtors, expenses, 1C-style). */
  @RequirePermissions(Permission.READ_FINANCE)
  @UseGuards(PermissionsGuard)
  @Get('reports/export-pack.zip')
  async exportPack(
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('buildingId') buildingId: string | undefined,
    @TenantId() tenantId: string | null | undefined,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.finance.generateExportPack(
      from,
      to,
      buildingId,
      tenantId,
    );
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  // ── Budget ──────────────────────────────────────────────────────

  @RequirePermissions(Permission.READ_FINANCE)
  @UseGuards(PermissionsGuard)
  @Get('budget')
  async listBudget(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
    @Query('buildingId') buildingId: string,
    @Query('year') year: string,
  ) {
    await this.access.assertBuilding(user, buildingId, tenantId);
    return this.finance.listBudgetLines(buildingId, Number(year) || new Date().getFullYear());
  }

  @RequirePermissions(Permission.READ_FINANCE)
  @UseGuards(PermissionsGuard)
  @Get('budget/plan-fact')
  async budgetPlanFact(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
    @Query('buildingId') buildingId: string,
    @Query('year') year: string,
  ) {
    await this.access.assertBuilding(user, buildingId, tenantId);
    return this.finance.budgetPlanFact(
      buildingId,
      Number(year) || new Date().getFullYear(),
    );
  }

  @RequirePermissions(Permission.MANAGE_FINANCE)
  @UseGuards(PermissionsGuard)
  @Post('budget')
  async createBudget(
    @Body() dto: CreateBudgetLineDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
  ) {
    const b = await this.access.assertBuilding(user, dto.buildingId, tenantId);
    await this.access.assertRefsInBuilding(b.id, { fundIds: [dto.fundId] });
    await this.finance.assertCategoryVisible(dto.categoryId, b.tenantId);
    return this.finance.createBudgetLine(dto, user.id);
  }

  @RequirePermissions(Permission.MANAGE_FINANCE)
  @UseGuards(PermissionsGuard)
  @Patch('budget/:id')
  async updateBudget(
    @Param('id') id: string,
    @Body() dto: UpdateBudgetLineDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
  ) {
    const b = await this.budgetBuilding(user, tenantId, id);
    await this.access.assertRefsInBuilding(b.id, { fundIds: [dto.fundId] });
    await this.finance.assertCategoryVisible(dto.categoryId, b.tenantId);
    return this.finance.updateBudgetLine(id, dto, user.id);
  }

  @RequirePermissions(Permission.MANAGE_FINANCE)
  @UseGuards(PermissionsGuard)
  @Delete('budget/:id')
  async deleteBudget(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
  ) {
    await this.budgetBuilding(user, tenantId, id);
    return this.finance.deleteBudgetLine(id, user.id);
  }

  // ── Fund transfers ──────────────────────────────────────────────

  @RequirePermissions(Permission.READ_FINANCE)
  @UseGuards(PermissionsGuard)
  @Get('transfers')
  async listTransfers(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId?: string | null,
    @Query('buildingId') buildingId?: string,
  ) {
    if (buildingId) await this.access.assertBuilding(user, buildingId, tenantId);
    return this.finance.listFundTransfers(buildingId, this.scope(user, tenantId));
  }

  @RequirePermissions(Permission.MANAGE_FINANCE)
  @UseGuards(PermissionsGuard)
  @Post('transfers')
  async createTransfer(
    @Body() dto: CreateFundTransferDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId?: string | null,
  ) {
    const from = await this.access.assertFund(user, dto.fromFundId, tenantId);
    await this.access.assertRefsInBuilding(from.buildingId, { fundIds: [dto.toFundId] });
    return this.finance.createFundTransfer(dto, user.id);
  }

  @RequirePermissions(Permission.FINANCE_ADMIN)
  @UseGuards(PermissionsGuard)
  @Patch('transfers/:id/void')
  async voidTransfer(
    @Param('id') id: string,
    @Body() dto: VoidFundTransferDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId?: string | null,
  ) {
    const t = await this.prisma.fundTransfer.findUnique({
      where: { id },
      select: { fromFundId: true },
    });
    if (!t) throw new NotFoundException('Переказ не знайдено');
    await this.access.assertFund(user, t.fromFundId, tenantId);
    return this.finance.voidFundTransfer(id, dto.reason, user.id);
  }

  private async budgetBuilding(user: AuthUser, tenantId: string | null, id: string) {
    const line = await this.prisma.budgetLine.findUnique({
      where: { id },
      select: { buildingId: true },
    });
    if (!line) throw new NotFoundException('Рядок бюджету не знайдено');
    return this.access.assertBuilding(user, line.buildingId, tenantId);
  }
}
