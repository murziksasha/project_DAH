import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BuildingService } from './building.service';
import { CreateApartmentDto } from './dto/create-apartment.dto';
import { CreateResidentDto } from './dto/create-resident.dto';
import { UpdateApartmentDto } from './dto/update-apartment.dto';
import { UpdateResidentDto } from './dto/update-resident.dto';
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
  @Roles(UserRole.super_admin, UserRole.chairman, UserRole.board)
  @Patch('settings')
  updateSettings(@Body() dto: UpdateBuildingSettingsDto, @CurrentUser() user: AuthUser) {
    return this.building.updateSettings(dto, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.super_admin, UserRole.chairman)
  @Post('apartments')
  createApartment(@Body() dto: CreateApartmentDto, @CurrentUser() user: AuthUser) {
    return this.building.createApartment(dto, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.super_admin, UserRole.chairman)
  @Patch('apartments/:id')
  updateApartment(
    @Param('id') id: string,
    @Body() dto: UpdateApartmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.building.updateApartment(id, dto, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.super_admin, UserRole.chairman)
  @Delete('apartments/:id')
  deleteApartment(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.building.deleteApartment(id, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.super_admin, UserRole.chairman)
  @Post('apartments/:apartmentId/residents')
  createResident(
    @Param('apartmentId') apartmentId: string,
    @Body() dto: CreateResidentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.building.createResident(apartmentId, dto, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.super_admin, UserRole.chairman)
  @Patch('residents/:id')
  updateResident(
    @Param('id') id: string,
    @Body() dto: UpdateResidentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.building.updateResident(id, dto, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.super_admin, UserRole.chairman)
  @Delete('residents/:id')
  deleteResident(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.building.deleteResident(id, user.id);
  }
}