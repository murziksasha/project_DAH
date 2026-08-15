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
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
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
  constructor(private journal: JournalService) {}

  @Get()
  list(
    @Query('limit') limit?: string,
    @Query('buildingId') buildingId?: string,
    @Query('period') period?: string,
    @Query('account') account?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.journal.listRecent(limit ? Number(limit) : 50, buildingId, {
      period,
      account,
      from,
      to,
    });
  }

  @Get('reconcile')
  reconcile(@Query('buildingId') buildingId?: string) {
    return this.journal.reconcile(buildingId);
  }

  @Get('shadow-compare')
  shadowCompare(@Query('buildingId') buildingId: string) {
    return this.journal.shadowCompare(buildingId);
  }

  @Get('fund-balances')
  fundBalances(@Query('buildingId') buildingId: string) {
    return this.journal.fundBalancesFromJournal(buildingId);
  }

  @Get('trial-balance')
  trialBalance(
    @Query('buildingId') buildingId?: string,
    @Query('period') period?: string,
  ) {
    return this.journal.trialBalance(buildingId, period);
  }

  @Get('account-card')
  accountCard(
    @Query('account') account: string,
    @Query('buildingId') buildingId?: string,
    @Query('period') period?: string,
    @Query('limit') limit?: string,
  ) {
    return this.journal.accountCard(account || 'cash', {
      buildingId,
      period,
      limit: limit ? Number(limit) : 200,
    });
  }

  @Get('coa')
  listCoa(@Query('buildingId') buildingId?: string) {
    return this.journal.listChartOfAccounts(buildingId);
  }

  @Post('coa/ensure-defaults')
  @Roles(UserRole.chairman, UserRole.accountant, UserRole.super_admin)
  ensureDefaults() {
    return this.journal.ensureDefaultChartOfAccounts();
  }

  @Patch('coa/:id/external-code')
  @Roles(UserRole.chairman, UserRole.accountant, UserRole.super_admin)
  setExternalCode(
    @Param('id') id: string,
    @Body() body: { externalCode?: string | null },
  ) {
    return this.journal.updateExternalCode(id, body.externalCode ?? null);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.journal.getEntry(id);
  }
}
