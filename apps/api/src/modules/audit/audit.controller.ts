import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuditService } from './audit.service';

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.super_admin, UserRole.chairman, UserRole.auditor)
@Controller('audit')
export class AuditController {
  constructor(private audit: AuditService) {}

  @Get('logs')
  list(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('entityType') entityType?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.audit.list({
      limit: limit ? Number(limit) : undefined,
      cursor,
      entityType,
      action,
      from,
      to,
    });
  }
}