import {
  AccrualDistribution,
  AccrualLineStatus,
  FundType,
  PaymentSource,
  PrismaClient,
  UserRole,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { existsSync } from 'fs';
import { resolve } from 'path';

// Optional local .env (CI supplies DATABASE_URL via the environment).
const envPath = resolve(__dirname, '../../../.env');
if (existsSync(envPath)) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv').config({ path: envPath });
}

const prisma = new PrismaClient();

async function main() {
  const isProd =
    process.env.NODE_ENV === 'production' || process.env.DAH_ENV === 'production';
  if (isProd && process.env.ALLOW_SEED !== '1') {
    throw new Error(
      'Seed заборонено у production. Встановіть ALLOW_SEED=1 лише якщо свідомо перезаписуєте демо-дані.',
    );
  }

  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required. Set it in the environment or in ../../.env',
    );
  }

  const buildingName = process.env.BUILDING_NAME ?? 'Мій дім — демо (ОСББ вул. Прикладна 1)';

  await prisma.auditLog.deleteMany();
  await prisma.emailLog.deleteMany();
  await prisma.reminder.deleteMany();
  await prisma.pushSubscription.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.request.deleteMany();
  await prisma.pollVote.deleteMany();
  await prisma.pollOption.deleteMany();
  await prisma.poll.deleteMany();
  await prisma.meterReading.deleteMany();
  await prisma.meter.deleteMany();
  await prisma.paymentAllocation.deleteMany();
  await prisma.payment.deleteMany();
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

  const tenant = await prisma.tenant.create({
    data: { name: buildingName, slug: 'default', orgType: 'osbb' },
  });

  const building = await prisma.building.create({
    data: {
      tenantId: tenant.id,
      name: buildingName,
      address: 'м. Київ, вул. Прикладна, 1',
      edrpou: '12345678',
      isInitialized: true,
      settings: {
        registrationEnabled: true,
        showBankDetailsToResidents: true,
        defaultAccrualDueDays: 14,
        locale: 'uk',
      },
    },
  });

  const bankAccount = await prisma.bankAccount.create({
    data: {
      buildingId: building.id,
      bankName: 'ПриватБанк',
      iban: 'UA123456789012345678901234567',
      description: 'Основний рахунок організації',
    },
  });

  const funds = await Promise.all([
    prisma.fund.create({
      data: {
        buildingId: building.id,
        bankAccountId: bankAccount.id,
        type: FundType.maintenance,
        name: 'Фонд утримання',
        openingBalance: 125000,
      },
    }),
    prisma.fund.create({
      data: {
        buildingId: building.id,
        bankAccountId: bankAccount.id,
        type: FundType.capital_repair,
        name: 'Фонд капітального ремонту',
        openingBalance: 450000,
      },
    }),
    prisma.fund.create({
      data: {
        buildingId: building.id,
        type: FundType.special,
        name: 'Спеціальний фонд',
        openingBalance: 0,
      },
    }),
  ]);

  const categories = await Promise.all([
    prisma.expenseCategory.create({ data: { name: 'Електроенергія', code: 'electricity' } }),
    prisma.expenseCategory.create({ data: { name: 'Водопостачання', code: 'water' } }),
    prisma.expenseCategory.create({ data: { name: 'Опалення', code: 'heating' } }),
    prisma.expenseCategory.create({ data: { name: 'Утримання будинку', code: 'maintenance' } }),
    prisma.expenseCategory.create({ data: { name: 'Зарплата персоналу', code: 'salary' } }),
  ]);

  const suppliers = await Promise.all([
    prisma.supplier.create({
      data: { buildingId: building.id, name: 'Київводоканал', serviceType: 'water' },
    }),
    prisma.supplier.create({
      data: { buildingId: building.id, name: 'ДТЕК Київські електромережі', serviceType: 'electricity' },
    }),
    prisma.supplier.create({
      data: { buildingId: building.id, name: 'ТОВ "Двірник"', serviceType: 'cleaning' },
    }),
  ]);

  const apartments = [];
  for (let entrance = 1; entrance <= 2; entrance++) {
    for (let num = 1; num <= 10; num++) {
      const apartment = await prisma.apartment.create({
        data: {
          buildingId: building.id,
          number: String(entrance * 100 + num),
          entrance,
          floor: Math.ceil(num / 2),
          area: 45 + (num % 5) * 8,
        },
      });
      apartments.push(apartment);
      await prisma.resident.create({
        data: {
          apartmentId: apartment.id,
          firstName: `Мешканець`,
          lastName: `Кв. ${apartment.number}`,
          isOwner: true,
        },
      });
    }
  }

  const passwordHash = await bcrypt.hash('password123', 10);

  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL ?? 'admin@dah.local';
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD ?? 'password123';
  const superAdminHash = await bcrypt.hash(superAdminPassword, 10);

  await prisma.user.create({
    data: {
      email: superAdminEmail,
      passwordHash: superAdminHash,
      firstName: 'Системний',
      lastName: 'Адміністратор',
      role: UserRole.super_admin,
      status: UserStatus.active,
      tenantId: null,
    },
  });

  await prisma.user.create({
    data: {
      email: 'chairman@osbb.local',
      passwordHash,
      firstName: 'Іван',
      lastName: 'Петренко',
      role: UserRole.chairman,
      status: UserStatus.active,
      tenantId: tenant.id,
    },
  });

  await prisma.user.create({
    data: {
      email: 'accountant@osbb.local',
      passwordHash,
      firstName: 'Олена',
      lastName: 'Коваленко',
      role: UserRole.accountant,
      status: UserStatus.active,
      tenantId: tenant.id,
    },
  });

  await prisma.user.create({
    data: {
      email: 'auditor@osbb.local',
      passwordHash,
      firstName: 'Андрій',
      lastName: 'Мельник',
      role: UserRole.auditor,
      status: UserStatus.active,
      tenantId: tenant.id,
    },
  });

  await prisma.user.create({
    data: {
      email: 'resident@osbb.local',
      passwordHash,
      firstName: 'Марія',
      lastName: 'Шевченко',
      role: UserRole.resident,
      status: UserStatus.active,
      tenantId: tenant.id,
      apartmentId: apartments[0].id,
      apartmentLinks: {
        create: { apartmentId: apartments[0].id, isPrimary: true },
      },
    },
  });

  const chairman = await prisma.user.findUnique({ where: { email: 'chairman@osbb.local' } });

  await prisma.expense.create({
    data: {
      fundId: funds[0].id,
      categoryId: categories[0].id,
      supplierId: suppliers[1].id,
      amount: 18450.5,
      date: new Date('2026-05-15'),
      description: 'Електроенергія за травень 2026',
      createdById: chairman!.id,
    },
  });

  await prisma.expense.create({
    data: {
      fundId: funds[0].id,
      categoryId: categories[1].id,
      supplierId: suppliers[0].id,
      amount: 7320,
      date: new Date('2026-05-10'),
      description: 'Водопостачання та каналізація',
      createdById: chairman!.id,
    },
  });

  const template = await prisma.accrualTemplate.create({
    data: {
      fundId: funds[0].id,
      name: 'Внесок на утримання (по площі)',
      distribution: AccrualDistribution.by_area,
      rate: 8.5,
      isActive: true,
    },
  });

  const accrual = await prisma.accrual.create({
    data: {
      fundId: funds[0].id,
      templateId: template.id,
      period: '2026-06',
      title: 'Внесок на утримання — червень 2026',
    },
  });

  const dueDate = new Date('2026-07-14');
  await prisma.accrualLine.createMany({
    data: apartments.map((apt) => ({
      accrualId: accrual.id,
      apartmentId: apt.id,
      amount: Math.round(apt.area * 8.5 * 100) / 100,
      dueDate,
      status: AccrualLineStatus.open,
    })),
  });

  const residentLine = await prisma.accrualLine.findFirst({
    where: { apartmentId: apartments[0].id, accrualId: accrual.id },
  });

  if (residentLine) {
    const lineAmount = Number(residentLine.amount);
    const paidAmount = Math.round(lineAmount * 0.5 * 100) / 100;
    const payment = await prisma.payment.create({
      data: {
        apartmentId: apartments[0].id,
        amount: paidAmount,
        date: new Date('2026-06-20'),
        source: PaymentSource.bank,
        reference: 'Демо-платіж кв. 101',
      },
    });
    await prisma.paymentAllocation.create({
      data: {
        paymentId: payment.id,
        accrualLineId: residentLine.id,
        amount: paidAmount,
      },
    });
    await prisma.accrualLine.update({
      where: { id: residentLine.id },
      data: {
        paidAmount,
        status: AccrualLineStatus.partially_paid,
      },
    });
  }

  await prisma.announcement.create({
    data: {
      title: 'Планові роботи з ліфта',
      body: '15–17 липня 2026 року проводиться планове технічне обслуговування ліфта в під\'їзді 1. Просимо не користуватися ліфтом у цей період.',
      isPinned: true,
      authorId: chairman!.id,
    },
  });

  const poll = await prisma.poll.create({
    data: {
      question: 'Чи підтримуєте встановлення відеоспостереження у дворі?',
      isActive: true,
      endsAt: new Date('2026-08-01'),
      options: {
        create: [
          { text: 'Так, підтримую' },
          { text: 'Ні, не підтримую' },
          { text: 'Потрібно більше інформації' },
        ],
      },
    },
  });

  console.log('Seed completed:');
  console.log('  Building:', building.name);
  console.log('  Apartments:', apartments.length);
  console.log('  Demo users:');
  console.log(`    ${superAdminEmail} / ${superAdminPassword} (super_admin)`);
  console.log('    chairman@osbb.local / password123');
  console.log('    accountant@osbb.local / password123');
  console.log('    auditor@osbb.local / password123');
  console.log('    resident@osbb.local / password123');
  console.log('  Announcements: 1, Polls: 1 (id:', poll.id + ')');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());