import {
  Body,
  Controller,
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
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { MetersService } from './meters.service';
import { CreateMeterDto, MeterReadingDto } from './dto/meter.dto';

const WRITE = [UserRole.chairman, UserRole.accountant, UserRole.board, UserRole.super_admin];

@ApiTags('meters')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('meters')
export class MetersController {
  constructor(
    private meters: MetersService,
    private prisma: PrismaService,
  ) {}

  @Get()
  listBuilding(
    @Query('buildingId') buildingId?: string,
    @TenantId() tenantId?: string | null,
  ) {
    return this.meters.listForBuilding(buildingId, tenantId);
  }

  @Get('apartment/:apartmentId')
  async listApartment(
    @Param('apartmentId') apartmentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.meters.assertApartmentAccess(user, apartmentId);
    return this.meters.listByApartment(apartmentId);
  }

  @UseGuards(RolesGuard)
  @Roles(...WRITE)
  @Post()
  create(
    @Body() body: CreateMeterDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.meters.createMeter(body, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(...WRITE)
  @Post(':id/readings')
  addReading(
    @Param('id') id: string,
    @Body() body: MeterReadingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.meters.addReading(id, body, user.id);
  }

  /** Resident can submit reading for own apartment meters. */
  @Post(':id/readings/self')
  async selfReading(
    @Param('id') id: string,
    @Body() body: MeterReadingDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.prisma.meter.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Лічильник не знайдено');
    await this.meters.assertApartmentAccess(user, row.apartmentId);
    return this.meters.addReading(id, body, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(...WRITE)
  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.meters.deactivate(id, user.id);
  }
}
