import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PaymentSource, UserRole } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { AccountingPeriodsService } from '../accounting-periods/accounting-periods.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { JournalService } from '../journal/journal.service';
import { PostingService } from '../journal/posting.service';
import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  let service: PaymentsService;

  const prisma = {
    apartment: { findUnique: jest.fn() },
    accrualLine: { findMany: jest.fn() },
    payment: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    paymentAllocation: { create: jest.fn() },
    accrualLine_update: jest.fn(),
    $transaction: jest.fn((fn: (tx: unknown) => unknown) =>
      fn({
        payment: { create: jest.fn().mockResolvedValue({ id: 'pay-1' }) },
        paymentAllocation: { create: jest.fn() },
        accrualLine: { update: jest.fn() },
        $queryRaw: jest.fn().mockResolvedValue([]),
        apartment: { update: jest.fn() },
      }),
    ),
  };

  const audit = { log: jest.fn() };
  const mail = { notifyResidentsOfApartments: jest.fn().mockResolvedValue(undefined) };
  const journal = { write: jest.fn().mockResolvedValue({}) };
  const posting = {
    postPayment: jest.fn().mockResolvedValue({}),
  };
  const periods = {
    assertAllowsMutation: jest.fn().mockResolvedValue({ period: '2026-01', status: 'open' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: MailService, useValue: mail },
        { provide: JournalService, useValue: journal },
        { provide: PostingService, useValue: posting },
        { provide: AccountingPeriodsService, useValue: periods },
      ],
    }).compile();

    service = module.get(PaymentsService);
  });

  describe('Tenant isolation on payments', () => {
    const accountantOrgA: AuthUser = {
      id: 'usr-acc-a',
      email: 'accountant@orga.local',
      role: UserRole.accountant,
      tenantId: 'tenant-A',
      apartmentId: null,
      apartmentIds: [],
    };

    it('getPayment throws ForbiddenException when payment belongs to tenant B', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pmt-b',
        apartmentId: 'apt-b',
        amount: 200,
        apartment: {
          id: 'apt-b',
          building: { id: 'bld-b', tenantId: 'tenant-B' },
        },
        allocations: [],
      });

      await expect(service.getPayment('pmt-b', accountantOrgA)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('createPayment throws ForbiddenException when apartment belongs to tenant B', async () => {
      prisma.apartment.findUnique.mockResolvedValue({
        id: 'apt-b',
        buildingId: 'bld-b',
        building: { id: 'bld-b', tenantId: 'tenant-B' },
      });

      await expect(
        service.createPayment(
          {
            apartmentId: 'apt-b',
            amount: 150,
            date: '2026-01-10',
            source: PaymentSource.bank,
          },
          accountantOrgA,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('voidPayment throws ForbiddenException when payment belongs to tenant B', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pmt-b',
        apartmentId: 'apt-b',
        amount: 200,
        isVoided: false,
        apartment: {
          id: 'apt-b',
          building: { id: 'bld-b', tenantId: 'tenant-B' },
        },
        allocations: [],
      });

      await expect(
        service.voidPayment('pmt-b', 'Duplicate test', accountantOrgA),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('previewAllocation', () => {
    it('throws when apartment not found', async () => {
      prisma.apartment.findUnique.mockResolvedValue(null);
      await expect(service.previewAllocation('missing', 100)).rejects.toThrow(NotFoundException);
    });

    it('returns FIFO preview with advance', async () => {
      prisma.apartment.findUnique.mockResolvedValue({ id: 'apt-1', number: '101' });
      prisma.accrualLine.findMany.mockResolvedValue([
        {
          id: 'l1',
          amount: 80,
          paidAmount: 0,
          dueDate: new Date('2026-01-14'),
          accrual: { period: '2026-01', title: 'T1' },
        },
      ]);

      const result = await service.previewAllocation('apt-1', 100);
      expect(result.allocations).toHaveLength(1);
      expect(result.allocations[0].amount).toBe(80);
      expect(result.advance).toBe(20);
      expect(result.totalAllocated).toBe(80);
    });
  });
});