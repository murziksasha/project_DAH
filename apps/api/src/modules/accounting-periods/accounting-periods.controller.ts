import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccountingPeriodStatus, UserRole } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AccountingPeriodsService } from './accounting-periods.service';

class SetPeriodStatusDto {
  @IsString()
  buildingId!: string;

  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period!: string;

  @IsEnum(AccountingPeriodStatus)
  status!: AccountingPeriodStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

const READ_ROLES = [
  UserRole.chairman,
  UserRole.accountant,
  UserRole.board,
  UserRole.auditor,
  UserRole.super_admin,
];

const WRITE_ROLES = [UserRole.chairman, UserRole.accountant, UserRole.board, UserRole.super_admin];

@ApiTags('finance-periods')
@ApiBearerAuth()
@Controller('finance/periods')
export class AccountingPeriodsController {
  constructor(private periods: AccountingPeriodsService) {}

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...READ_ROLES)
  @Get()
  list(@Query('buildingId') buildingId: string) {
    return this.periods.list(buildingId);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...READ_ROLES)
  @Get('checklist')
  checklist(
    @Query('buildingId') buildingId: string,
    @Query('period') period: string,
  ) {
    return this.periods.closeChecklist(buildingId, period);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...WRITE_ROLES)
  @Patch()
  setStatus(@Body() dto: SetPeriodStatusDto, @CurrentUser() user: AuthUser) {
    return this.periods.setStatus(
      dto.buildingId,
      dto.period,
      dto.status,
      user.id,
      user.role,
      dto.notes,
    );
  }
}
