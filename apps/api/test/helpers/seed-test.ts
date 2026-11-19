import {
  AccrualDistribution,
  AccrualLineStatus,
  FundType,
  PrismaClient,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { prismaPgAdapter } from '../../src/prisma/prisma-adapter';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient({ adapter: prismaPgAdapter() });

export async function resetTestDatabase() {
  await prisma.meetingVote.deleteMany().catch(() => undefined);
  await prisma.meetingParticipant.deleteMany().catch(() => undefined);
  await prisma.meetingSignature.deleteMany().catch(() => undefined);
  await prisma.meetingAgendaItem.deleteMany().catch(() => undefined);
  await prisma.meeting.deleteMany().catch(() => undefined);
  await prisma.journalSequence.deleteMany().catch(() => undefined);
  await prisma.workerJob.deleteMany().catch(() => undefined);
  await prisma.auditLog.deleteMany();
  await prisma.emailLog.deleteMany();
  await prisma.reminder.deleteMany();
  await prisma.pushSubscription.deleteMany();
  await prisma.appNotification.deleteMany().catch(() => undefined);
  await prisma.passwordResetToken.deleteMany().catch(() => undefined);
  await prisma.pollVote.deleteMany();
  await prisma.pollOption.deleteMany();
  await prisma.poll.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.request.deleteMany();
  await prisma.meterReading.deleteMany();
  await prisma.meter.deleteMany();
  await prisma.paymentAllocation.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.bankStatementLine.deleteMany().catch(() => undefined);
  await prisma.bankStatement.deleteMany().catch(() => undefined);
  await prisma.ibanApartmentAlias.deleteMany().catch(() => undefined);
  await prisma.accountingPeriod.deleteMany().catch(() => undefined);
  await prisma.fundTransfer.deleteMany().catch(() => undefined);
  await prisma.budgetLine.deleteMany().catch(() => undefined);
  await prisma.accrualLine.deleteMany();
  await prisma.accrual.deleteMany();
  await prisma.accrualTemplate.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.journalLine.deleteMany();
  await prisma.journalEntry.deleteMany();
  await prisma.authSession.deleteMany();
  await prisma.document.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.expenseCategory.deleteMany();
  await prisma.fund.deleteMany();
  await prisma.bankAccount.deleteMany();
  await prisma.userApartment.deleteMany();
  await prisma.user.deleteMany();
  await prisma.resident.deleteMany();
  await prisma.apartment.deleteMany();
  await prisma.building.deleteMany();
  await prisma.tenant.deleteMany();
}

export async function seedTestFixtures() {
  const tenant = await prisma.tenant.create({
    data: { id: 'test_tenant', name: 'Test Tenant', slug: 'test' },
  });

  const building = await prisma.building.create({
    data: { name: 'Test OSBB', address: 'Test st. 1', tenantId: tenant.id },
  });

  const fund = await prisma.fund.create({
    data: {
      buildingId: building.id,
      type: FundType.maintenance,
      name: 'Test fund',
      openingBalance: 0,
    },
  });

  const apartment = await prisma.apartment.create({
    data: {
      buildingId: building.id,
      number: '101',
      entrance: 1,
      area: 50,
    },
  });

  const passwordHash = await bcrypt.hash('password123', 4);

  const superAdmin = await prisma.user.create({
    data: {
      email: 'test-admin@osbb.local',
      passwordHash,
      firstName: 'Test',
      lastName: 'Admin',
      role: UserRole.super_admin,
      status: UserStatus.active,
      tenantId: null,
    },
  });

  const chairman = await prisma.user.create({
    data: {
      email: 'test-chairman@osbb.local',
      passwordHash,
      firstName: 'Test',
      lastName: 'Chairman',
      role: UserRole.chairman,
      status: UserStatus.active,
      tenantId: tenant.id,
    },
  });

  const accountant = await prisma.user.create({
    data: {
      email: 'test-accountant@osbb.local',
      passwordHash,
      firstName: 'Test',
      lastName: 'Accountant',
      role: UserRole.accountant,
      status: UserStatus.active,
      tenantId: tenant.id,
    },
  });

  const resident = await prisma.user.create({
    data: {
      email: 'test-resident@osbb.local',
      passwordHash,
      firstName: 'Test',
      lastName: 'Resident',
      role: UserRole.resident,
      status: UserStatus.active,
      tenantId: tenant.id,
      apartmentId: apartment.id,
      apartmentLinks: {
        create: { apartmentId: apartment.id, isPrimary: true },
      },
    },
  });

  await prisma.tenantMembership.createMany({
    data: [
      {
        userId: chairman.id,
        tenantId: tenant.id,
        role: UserRole.chairman,
        status: UserStatus.active,
      },
      {
        userId: accountant.id,
        tenantId: tenant.id,
        role: UserRole.accountant,
        status: UserStatus.active,
      },
      {
        userId: resident.id,
        tenantId: tenant.id,
        role: UserRole.resident,
        status: UserStatus.active,
      },
    ],
  });

  // Full default catalog so roles e2e / assignable checks match production seed.
  const orgRoleCodes: UserRole[] = [
    UserRole.chairman,
    UserRole.accountant,
    UserRole.board,
    UserRole.dispatcher,
    UserRole.crew,
    UserRole.auditor,
    UserRole.resident,
  ];
  await prisma.tenantRole.createMany({
    data: orgRoleCodes.map((code, i) => ({
      tenantId: tenant.id,
      code,
      isActive: true,
      sortOrder: (i + 1) * 10,
    })),
    skipDuplicates: true,
  });

  const accrual = await prisma.accrual.create({
    data: {
      fundId: fund.id,
      period: '2026-06',
      title: 'Test accrual',
    },
  });

  await prisma.accrualLine.create({
    data: {
      accrualId: accrual.id,
      apartmentId: apartment.id,
      amount: 425,
      dueDate: new Date('2099-07-14'),
      status: AccrualLineStatus.open,
    },
  });

  await prisma.accrualTemplate.create({
    data: {
      fundId: fund.id,
      name: 'By area',
      distribution: AccrualDistribution.by_area,
      rate: 8.5,
    },
  });

  return { building, fund, apartment, superAdmin, chairman, accountant, resident, accrual };
}

/**
 * Second, fully independent organization (tenant B) for isolation tests.
 * Users (password `password123`): b-chairman@, b-accountant@, b-resident@osbb.local.
 */
export async function seedSecondTenant() {
  const tenant = await prisma.tenant.create({
    data: { id: 'tenant_b', name: 'Tenant B', slug: 'tenant-b' },
  });
  const building = await prisma.building.create({
    data: { name: 'B OSBB', address: 'B st. 2', tenantId: tenant.id },
  });
  const fund = await prisma.fund.create({
    data: { buildingId: building.id, type: FundType.maintenance, name: 'B fund', openingBalance: 0 },
  });
  const apartment = await prisma.apartment.create({
    data: { buildingId: building.id, number: '201', entrance: 1, area: 70 },
  });
  const passwordHash = await bcrypt.hash('password123', 4);
  const mk = (email: string, role: UserRole, extra: Record<string, unknown> = {}) =>
    prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: 'B',
        lastName: role,
        role,
        status: UserStatus.active,
        tenantId: tenant.id,
        memberships: { create: { tenantId: tenant.id, role, status: UserStatus.active } },
        ...extra,
      },
    });
  const chairman = await mk('b-chairman@osbb.local', UserRole.chairman);
  const accountant = await mk('b-accountant@osbb.local', UserRole.accountant);
  const resident = await mk('b-resident@osbb.local', UserRole.resident, {
    apartmentId: apartment.id,
    apartmentLinks: { create: { apartmentId: apartment.id, isPrimary: true } },
  });
  const accrual = await prisma.accrual.create({
    data: { fundId: fund.id, period: '2026-06', title: 'B accrual' },
  });
  const line = await prisma.accrualLine.create({
    data: {
      accrualId: accrual.id,
      apartmentId: apartment.id,
      amount: 700,
      dueDate: new Date('2099-07-14'),
      status: AccrualLineStatus.open,
    },
  });
  const supplier = await prisma.supplier.create({
    data: { buildingId: building.id, name: 'B Supplier' },
  });
  const category = await prisma.expenseCategory.create({
    data: { name: 'B private category', code: 'b_private', tenantId: tenant.id },
  });
  const expense = await prisma.expense.create({
    data: {
      fundId: fund.id,
      supplierId: supplier.id,
      categoryId: category.id,
      amount: 100,
      date: new Date('2026-06-10'),
      description: 'B secret expense',
      approvalStatus: 'approved',
      createdById: chairman.id,
    },
  });
  const journalEntry = await prisma.journalEntry.create({
    data: {
      type: 'adjustment',
      refType: 'Test',
      refId: 'b-entry',
      buildingId: building.id,
      description: 'B secret entry',
      valueDate: new Date('2026-06-10'),
      period: '2026-06',
      entryNo: 1,
      lines: {
        create: [
          { account: 'cash', debit: 10, credit: 0, fundId: fund.id },
          { account: 'income', debit: 0, credit: 10, fundId: fund.id },
        ],
      },
    },
  });
  const reminder = await prisma.reminder.create({
    data: {
      type: 'custom',
      title: 'B secret reminder',
      dueAt: new Date('2099-01-01'),
      apartmentId: apartment.id,
      tenantId: tenant.id,
    },
  });
  const statement = await prisma.bankStatement.create({
    data: {
      buildingId: building.id,
      tenantId: tenant.id,
      format: 'generic_csv',
      lineCount: 1,
      lines: {
        create: {
          lineNo: 1,
          amount: 700,
          reference: 'B kv 201',
          raw: 'raw',
          status: 'unmatched',
        },
      },
    },
    include: { lines: true },
  });
  const meeting = await prisma.meeting.create({
    data: {
      tenantId: tenant.id,
      buildingId: building.id,
      title: 'B meeting',
      status: 'open',
      voteWeight: 'one_per_apartment',
      agendaItems: { create: { title: 'B item', sortOrder: 0 } },
    },
    include: { agendaItems: true },
  });
  return {
    tenant,
    building,
    fund,
    apartment,
    chairman,
    accountant,
    resident,
    accrual,
    line,
    supplier,
    category,
    expense,
    journalEntry,
    reminder,
    statement,
    statementLine: statement.lines[0],
    meeting,
  };
}

export async function disconnectTestDatabase() {
  await prisma.$disconnect();
}

export { prisma as testPrisma };