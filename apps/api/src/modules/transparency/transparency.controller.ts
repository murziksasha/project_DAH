import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { TransparencyService } from './transparency.service';

@ApiTags('transparency')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('transparency')
export class TransparencyController {
  constructor(private transparency: TransparencyService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.transparency.getResidentDashboard(user.role as UserRole);
  }

  @Get('debtors')
  debtors(@CurrentUser() user: AuthUser) {
    return this.transparency.getDebtorsForUser(user.role as UserRole);
  }
}