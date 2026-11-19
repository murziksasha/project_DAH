import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '@dah/shared';
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
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { MetersService } from './meters.service';
import { CreateMeterDto, MeterReadingDto } from './dto/meter.dto';


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

  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.MANAGE_FINANCE, Permission.PLATFORM_ADMIN)
  @Post()
  create(
    @Body() body: CreateMeterDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.meters.createMeter(body, user.id);
  }

  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.MANAGE_FINANCE, Permission.PLATFORM_ADMIN)
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

  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.MANAGE_FINANCE, Permission.PLATFORM_ADMIN)
  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.meters.deactivate(id, user.id);
  }
}
