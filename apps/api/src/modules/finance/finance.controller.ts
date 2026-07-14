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
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateBankAccountDto, UpdateBankAccountDto } from './dto/bank-account.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
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
  listFunds() {
    return this.finance.listFunds();
  }

  @Get('bank-accounts')
  listBankAccounts() {
    return this.finance.listBankAccounts();
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.chairman, UserRole.accountant)
  @Post('bank-accounts')
  createBankAccount(@Body() dto: CreateBankAccountDto, @CurrentUser() user: AuthUser) {
    return this.finance.createBankAccount(dto, user.id);
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
  listSuppliers() {
    return this.finance.listSuppliers();
  }

  @UseGuards(RolesGuard)
  @Roles(...FINANCE_WRITE_ROLES)
  @Post('suppliers')
  createSupplier(@Body() dto: CreateSupplierDto) {
    return this.finance.createSupplier(dto);
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
  ) {
    return this.finance.listExpenses({
      fundId,
      from,
      to,
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
  cashFlow(@Query('from') from?: string, @Query('to') to?: string) {
    return this.finance.getCashFlowReport(from, to);
  }

  @Get('reports/expenses-summary')
  expensesSummary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.finance.getExpensesSummary(from, to);
  }

  @Get('reports/board.pdf')
  async boardReportPdf(
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.finance.generateBoardReportPdf(from, to);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}