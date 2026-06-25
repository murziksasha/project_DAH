import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BuildingService } from './building.service';
import { UpdateBuildingSettingsDto } from './dto/update-settings.dto';

@ApiTags('building')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('building')
export class BuildingController {
  constructor(private building: BuildingService) {}

  @Get()
  getBuilding() {
    return this.building.getBuilding();
  }

  @Get('apartments')
  listApartments() {
    return this.building.listApartments();
  }

  @Get('apartments/:id')
  getApartment(@Param('id') id: string) {
    return this.building.getApartment(id);
  }

  @Get('settings')
  getSettings() {
    return this.building.getSettings();
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.chairman, UserRole.board)
  @Patch('settings')
  updateSettings(@Body() dto: UpdateBuildingSettingsDto, @CurrentUser() user: AuthUser) {
    return this.building.updateSettings(dto.showDebtorsToResidents, user.id);
  }
}