import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL ?? 'admin@dah.local';
  const password = process.env.SUPER_ADMIN_PASSWORD ?? 'password123';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Already exists: ${existing.email} (${existing.role})`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName: 'Системний',
      lastName: 'Адміністратор',
      role: UserRole.super_admin,
      status: UserStatus.active,
    },
  });

  console.log(`Created super_admin: ${user.email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());