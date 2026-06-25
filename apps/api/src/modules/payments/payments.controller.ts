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
import { CreatePaymentDto } from './dto/create-payment.dto';
import { VoidPaymentDto } from './dto/void-payment.dto';
import { PaymentsService } from './payments.service';

const WRITE_ROLES = [UserRole.chairman, UserRole.accountant, UserRole.board];
const REPORT_ROLES = [...WRITE_ROLES, UserRole.auditor];

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('payments')
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  @Get('reports/debtors')
  @UseGuards(RolesGuard)
  @Roles(...REPORT_ROLES)
  debtors() {
    return this.payments.getDebtorsReport();
  }

  @Get()
  list(@Query('apartmentId') apartmentId?: string) {
    return this.payments.listPayments(apartmentId);
  }

  @UseGuards(RolesGuard)
  @Roles(...WRITE_ROLES)
  @Get('preview/allocation')
  preview(
    @Query('apartmentId') apartmentId: string,
    @Query('amount') amount: string,
  ) {
    return this.payments.previewAllocation(apartmentId, Number(amount));
  }

  @UseGuards(RolesGuard)
  @Roles(...WRITE_ROLES)
  @Post()
  create(@Body() dto: CreatePaymentDto, @CurrentUser() user: AuthUser) {
    return this.payments.createPayment(dto, user.id);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.payments.getPayment(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.chairman, UserRole.accountant)
  @Patch(':id/void')
  void(@Param('id') id: string, @Body() dto: VoidPaymentDto, @CurrentUser() user: AuthUser) {
    return this.payments.voidPayment(id, dto.reason, user.id);
  }
}