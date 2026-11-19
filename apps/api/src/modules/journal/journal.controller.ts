import {
  Body,
  Controller,
  ForbiddenException,
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
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { TenantAccessService } from '../../common/tenant-access/tenant-access.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { financeFlags } from '../../common/utils/finance-sot';
import { SetJournalSotDto } from './dto/set-journal-sot.dto';
import { UpdateExternalCodeDto } from './dto/update-external-code.dto';
import { JournalService } from './journal.service';

@ApiTags('journal')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(
  UserRole.chairman,
  UserRole.accountant,
  UserRole.board,
  UserRole.auditor,
  UserRole.super_admin,
)
@Controller('journal')
export class JournalController {
  constructor(
    private journal: JournalService,
    private access: TenantAccessService,
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
    @Query('limit') limit?: string,
    @Query('buildingId') buildingId?: string,
    @Query('period') period?: string,
    @Query('account') account?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const scope = await this.access.scopeBuildingIds(user, buildingId, tenantId);
    return this.journal.listRecent(limit ? Number(limit) : 50, scope, {
      period,
      account,
      from,
      to,
    });
  }

  @Get('reconcile')
  async reconcile(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
    @Query('buildingId') buildingId?: string,
  ) {
    const scope = await this.access.scopeBuildingIds(user, buildingId, tenantId);
    return this.journal.reconcile(scope && scope.length === 1 && buildingId ? scope[0] : scope);
  }

  @Get('shadow-compare')
  async shadowCompare(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
    @Query('buildingId') buildingId: string,
  ) {
    const id = await this.access.resolveBuilding(user, buildingId, tenantId);
    return this.journal.shadowCompare(id);
  }

  /** Roadmap «Journal as SoT»: readiness streak of daily shadow-compare runs. */
  @Get('sot-readiness')
  async sotReadiness(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
    @Query('buildingId') buildingId: string,
  ) {
    const id = await this.access.resolveBuilding(user, buildingId, tenantId);
    const [readiness, building] = await Promise.all([
      this.journal.sotReadiness(id),
      this.prisma.building.findUnique({ where: { id }, select: { settings: true } }),
    ]);
    return { ...readiness, ...financeFlags(building?.settings) };
  }

  /**
   * Phase 3: per-building Journal-SoT switch. Enabling needs the readiness streak
   * (409 otherwise; super_admin may force with a reason). Disabling = instant rollback.
   */
  @Post('sot')
  @Roles(UserRole.chairman, UserRole.accountant, UserRole.super_admin)
  async setSot(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
    @Body() dto: SetJournalSotDto,
  ) {
    const id = await this.access.resolveBuilding(user, dto.buildingId, tenantId);
    const result = await this.journal.setJournalSot(id, dto.enabled, user, {
      force: dto.force,
      reason: dto.reason,
    });
    await this.audit.log({
      userId: user.id,
      action: dto.enabled ? 'journal.sot_enabled' : 'journal.sot_disabled',
      entityType: 'Building',
      entityId: id,
      payload: {
        previous: result.previous,
        forced: result.forced,
        reason: dto.reason ?? null,
        streakDays: result.readiness.streakDays,
        requiredDays: result.readiness.requiredDays,
      },
    });
    return result;
  }

  /** Record today's shadow-compare now (otherwise the worker does it daily). */
  @Post('shadow-runs')
  @Roles(UserRole.chairman, UserRole.accountant, UserRole.super_admin)
  async recordShadowRun(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
    @Query('buildingId') buildingId: string,
  ) {
    const id = await this.access.resolveBuilding(user, buildingId, tenantId);
    return this.journal.recordShadowRun(id);
  }

  @Get('fund-balances')
  async fundBalances(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
    @Query('buildingId') buildingId: string,
  ) {
    const id = await this.access.resolveBuilding(user, buildingId, tenantId);
    return this.journal.fundBalancesFromJournal(id);
  }

  @Get('trial-balance')
  async trialBalance(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
    @Query('buildingId') buildingId?: string,
    @Query('period') period?: string,
  ) {
    const scope = await this.access.scopeBuildingIds(user, buildingId, tenantId);
    return this.journal.trialBalance(buildingId && scope ? scope[0] : scope, period);
  }

  @Get('account-card')
  async accountCard(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
    @Query('account') account: string,
    @Query('buildingId') buildingId?: string,
    @Query('period') period?: string,
    @Query('limit') limit?: string,
  ) {
    const scope = await this.access.scopeBuildingIds(user, buildingId, tenantId);
    return this.journal.accountCard(account || 'cash', {
      buildingId: buildingId && scope ? scope[0] : scope,
      period,
      limit: limit ? Number(limit) : 200,
    });
  }

  @Get('coa')
  async listCoa(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
    @Query('buildingId') buildingId?: string,
  ) {
    const scope = await this.access.scopeBuildingIds(user, buildingId, tenantId);
    return this.journal.listChartOfAccounts(scope);
  }

  /** Global default CoA rows are platform data — only super_admin may (re)create them. */
  @Post('coa/ensure-defaults')
  @Roles(UserRole.super_admin)
  ensureDefaults() {
    return this.journal.ensureDefaultChartOfAccounts();
  }

  @Patch('coa/:id/external-code')
  @Roles(UserRole.chairman, UserRole.accountant, UserRole.super_admin)
  async setExternalCode(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
    @Param('id') id: string,
    @Body() body: UpdateExternalCodeDto,
  ) {
    const acc = await this.prisma.ledgerAccount.findUnique({
      where: { id },
      select: { id: true, buildingId: true },
    });
    if (!acc) throw new NotFoundException('Рахунок не знайдено');
    if (!acc.buildingId && user.role !== UserRole.super_admin) {
      // Global chart of accounts is shared by every organization.
      throw new ForbiddenException('Глобальний план рахунків змінює лише адміністратор платформи');
    }
    await this.access.assertOptionalBuilding(user, acc.buildingId, tenantId);
    return this.journal.updateExternalCode(id, body.externalCode ?? null);
  }

  @Get(':id')
  async getOne(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string | null,
    @Param('id') id: string,
  ) {
    const entry = await this.journal.getEntry(id);
    if (!entry) throw new NotFoundException('Проводку не знайдено');
    await this.access.assertOptionalBuilding(user, entry.buildingId, tenantId);
    return entry;
  }
}
