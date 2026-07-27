import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Response } from 'express';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateBankAccountDto, UpdateBankAccountDto } from './dto/bank-account.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateFundDto } from './dto/create-fund.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateFundDto } from './dto/update-fund.dto';
import { VoidExpenseDto } from './dto/void-expense.dto';
import { FinanceService } from './finance.service';

const FINANCE_WRITE_ROLES = [UserRole.chairman, UserRole.accountant, UserRole.board];

@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('finance')
export class FinanceController {
  constructor(private finance: FinanceService) {}

  @Get('funds')
  listFunds(
    @Query('buildingId') buildingId?: string,
    @TenantId() tenantId?: string | null,
  ) {
    return this.finance.listFunds(buildingId, tenantId);
  }

  @UseGuards(RolesGuard)
  @Roles(...FINANCE_WRITE_ROLES)
  @Post('funds')
  createFund(
    @Body() dto: CreateFundDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId?: string | null,
  ) {
    return this.finance.createFund(dto, user.id, tenantId);
  }

  @Get('bank-accounts')
  listBankAccounts(
    @Query('buildingId') buildingId?: string,
    @TenantId() tenantId?: string | null,
  ) {
    return this.finance.listBankAccounts(buildingId, tenantId);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.chairman, UserRole.accountant)
  @Post('bank-accounts')
  createBankAccount(
    @Body() dto: CreateBankAccountDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId?: string | null,
  ) {
    return this.finance.createBankAccount(dto, user.id, tenantId);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.chairman, UserRole.accountant)
  @Patch('bank-accounts/:id')
  updateBankAccount(
    @Param('id') id: string,
    @Body() dto: UpdateBankAccountDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.finance.updateBankAccount(id, dto, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.chairman, UserRole.accountant)
  @Delete('bank-accounts/:id')
  deleteBankAccount(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.finance.deleteBankAccount(id, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.chairman, UserRole.accountant)
  @Patch('funds/:id')
  updateFund(
    @Param('id') id: string,
    @Body() dto: UpdateFundDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.finance.updateFund(id, dto, user.id);
  }

  @Get('categories')
  listCategories() {
    return this.finance.listCategories();
  }

  @UseGuards(RolesGuard)
  @Roles(...FINANCE_WRITE_ROLES)
  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.finance.createCategory(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(...FINANCE_WRITE_ROLES)
  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: CreateCategoryDto) {
    return this.finance.updateCategory(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.chairman, UserRole.accountant)
  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string) {
    return this.finance.deleteCategory(id);
  }

  @Get('suppliers')
  listSuppliers(
    @Query('buildingId') buildingId?: string,
    @TenantId() tenantId?: string | null,
  ) {
    return this.finance.listSuppliers(buildingId, tenantId);
  }

  @UseGuards(RolesGuard)
  @Roles(...FINANCE_WRITE_ROLES)
  @Post('suppliers')
  createSupplier(
    @Body() dto: CreateSupplierDto,
    @TenantId() tenantId?: string | null,
  ) {
    return this.finance.createSupplier(dto, tenantId);
  }

  @UseGuards(RolesGuard)
  @Roles(...FINANCE_WRITE_ROLES)
  @Patch('suppliers/:id')
  updateSupplier(@Param('id') id: string, @Body() dto: CreateSupplierDto) {
    return this.finance.updateSupplier(id, dto);
  }

  @Get('expenses')
  listExpenses(
    @Query('fundId') fundId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('buildingId') buildingId?: string,
    @TenantId() tenantId?: string | null,
  ) {
    return this.finance.listExpenses({
      fundId,
      from,
      to,
      buildingId,
      tenantId,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('expenses/:id')
  getExpense(@Param('id') id: string) {
    return this.finance.getExpense(id);
  }

  @UseGuards(RolesGuard)
  @Roles(...FINANCE_WRITE_ROLES)
  @Post('expenses')
  createExpense(@Body() dto: CreateExpenseDto, @CurrentUser() user: AuthUser) {
    return this.finance.createExpense(dto, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.chairman, UserRole.accountant)
  @Patch('expenses/:id/void')
  voidExpense(
    @Param('id') id: string,
    @Body() dto: VoidExpenseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.finance.voidExpense(id, dto.reason, user.id);
  }

  @Get('reports/cash-flow')
  cashFlow(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('buildingId') buildingId?: string,
    @TenantId() tenantId?: string | null,
  ) {
    return this.finance.getCashFlowReport(from, to, buildingId, tenantId);
  }

  @Get('reports/expenses-summary')
  expensesSummary(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('buildingId') buildingId?: string,
    @TenantId() tenantId?: string | null,
  ) {
    return this.finance.getExpensesSummary(from, to, buildingId, tenantId);
  }

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

  /** ZIP of Excel-friendly CSV reports (cash-flow, debtors, expenses, 1C-style). */
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
}