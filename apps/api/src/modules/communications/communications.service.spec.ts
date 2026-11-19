import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UserRole, VoteWeightMode } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { CommunicationsService } from './communications.service';

describe('CommunicationsService - Tenant Isolation & Offline Idempotency', () => {
  let service: CommunicationsService;

  const prisma = {
    announcement: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    announcementRead: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    building: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    apartment: {
      findUnique: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    request: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    poll: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    pollVote: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn(),
    },
  };

  const notifications = { notifyUsers: jest.fn() };
  const audit = { log: jest.fn().mockResolvedValue({}) };
  const mail = { notifyUsers: jest.fn(), notifyAdmins: jest.fn() };
  const storage = { getDownloadUrl: jest.fn().mockResolvedValue('http://mock/file'), delete: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CommunicationsService(
      prisma as any,
      notifications as any,
      audit as any,
      mail as any,
      storage as any,
    );
  });

  const residentOrgA: AuthUser = {
    id: 'user-a',
    email: 'res-a@example.com',
    role: UserRole.resident,
    apartmentId: 'apt-a',
    apartmentIds: ['apt-a'],
    tenantId: 'tenant-A',
    sid: 'sid-1',
  };

  describe('Announcements tenant scoping', () => {
    it('scopes listAnnouncements by tenantId', async () => {
      prisma.announcement.findMany.mockResolvedValue([
        { id: 'ann-1', title: 'A1', tenantId: 'tenant-A' },
      ]);

      const result = await service.listAnnouncements('user-a', 'tenant-A');
      expect(prisma.announcement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [{ tenantId: 'tenant-A' }, { tenantId: null, author: { tenantId: 'tenant-A' } }],
          },
        }),
      );
      expect(result).toHaveLength(1);
    });

    it('createAnnouncement saves tenantId', async () => {
      prisma.announcement.create.mockResolvedValue({
        id: 'ann-1',
        title: 'New Ann',
        tenantId: 'tenant-A',
        author: { id: 'user-a', firstName: 'John', lastName: 'Doe' },
      });

      await service.createAnnouncement(
        { title: 'New Ann', body: 'Body text' },
        'user-a',
        'tenant-A',
      );

      expect(prisma.announcement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: 'tenant-A', authorId: 'user-a' }),
        }),
      );
    });
  });

  describe('Requests tenant validation & clientRequestId idempotency', () => {
    it('returns existing request when clientRequestId already exists (idempotency)', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-existing',
        clientRequestId: 'offline-uuid-1',
        title: 'Leaky Pipe',
        description: 'Fixed',
        category: 'sanitary',
        status: 'new',
        dueAt: new Date(),
        photoKeys: [],
        author: { id: 'user-a', firstName: 'John', lastName: 'Doe' },
      });

      const res = await service.createRequest(
        {
          title: 'Leaky Pipe',
          description: 'Fixed',
          category: 'sanitary',
          clientRequestId: 'offline-uuid-1',
        },
        'user-a',
        residentOrgA,
      );

      expect(res.id).toBe('req-existing');
      expect(prisma.request.create).not.toHaveBeenCalled();
    });

    it('rejects buildingId belonging to a different tenant', async () => {
      prisma.request.findUnique.mockResolvedValue(null);
      prisma.building.findUnique.mockResolvedValue({
        id: 'bld-foreign',
        tenantId: 'tenant-B',
      });

      await expect(
        service.createRequest(
          {
            title: 'Test',
            description: 'Desc',
            category: 'sanitary',
            buildingId: 'bld-foreign',
          },
          'user-a',
          residentOrgA,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts apartmentId and links request to apartment and tenant', async () => {
      prisma.request.findUnique.mockResolvedValue(null);
      prisma.apartment.findUnique.mockResolvedValue({
        id: 'apt-a',
        buildingId: 'bld-a',
        building: { id: 'bld-a', tenantId: 'tenant-A' },
      });
      prisma.building.findUnique.mockResolvedValue({
        id: 'bld-a',
        tenantId: 'tenant-A',
        settings: {},
      });
      prisma.request.create.mockResolvedValue({
        id: 'req-new',
        title: 'Apartment Request',
        description: 'Need help',
        category: 'sanitary',
        status: 'new',
        dueAt: new Date(),
        photoKeys: [],
        apartmentId: 'apt-a',
        tenantId: 'tenant-A',
        author: { id: 'user-a', firstName: 'John', lastName: 'Doe' },
      });

      const res = await service.createRequest(
        {
          title: 'Apartment Request',
          description: 'Need help',
          category: 'sanitary',
          apartmentId: 'apt-a',
          clientRequestId: 'offline-uuid-2',
        },
        'user-a',
        residentOrgA,
      );

      expect(res.id).toBe('req-new');
      expect(prisma.request.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            apartmentId: 'apt-a',
            tenantId: 'tenant-A',
            clientRequestId: 'offline-uuid-2',
          }),
        }),
      );
    });
  });

  describe('Polls tenant isolation', () => {
    it('scopes listPolls by tenantId', async () => {
      prisma.poll.findMany.mockResolvedValue([]);
      await service.listPolls('user-a', 'tenant-A');
      expect(prisma.poll.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-A' }, // M8: no cross-tenant NULL rows
        }),
      );
    });

    it('rejects getPoll from another tenant', async () => {
      prisma.poll.findUnique.mockResolvedValue({
        id: 'poll-b',
        tenantId: 'tenant-B',
        options: [],
        votes: [],
        _count: { votes: 0 },
      });

      await expect(service.getPoll('poll-b', 'user-a', 'tenant-A')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('pollStats counts eligible weights scoped to poll tenant', async () => {
      prisma.poll.findUnique.mockResolvedValue({
        id: 'poll-a',
        tenantId: 'tenant-A',
      });
      prisma.pollVote.findMany.mockResolvedValue([
        { optionId: 'opt-1', weight: 1 },
      ]);
      prisma.user.count.mockResolvedValue(42);

      const stats = await (service as any).pollStats('poll-a', VoteWeightMode.one_per_user, 50);
      expect(prisma.user.count).toHaveBeenCalledWith({
        where: { status: 'active', role: 'resident', tenantId: 'tenant-A' },
      });
      expect(stats.eligibleWeight).toBe(42);
      expect(stats.votedWeight).toBe(1);
    });
  });
});
