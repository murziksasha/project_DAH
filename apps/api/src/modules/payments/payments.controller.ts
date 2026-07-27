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
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ImportPaymentsDto, ImportPreviewDto } from './dto/import-payments.dto';
import {
  CreateOnlinePaymentIntentDto,
  OnlinePaymentWebhookDto,
} from './dto/online-payment.dto';
import { OnlinePaymentsService } from './online-payments.service';
import { VoidPaymentDto } from './dto/void-payment.dto';
import { PaymentsService } from './payments.service';

const WRITE_ROLES = [UserRole.chairman, UserRole.accountant, UserRole.board];
const REPORT_ROLES = [...WRITE_ROLES, UserRole.auditor];

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private payments: PaymentsService,
    private online: OnlinePaymentsService,
  ) {}

  /** Public webhook for acquiring provider (no JWT). */
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('online/webhook')
  onlineWebhook(@Body() dto: OnlinePaymentWebhookDto) {
    return this.online.handleWebhook(dto);
  }

  @Get('online/status')
  onlineStatus() {
    return this.online.status();
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Post('online/intent')
  createOnlineIntent(
    @Body() dto: CreateOnlinePaymentIntentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.online.createIntent(dto, user);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Post('online/sandbox-complete')
  sandboxComplete(
    @Body() dto: CreateOnlinePaymentIntentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.online.sandboxComplete(dto, user);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...REPORT_ROLES)
  @Get('reports/debtors')
  debtors(
    @Query('buildingId') buildingId?: string,
    @TenantId() tenantId?: string | null,
  ) {
    return this.payments.getDebtorsReport(buildingId, tenantId);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Get()
  list(
    @Query('apartmentId') apartmentId: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('buildingId') buildingId: string | undefined,
    @TenantId() tenantId: string | null | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payments.listPayments(user, {
      apartmentId,
      from,
      to,
      buildingId,
      tenantId,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...WRITE_ROLES)
  @Get('preview/allocation')
  preview(
    @Query('apartmentId') apartmentId: string,
    @Query('amount') amount: string,
  ) {
    return this.payments.previewAllocation(apartmentId, Number(amount));
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...WRITE_ROLES)
  @Post()
  create(@Body() dto: CreatePaymentDto, @CurrentUser() user: AuthUser) {
    return this.payments.createPayment(dto, user);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...WRITE_ROLES)
  @Post('import/preview')
  importPreview(@Body() dto: ImportPreviewDto) {
    return this.payments.previewBankImport(dto.csv);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...WRITE_ROLES)
  @Post('import')
  importCommit(@Body() dto: ImportPaymentsDto, @CurrentUser() user: AuthUser) {
    return this.payments.importPayments(dto, user);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.payments.getPayment(id, user);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.chairman, UserRole.accountant)
  @Patch(':id/void')
  void(@Param('id') id: string, @Body() dto: VoidPaymentDto, @CurrentUser() user: AuthUser) {
    return this.payments.voidPayment(id, dto.reason, user.id);
  }
}