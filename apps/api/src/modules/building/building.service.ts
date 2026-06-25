import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class BuildingService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  getBuilding() {
    return this.prisma.building.findFirst({
      include: {
        bankAccounts: { include: { funds: true } },
        funds: true,
      },
    });
  }

  getSettings() {
    return this.prisma.building.findFirst({
      select: {
        id: true,
        name: true,
        showDebtorsToResidents: true,
      },
    });
  }

  async updateSettings(showDebtorsToResidents: boolean, userId: string) {
    const building = await this.prisma.building.findFirst();
    if (!building) throw new NotFoundException('Будинок не налаштовано');
    const updated = await this.prisma.building.update({
      where: { id: building.id },
      data: { showDebtorsToResidents },
      select: { id: true, name: true, showDebtorsToResidents: true },
    });
    await this.audit.log({
      userId,
      action: 'building.settings_updated',
      entityType: 'Building',
      entityId: building.id,
      payload: {
        showDebtorsToResidents,
        previous: building.showDebtorsToResidents,
      },
    });
    return updated;
  }

  listApartments() {
    return this.prisma.apartment.findMany({
      orderBy: [{ entrance: 'asc' }, { number: 'asc' }],
      include: {
        residents: true,
        users: { select: { id: true, email: true, firstName: true, lastName: true, status: true } },
      },
    });
  }

  getApartment(id: string) {
    return this.prisma.apartment.findUnique({
      where: { id },
      include: {
        residents: true,
        accrualLines: {
          include: { accrual: true, allocations: true },
          orderBy: { createdAt: 'desc' },
        },
        payments: { orderBy: { date: 'desc' } },
      },
    });
  }
}