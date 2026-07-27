import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MeterType, UserRole } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { roundMoney } from '../../common/utils/money';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class MetersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  listByApartment(apartmentId: string, buildingId?: string) {
    return this.prisma.meter.findMany({
      where: {
        apartmentId,
        ...(buildingId ? { apartment: { buildingId } } : {}),
      },
      include: {
        readings: { orderBy: { period: 'desc' }, take: 12 },
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async listForBuilding(buildingId?: string, tenantId?: string | null) {
    return this.prisma.meter.findMany({
      where: buildingId
        ? {
            apartment: {
              buildingId,
              ...(tenantId ? { building: { tenantId } } : {}),
            },
          }
        : tenantId
          ? { apartment: { building: { tenantId } } }
          : undefined,
      include: {
        apartment: { select: { id: true, number: true, entrance: true } },
        readings: { orderBy: { period: 'desc' }, take: 1 },
      },
      orderBy: [{ apartment: { number: 'asc' } }, { type: 'asc' }],
    });
  }

  async createMeter(
    dto: {
      apartmentId: string;
      type: MeterType;
      name: string;
      unit?: string;
      serialNumber?: string;
    },
    userId: string,
  ) {
    const apt = await this.prisma.apartment.findUnique({ where: { id: dto.apartmentId } });
    if (!apt) throw new NotFoundException('Квартиру не знайдено');

    const meter = await this.prisma.meter.create({
      data: {
        apartmentId: dto.apartmentId,
        type: dto.type,
        name: dto.name.trim(),
        unit: dto.unit?.trim() || defaultUnit(dto.type),
        serialNumber: dto.serialNumber?.trim() || null,
      },
    });
    await this.audit.log({
      userId,
      action: 'meter.created',
      entityType: 'Meter',
      entityId: meter.id,
      payload: { apartmentId: dto.apartmentId, type: dto.type },
    });
    return meter;
  }

  async addReading(
    meterId: string,
    dto: { period: string; value: number },
    userId: string,
  ) {
    if (!/^\d{4}-\d{2}$/.test(dto.period)) {
      throw new BadRequestException('Період у форматі YYYY-MM');
    }
    const meter = await this.prisma.meter.findUnique({ where: { id: meterId } });
    if (!meter) throw new NotFoundException('Лічильник не знайдено');
    if (!meter.isActive) throw new BadRequestException('Лічильник неактивний');

    const prev = await this.prisma.meterReading.findFirst({
      where: { meterId, period: { lt: dto.period } },
      orderBy: { period: 'desc' },
    });
    const previousValue = prev ? Number(prev.value) : null;
    if (previousValue != null && dto.value < previousValue) {
      throw new BadRequestException('Показник менший за попередній');
    }
    const consumption = roundMoney(
      previousValue == null ? 0 : dto.value - previousValue,
    );

    const reading = await this.prisma.meterReading.upsert({
      where: { meterId_period: { meterId, period: dto.period } },
      create: {
        meterId,
        period: dto.period,
        value: dto.value,
        previousValue,
        consumption,
      },
      update: {
        value: dto.value,
        previousValue,
        consumption,
      },
    });

    await this.audit.log({
      userId,
      action: 'meter.reading',
      entityType: 'MeterReading',
      entityId: reading.id,
      payload: { meterId, period: dto.period, value: dto.value, consumption },
    });
    return reading;
  }

  async assertApartmentAccess(user: AuthUser, apartmentId: string) {
    const admin: UserRole[] = [
      UserRole.chairman,
      UserRole.accountant,
      UserRole.board,
      UserRole.auditor,
      UserRole.super_admin,
    ];
    if (admin.includes(user.role as UserRole)) return;
    const ids = user.apartmentIds?.length
      ? user.apartmentIds
      : user.apartmentId
        ? [user.apartmentId]
        : [];
    if (!ids.includes(apartmentId)) {
      throw new ForbiddenException('Немає доступу до квартири');
    }
  }

  async deactivate(meterId: string, userId: string) {
    const meter = await this.prisma.meter.findUnique({ where: { id: meterId } });
    if (!meter) throw new NotFoundException('Лічильник не знайдено');
    const updated = await this.prisma.meter.update({
      where: { id: meterId },
      data: { isActive: false },
    });
    await this.audit.log({
      userId,
      action: 'meter.deactivated',
      entityType: 'Meter',
      entityId: meterId,
      payload: {},
    });
    return updated;
  }
}

function defaultUnit(type: MeterType): string {
  switch (type) {
    case MeterType.electricity:
      return 'kWh';
    case MeterType.heating:
      return 'Gcal';
    default:
      return 'm3';
  }
}
