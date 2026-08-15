import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
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
import { UpdateBuildingDto } from './dto/update-building.dto';
import { UpdateBuildingSettingsDto } from './dto/update-settings.dto';
import { UpdateDocumentTemplatesDto } from './dto/update-document-templates.dto';

@ApiTags('building')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('building')
export class BuildingController {
  constructor(private building: BuildingService) {}

  @Get()
  getBuilding(@CurrentUser() user: AuthUser) {
    return this.building.getBuilding(undefined, user.role === 'super_admin' ? null : user.tenantId);
  }

  @Get('list')
  listBuildings(@CurrentUser() user: AuthUser) {
    return this.building.listBuildings(user.role === 'super_admin' ? null : user.tenantId);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.super_admin, UserRole.chairman)
  @Post('create')
  createBuilding(
    @Body() body: { name: string; address: string; edrpou?: string | null; tenantId?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.building.createBuilding(body, user.id, user.tenantId);
  }

  @Get('by/:id')
  getBuildingById(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.building.getBuilding(id, user.role === 'super_admin' ? null : user.tenantId);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.super_admin, UserRole.chairman, UserRole.board)
  @Patch()
  updateBuilding(@Body() dto: UpdateBuildingDto, @CurrentUser() user: AuthUser) {
    return this.building.updateBuildingProfile(dto, user.id);
  }

  @Get('apartments')
  listApartments(
    @Query('buildingId') buildingId: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.building.listApartments(
      buildingId,
      user.role === 'super_admin' ? null : user.tenantId,
    );
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
  @Roles(
    UserRole.super_admin,
    UserRole.chairman,
    UserRole.accountant,
    UserRole.board,
    UserRole.dispatcher,
    UserRole.auditor,
  )
  @Get('search')
  globalSearch(@Query('q') q: string | undefined, @CurrentUser() user: AuthUser) {
    return this.building.globalSearch(
      q ?? '',
      user.role === 'super_admin' ? null : user.tenantId,
    );
  }

  @UseGuards(RolesGuard)
  @Roles(
    UserRole.super_admin,
    UserRole.chairman,
    UserRole.accountant,
    UserRole.board,
    UserRole.auditor,
  )
  @Get('ops-summary')
  opsSummary(@Query('buildingId') buildingId?: string) {
    return this.building.getOpsSummary(buildingId);
  }

  /** УК portfolio: per-building debt / SLA / collection snapshot. */
  @UseGuards(RolesGuard)
  @Roles(
    UserRole.super_admin,
    UserRole.chairman,
    UserRole.accountant,
    UserRole.board,
    UserRole.auditor,
    UserRole.dispatcher,
  )
  @Get('portfolio')
  portfolio(@CurrentUser() user: AuthUser) {
    return this.building.getPortfolioSummary(
      user.role === 'super_admin' ? null : user.tenantId,
    );
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.super_admin, UserRole.chairman, UserRole.board)
  @Patch('settings')
  updateSettings(@Body() dto: UpdateBuildingSettingsDto, @CurrentUser() user: AuthUser) {
    return this.building.updateSettings(dto, user.id);
  }

  /** Document constructor: receipt / board report layouts + Excel export columns. */
  @Get('document-templates')
  getDocumentTemplates(@Query('buildingId') buildingId?: string) {
    return this.building.getDocumentTemplates(buildingId);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.super_admin, UserRole.chairman, UserRole.board, UserRole.accountant)
  @Patch('document-templates')
  updateDocumentTemplates(
    @Body() dto: UpdateDocumentTemplatesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.building.updateDocumentTemplates(dto, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.super_admin, UserRole.chairman)
  @Post('apartments')
  createApartment(@Body() dto: CreateApartmentDto, @CurrentUser() user: AuthUser) {
    return this.building.createApartment(
      dto,
      user.id,
      user.role === 'super_admin' ? null : user.tenantId,
    );
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.super_admin, UserRole.chairman)
  @Post('apartments/import')
  importApartments(@Body() body: { csv: string }, @CurrentUser() user: AuthUser) {
    return this.building.importApartmentsCsv(body.csv ?? '', user.id);
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