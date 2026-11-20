import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permission } from '@dah/shared';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { TenantAccessService } from '../../common/tenant-access/tenant-access.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DeepAccountingService } from './deep-accounting.service';
import {
  CloseSnapshotDto,
  CreateBankReconciliationDto,
  CreateSupplierInvoiceDto,
  CreateTariffDto,
  CreateWriteOffDto,
  ManualAdjustmentDto,
  PaySupplierInvoiceDto,
  RunTariffsDto,
  UpdateTariffDto,
  YearEndDto,
} from './dto/deep-accounting.dto';

@ApiTags('accounting')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('accounting')
export class DeepAccountingController {
  constructor(
    private svc: DeepAccountingService,
    private access: TenantAccessService,
    private prisma: PrismaService,
  ) {}

  /** Verify buildingId belongs to caller's organization (404 otherwise). */
  private async building(user: AuthUser, tenantId: string | null, buildingId?: string) {
    return (await this.access.assertBuilding(user, buildingId, tenantId)).id;
  }

  private async rowBuilding(
    user: AuthUser,
    tenantId: string | null,
    row: { buildingId: string } | null,
    msg: string,
  ) {
    if (!row) throw new NotFoundException(msg);
    await this.access.assertBuilding(user, row.buildingId, tenantId);
    return row.buildingId;
  }

  // AR
  @RequirePermissions(Permission.READ_FINANCE)
  @Get('ar-aging')
  async arAging(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
    @Query('buildingId') buildingId: string,
    @Query('asOf') asOf?: string,
  ) {
    return this.svc.arAging(await this.building(user, tenantId, buildingId), asOf);
  }

  @RequirePermissions(Permission.READ_FINANCE)
  @Get('apartments/:apartmentId/statement')
  async apartmentStatement(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
    @Param('apartmentId') apartmentId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    await this.access.assertApartment(user, apartmentId, tenantId);
    return this.svc.apartmentStatement(apartmentId, from, to);
  }

  // Write-offs
  @RequirePermissions(Permission.READ_FINANCE)
  @Get('write-offs')
  async listWriteOffs(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
    @Query('buildingId') buildingId: string,
  ) {
    return this.svc.listWriteOffs(await this.building(user, tenantId, buildingId));
  }

  @RequirePermissions(Permission.MANAGE_FINANCE)
  @Post('write-offs')
  async createWriteOff(
    @Body() body: CreateWriteOffDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
  ) {
    await this.access.assertApartment(user, body.apartmentId, tenantId);
    if (body.accrualLineId) {
      const line = await this.prisma.accrualLine.findUnique({
        where: { id: body.accrualLineId },
        select: { apartmentId: true },
      });
      if (!line || line.apartmentId !== body.apartmentId) {
        throw new NotFoundException('Рядок нарахування не знайдено');
      }
    }
    return this.svc.createWriteOff(body, user.id);
  }

  // M15: SPEC/05 «write-offs/:id/approve — manage finance»; SPEC/03 board = «Фінанси».
  // Maker-checker (approver ≠ creator) stays in the service.
  @RequirePermissions(Permission.MANAGE_FINANCE)
  @Post('write-offs/:id/approve')
  async approveWriteOff(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
  ) {
    await this.rowBuilding(
      user,
      tenantId,
      await this.prisma.debtWriteOff.findUnique({ where: { id }, select: { buildingId: true } }),
      'Списання не знайдено',
    );
    return this.svc.approveWriteOff(id, user.id, user.role);
  }

  // Tariffs
  @RequirePermissions(Permission.READ_FINANCE)
  @Get('tariffs')
  async listTariffs(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
    @Query('buildingId') buildingId: string,
  ) {
    return this.svc.listTariffs(await this.building(user, tenantId, buildingId));
  }

  @RequirePermissions(Permission.MANAGE_FINANCE)
  @Post('tariffs')
  async createTariff(
    @Body() body: CreateTariffDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
  ) {
    const b = await this.building(user, tenantId, body.buildingId);
    await this.access.assertRefsInBuilding(b, { fundIds: [body.fundId] });
    return this.svc.createTariff(body, user.id);
  }

  @RequirePermissions(Permission.MANAGE_FINANCE)
  @Patch('tariffs/:id')
  async updateTariff(
    @Param('id') id: string,
    @Body() body: UpdateTariffDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
  ) {
    await this.rowBuilding(
      user,
      tenantId,
      await this.prisma.serviceTariff.findUnique({ where: { id }, select: { buildingId: true } }),
      'Тариф не знайдено',
    );
    return this.svc.updateTariff(id, body, user.id);
  }

  // AP
  @RequirePermissions(Permission.READ_FINANCE)
  @Get('supplier-invoices')
  async listInvoices(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
    @Query('buildingId') buildingId: string,
    @Query('status') status?: string,
  ) {
    return this.svc.listInvoices(await this.building(user, tenantId, buildingId), status);
  }

  @RequirePermissions(Permission.MANAGE_FINANCE)
  @Post('supplier-invoices')
  async createInvoice(
    @Body() body: CreateSupplierInvoiceDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
  ) {
    const b = await this.building(user, tenantId, body.buildingId);
    await this.access.assertRefsInBuilding(b, {
      fundIds: [body.fundId],
      supplierIds: [body.supplierId],
    });
    return this.svc.createInvoice(body, user.id);
  }

  @RequirePermissions(Permission.MANAGE_FINANCE)
  @Post('supplier-invoices/:id/approve')
  async approveInvoice(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
  ) {
    await this.rowBuilding(
      user,
      tenantId,
      await this.prisma.supplierInvoice.findUnique({ where: { id }, select: { buildingId: true } }),
      'Рахунок не знайдено',
    );
    return this.svc.approveInvoice(id, user.id);
  }

  @RequirePermissions(Permission.MANAGE_FINANCE)
  @Post('supplier-invoices/pay')
  async payInvoice(
    @Body() body: PaySupplierInvoiceDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
  ) {
    await this.rowBuilding(
      user,
      tenantId,
      await this.prisma.supplierInvoice.findUnique({
        where: { id: body.invoiceId },
        select: { buildingId: true },
      }),
      'Рахунок не знайдено',
    );
    return this.svc.payInvoice(body, user.id);
  }

  @RequirePermissions(Permission.READ_FINANCE)
  @Get('ap-aging')
  async apAging(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
    @Query('buildingId') buildingId: string,
  ) {
    return this.svc.apAging(await this.building(user, tenantId, buildingId));
  }

  // Bank rec
  @RequirePermissions(Permission.READ_FINANCE)
  @Get('bank-reconciliations')
  async listBankRec(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
    @Query('buildingId') buildingId: string,
  ) {
    return this.svc.listBankReconciliations(await this.building(user, tenantId, buildingId));
  }

  @RequirePermissions(Permission.READ_FINANCE)
  @Get('bank-gl-balance')
  async glBalance(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
    @Query('buildingId') buildingId: string,
    @Query('bankAccountId') bankAccountId?: string,
  ) {
    const b = await this.building(user, tenantId, buildingId);
    await this.access.assertRefsInBuilding(b, { bankAccountIds: [bankAccountId] });
    const balance = await this.svc.glBankBalance(b, bankAccountId);
    return { buildingId: b, bankAccountId: bankAccountId ?? null, balance };
  }

  @RequirePermissions(Permission.MANAGE_FINANCE)
  @Post('bank-reconciliations')
  async createBankRec(
    @Body() body: CreateBankReconciliationDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
  ) {
    const b = await this.building(user, tenantId, body.buildingId);
    await this.access.assertRefsInBuilding(b, { bankAccountIds: [body.bankAccountId] });
    return this.svc.createBankReconciliation(body, user.id);
  }

  @RequirePermissions(Permission.MANAGE_FINANCE)
  @Post('bank-reconciliations/:id/close')
  async closeBankRec(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
  ) {
    await this.rowBuilding(
      user,
      tenantId,
      await this.prisma.bankReconciliation.findUnique({
        where: { id },
        select: { buildingId: true },
      }),
      'Звірку не знайдено',
    );
    return this.svc.closeBankReconciliation(id, user.id);
  }

  @RequirePermissions(Permission.READ_FINANCE)
  @Get('cash-book')
  async cashBook(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
    @Query('buildingId') buildingId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.cashBook(await this.building(user, tenantId, buildingId), from, to);
  }

  // Close pack
  @RequirePermissions(Permission.MANAGE_FINANCE)
  @Post('periods/close-snapshot')
  async closeSnapshot(
    @Body() body: CloseSnapshotDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
  ) {
    const b = await this.building(user, tenantId, body.buildingId);
    return this.svc.createCloseSnapshot(b, body.period, user.id);
  }

  @RequirePermissions(Permission.READ_FINANCE)
  @Get('periods/close-snapshots')
  async listSnapshots(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
    @Query('buildingId') buildingId: string,
    @Query('period') period?: string,
  ) {
    return this.svc.listCloseSnapshots(await this.building(user, tenantId, buildingId), period);
  }

  // Budget encumbrance
  @RequirePermissions(Permission.READ_FINANCE)
  @Get('budget/plan-fact-encumbrance')
  async budgetEnc(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
    @Query('buildingId') buildingId: string,
    @Query('year') year?: string,
  ) {
    return this.svc.budgetPlanFactWithEncumbrance(
      await this.building(user, tenantId, buildingId),
      Number(year) || new Date().getFullYear(),
    );
  }

  // CoA export map
  @RequirePermissions(Permission.READ_FINANCE)
  @Get('coa-export-map')
  async coaMap(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
    @Query('buildingId') buildingId?: string,
  ) {
    // Without buildingId only global rows are returned (no building-specific accounts leak).
    if (buildingId) await this.building(user, tenantId, buildingId);
    return this.svc.exportCoaMapping(buildingId);
  }

  @RequirePermissions(Permission.MANAGE_FINANCE)
  @Post('tariffs/run')
  async runTariffs(
    @Body() body: RunTariffsDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
  ) {
    await this.building(user, tenantId, body.buildingId);
    return this.svc.runTariffs(body, user.id);
  }

  @RequirePermissions(Permission.READ_FINANCE)
  @Get('overview')
  async overview(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
    @Query('buildingId') buildingId: string,
  ) {
    return this.svc.accountantOverview(await this.building(user, tenantId, buildingId));
  }

  @RequirePermissions(Permission.READ_FINANCE)
  @Get('owner-change-policy')
  async ownerPolicy(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
    @Query('apartmentId') apartmentId: string,
  ) {
    await this.access.assertApartment(user, apartmentId, tenantId);
    return this.svc.ownerChangePolicy(apartmentId);
  }

  // M15: corrections/closing — SPEC/03 «Анулювання» board ❌ → FINANCE_ADMIN (chairman, accountant).
  @RequirePermissions(Permission.FINANCE_ADMIN)
  @Post('year-end')
  async yearEnd(
    @Body() body: YearEndDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
  ) {
    const b = await this.building(user, tenantId, body.buildingId);
    return this.svc.yearEndClose(b, Number(body.year), user.id, user.role);
  }

  @RequirePermissions(Permission.FINANCE_ADMIN)
  @Post('adjustments')
  async adjustment(
    @Body() body: ManualAdjustmentDto,
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
  ) {
    const b = await this.building(user, tenantId, body.buildingId);
    await this.access.assertRefsInBuilding(b, {
      fundIds: body.lines.map((l) => l.fundId),
      apartmentIds: body.lines.map((l) => l.apartmentId),
      supplierIds: body.lines.map((l) => l.supplierId),
    });
    return this.svc.postManualAdjustment(body, user.id);
  }
}
