import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
  list(@Query('limit') limit?: string, @Query('buildingId') buildingId?: string) {
    return this.journal.listRecent(limit ? Number(limit) : 50, buildingId);
  }

  @Get('reconcile')
  reconcile(@Query('buildingId') buildingId?: string) {
    return this.journal.reconcile(buildingId);
  }
}
