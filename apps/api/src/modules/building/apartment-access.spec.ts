import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { BuildingService } from './building.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';

describe('BuildingService - Apartment Access Control & Isolation', () => {
  function createService(prismaMock: any) {
    const auditMock = { log: jest.fn().mockResolvedValue({}) };
    return new BuildingService(prismaMock, auditMock as any);
  }

  const sampleApartment = {
    id: 'apt-101',
    number: '101',
    entrance: 1,
    floor: 2,
    area: 65,
    buildingId: 'bld-1',
    building: {
      id: 'bld-1',
      tenantId: 'tenant-alpha',
    },
    residents: [],
    accrualLines: [],
    payments: [],
  };

  it('allows super_admin to access any apartment across organizations', async () => {
    const prisma = {
      apartment: {
        findUnique: jest.fn().mockResolvedValue(sampleApartment),
      },
    };
    const service = createService(prisma);
    const superAdmin: AuthUser = {
      id: 'sa-1',
      email: 'sa@osbb.local',
      role: UserRole.super_admin,
      apartmentId: null,
      apartmentIds: [],
      tenantId: null,
    };

    const result = await service.getApartment('apt-101', superAdmin);
    expect(result.id).toBe('apt-101');
  });

  it('blocks staff from accessing apartment belonging to another tenant', async () => {
    const prisma = {
      apartment: {
        findUnique: jest.fn().mockResolvedValue(sampleApartment),
      },
    };
    const service = createService(prisma);
    const foreignAccountant: AuthUser = {
      id: 'acc-2',
      email: 'acc@other.local',
      role: UserRole.accountant,
      apartmentId: null,
      apartmentIds: [],
      tenantId: 'tenant-beta', // apartment belongs to tenant-alpha
    };

    await expect(service.getApartment('apt-101', foreignAccountant)).rejects.toThrow(
      new ForbiddenException('Немає доступу до квартири іншої організації'),
    );
  });

  it('blocks resident from accessing an apartment that is not theirs', async () => {
    const prisma = {
      apartment: {
        findUnique: jest.fn().mockResolvedValue(sampleApartment),
      },
    };
    const service = createService(prisma);
    const otherResident: AuthUser = {
      id: 'res-other',
      email: 'other@osbb.local',
      role: UserRole.resident,
      apartmentId: 'apt-999',
      apartmentIds: ['apt-999'],
      tenantId: 'tenant-alpha',
    };

    await expect(service.getApartment('apt-101', otherResident)).rejects.toThrow(
      new ForbiddenException('Немає доступу до чужої квартири'),
    );
  });

  it('allows resident to access their own linked apartment', async () => {
    const prisma = {
      apartment: {
        findUnique: jest.fn().mockResolvedValue(sampleApartment),
      },
    };
    const service = createService(prisma);
    const ownerResident: AuthUser = {
      id: 'res-owner',
      email: 'owner@osbb.local',
      role: UserRole.resident,
      apartmentId: 'apt-101',
      apartmentIds: ['apt-101'],
      tenantId: 'tenant-alpha',
    };

    const result = await service.getApartment('apt-101', ownerResident);
    expect(result.id).toBe('apt-101');
  });

  it('throws NotFoundException when apartment does not exist', async () => {
    const prisma = {
      apartment: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const service = createService(prisma);

    await expect(service.getApartment('nonexistent')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('listApartments applies tenantId filter even when buildingId is specified', async () => {
    const prisma = {
      apartment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = createService(prisma);

    await service.listApartments('bld-target', 'tenant-allowed');

    expect(prisma.apartment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          buildingId: 'bld-target',
          building: { tenantId: 'tenant-allowed' },
        },
      }),
    );
  });

  it('listApartments for resident only queries their linked apartments', async () => {
    const prisma = {
      apartment: {
        findMany: jest.fn().mockResolvedValue([
          {
            ...sampleApartment,
            apartmentLinks: [],
          },
        ]),
      },
    };
    const service = createService(prisma);
    const resident: AuthUser = {
      id: 'res-1',
      email: 'res@osbb.local',
      role: UserRole.resident,
      apartmentId: 'apt-101',
      apartmentIds: ['apt-101'],
      tenantId: 'tenant-alpha',
    };

    await service.listApartments(undefined, 'tenant-alpha', resident);

    expect(prisma.apartment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ['apt-101'] },
          building: { tenantId: 'tenant-alpha' },
        },
      }),
    );
  });
});
