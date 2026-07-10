import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type PrismaClient = Prisma.TransactionClient | {
  apartment: Prisma.TransactionClient['apartment'];
  userApartment: Prisma.TransactionClient['userApartment'];
  user: Prisma.TransactionClient['user'];
};

export async function getUserApartmentIds(
  prisma: PrismaClient,
  userId: string,
): Promise<string[]> {
  const links = await prisma.userApartment.findMany({
    where: { userId },
    select: { apartmentId: true },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  });
  return links.map((l) => l.apartmentId);
}

export async function syncUserApartments(
  prisma: PrismaClient,
  userId: string,
  apartmentIds: string[],
  primaryApartmentId?: string | null,
) {
  const uniqueIds = [...new Set(apartmentIds)];

  if (uniqueIds.length) {
    const found = await prisma.apartment.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true },
    });
    if (found.length !== uniqueIds.length) {
      throw new BadRequestException('Одну або кілька квартир не знайдено');
    }
  }

  let primaryId: string | null = null;
  if (uniqueIds.length) {
    if (primaryApartmentId && uniqueIds.includes(primaryApartmentId)) {
      primaryId = primaryApartmentId;
    } else {
      primaryId = uniqueIds[0];
    }
  }

  const existing = await prisma.userApartment.findMany({
    where: { userId },
    select: { apartmentId: true },
  });
  const existingIds = new Set(existing.map((e) => e.apartmentId));
  const nextIds = new Set(uniqueIds);

  const toRemove = [...existingIds].filter((id) => !nextIds.has(id));
  const toAdd = uniqueIds.filter((id) => !existingIds.has(id));

  if (toRemove.length) {
    await prisma.userApartment.deleteMany({
      where: { userId, apartmentId: { in: toRemove } },
    });
  }

  if (toAdd.length) {
    await prisma.userApartment.createMany({
      data: toAdd.map((apartmentId) => ({
        userId,
        apartmentId,
        isPrimary: apartmentId === primaryId,
      })),
    });
  }

  if (uniqueIds.length) {
    await prisma.userApartment.updateMany({
      where: { userId },
      data: { isPrimary: false },
    });
    if (primaryId) {
      await prisma.userApartment.updateMany({
        where: { userId, apartmentId: primaryId },
        data: { isPrimary: true },
      });
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { apartmentId: primaryId },
  });

  return { apartmentIds: uniqueIds, primaryApartmentId: primaryId };
}

export async function addUserApartmentLink(
  prisma: PrismaClient,
  userId: string,
  apartmentId: string,
  setPrimary = false,
) {
  const apartment = await prisma.apartment.findUnique({ where: { id: apartmentId } });
  if (!apartment) throw new BadRequestException('Квартиру не знайдено');

  const existing = await prisma.userApartment.findUnique({
    where: { userId_apartmentId: { userId, apartmentId } },
  });
  if (existing) return existing;

  const linkCount = await prisma.userApartment.count({ where: { userId } });
  const isPrimary = setPrimary || linkCount === 0;

  if (isPrimary) {
    await prisma.userApartment.updateMany({
      where: { userId },
      data: { isPrimary: false },
    });
  }

  const link = await prisma.userApartment.create({
    data: { userId, apartmentId, isPrimary },
  });

  if (isPrimary) {
    await prisma.user.update({
      where: { id: userId },
      data: { apartmentId },
    });
  }

  return link;
}

export async function removeUserApartmentLink(
  prisma: PrismaClient,
  userId: string,
  apartmentId: string,
) {
  const link = await prisma.userApartment.findUnique({
    where: { userId_apartmentId: { userId, apartmentId } },
  });
  if (!link) return;

  await prisma.userApartment.delete({
    where: { userId_apartmentId: { userId, apartmentId } },
  });

  if (link.isPrimary) {
    const next = await prisma.userApartment.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    if (next) {
      await prisma.userApartment.update({
        where: { id: next.id },
        data: { isPrimary: true },
      });
      await prisma.user.update({
        where: { id: userId },
        data: { apartmentId: next.apartmentId },
      });
    } else {
      await prisma.user.update({
        where: { id: userId },
        data: { apartmentId: null },
      });
    }
  }
}