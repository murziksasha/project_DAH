import { Permission } from '@dah/shared';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
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
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';

import { CreatePaymentDto } from './dto/create-payment.dto';
import {
  AssignStatementLineDto,
  ImportPaymentsDto,
  ImportPreviewDto,
} from './dto/import-payments.dto';
import { CreateOnlinePaymentIntentDto } from './dto/online-payment.dto';
import { OnlinePaymentsService } from './online-payments.service';
import { VoidPaymentDto } from './dto/void-payment.dto';
import { PaymentsService } from './payments.service';
import { TenantAccessService } from '../../common/tenant-access/tenant-access.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private payments: PaymentsService,
    private online: OnlinePaymentsService,
    private access: TenantAccessService,
  ) {}

  /** Public webhook for acquiring provider (no JWT). Accepts generic / LiqPay / WayForPay bodies. */
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('online/webhook')
  onlineWebhook(@Body() body: Record<string, unknown>) {
    return this.online.handleWebhook(body);
  }

  @Get('online/status')
  onlineStatus() {
    return this.online.status();
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Get('online/orders/:orderId')
  onlineOrder(@Param('orderId') orderId: string, @CurrentUser() user: AuthUser) {
    return this.online.getOrder(orderId, user);
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

  @RequirePermissions(Permission.READ_FINANCE)
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
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
    // Residents may list only own apartments (enforced in service).
    // Staff need read finance roles for building-wide lists without apartmentId.
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

  @RequirePermissions(Permission.MANAGE_FINANCE)
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @Get('preview/allocation')
  preview(
    @Query('apartmentId') apartmentId: string,
    @Query('amount') amount: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payments.previewAllocation(apartmentId, Number(amount), user);
  }

  @RequirePermissions(Permission.MANAGE_FINANCE)
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @Post()
  create(@Body() dto: CreatePaymentDto, @CurrentUser() user: AuthUser) {
    return this.payments.createPayment(dto, user);
  }

  @RequirePermissions(Permission.MANAGE_FINANCE)
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @Post('import/preview')
  async importPreview(
    @Body() dto: ImportPreviewDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
  ) {
    const scopeTenant = this.access.effectiveTenantId(user, tenantId);
    const buildingIds = await this.access.scopeBuildingIds(user, dto.buildingId, tenantId);
    return this.payments.previewBankImport(
      dto.csv,
      dto.buildingId,
      dto.format,
      user.id,
      dto.sourceFileName,
      { buildingIds, tenantId: scopeTenant },
    );
  }

  @RequirePermissions(Permission.MANAGE_FINANCE)
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @Patch('import/lines/:lineId')
  assignLine(
    @Param('lineId') lineId: string,
    @Body() dto: AssignStatementLineDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
  ) {
    return this.payments.assignStatementLine(
      lineId,
      dto.apartmentId,
      user,
      this.access.effectiveTenantId(user, tenantId),
    );
  }

  @RequirePermissions(Permission.MANAGE_FINANCE)
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @Patch('import/lines/:lineId/ignore')
  ignoreLine(
    @Param('lineId') lineId: string,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
  ) {
    return this.payments.ignoreStatementLine(
      lineId,
      user,
      this.access.effectiveTenantId(user, tenantId),
    );
  }

  @RequirePermissions(Permission.READ_FINANCE)
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @Get('import/unmatched')
  async unmatchedReport(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
    @Query('buildingId') buildingId?: string,
    @Query('days') days?: string,
  ) {
    if (buildingId) await this.access.assertBuilding(user, buildingId, tenantId);
    return this.payments.unmatchedStatementReport(
      buildingId,
      days ? Number(days) : 30,
      this.access.effectiveTenantId(user, tenantId),
    );
  }

  @RequirePermissions(Permission.MANAGE_FINANCE)
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @Post('import')
  importCommit(
    @Body() dto: ImportPaymentsDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
  ) {
    return this.payments.importPayments(dto, user, this.access.effectiveTenantId(user, tenantId));
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.payments.getPayment(id, user);
  }

  @RequirePermissions(Permission.FINANCE_ADMIN)
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @Patch(':id/void')
  void(@Param('id') id: string, @Body() dto: VoidPaymentDto, @CurrentUser() user: AuthUser) {
    return this.payments.voidPayment(id, dto.reason, user);
  }
}