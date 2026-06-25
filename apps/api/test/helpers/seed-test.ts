import {
  AccrualDistribution,
  AccrualLineStatus,
  FundType,
  PrismaClient,
  UserRole,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

export async function resetTestDatabase() {
  await prisma.auditLog.deleteMany();
  await prisma.pushSubscription.deleteMany();
  await prisma.pollVote.deleteMany();
  await prisma.pollOption.deleteMany();
  await prisma.poll.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.request.deleteMany();
  await prisma.paymentAllocation.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.accrualLine.deleteMany();
  await prisma.accrual.deleteMany();
  await prisma.accrualTemplate.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.document.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.expenseCategory.deleteMany();
  await prisma.fund.deleteMany();
  await prisma.bankAccount.deleteMany();
  await prisma.user.deleteMany();
  await prisma.resident.deleteMany();
  await prisma.apartment.deleteMany();
  await prisma.building.deleteMany();
}

export async function seedTestFixtures() {
  const building = await prisma.building.create({
    data: { name: 'Test OSBB', address: 'Test st. 1' },
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

  const chairman = await prisma.user.create({
    data: {
      email: 'test-chairman@osbb.local',
      passwordHash,
      firstName: 'Test',
      lastName: 'Chairman',
      role: UserRole.chairman,
      status: UserStatus.active,
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
      apartmentId: apartment.id,
    },
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

  return { building, fund, apartment, chairman, resident, accrual };
}

export async function disconnectTestDatabase() {
  await prisma.$disconnect();
}

export { prisma as testPrisma };