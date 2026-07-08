import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SetupApartmentsDto } from './dto/setup-apartment.dto';
import { SetupBankDto } from './dto/setup-bank.dto';
import { SetupBuildingDto } from './dto/setup-building.dto';
import { SetupUsersDto } from './dto/setup-users.dto';
import { SetupService } from './setup.service';

@ApiTags('setup')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.super_admin)
@Controller('setup')
export class SetupController {
  constructor(private setup: SetupService) {}

  @Get('status')
  status() {
    return this.setup.getStatus();
  }

  @Post('building')
  building(@Body() dto: SetupBuildingDto, @CurrentUser() user: AuthUser) {
    return this.setup.upsertBuilding(dto, user.id);
  }

  @Post('bank')
  bank(@Body() dto: SetupBankDto, @CurrentUser() user: AuthUser) {
    return this.setup.setupBank(dto, user.id);
  }

  @Post('apartments')
  apartments(@Body() dto: SetupApartmentsDto, @CurrentUser() user: AuthUser) {
    return this.setup.setupApartments(dto, user.id);
  }

  @Post('users')
  users(@Body() dto: SetupUsersDto, @CurrentUser() user: AuthUser) {
    return this.setup.setupUsers(dto, user.id);
  }

  @Post('complete')
  complete(@CurrentUser() user: AuthUser) {
    return this.setup.complete(user.id);
  }
}