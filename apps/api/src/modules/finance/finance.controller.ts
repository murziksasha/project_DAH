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
import { UserRole } from '@prisma/client';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
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

  @Get('categories')
  listCategories() {
    return this.finance.listCategories();
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
  ) {
    return this.finance.listExpenses({ fundId, from, to });
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
}