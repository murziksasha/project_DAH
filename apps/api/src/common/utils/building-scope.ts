import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** Resolve building id: explicit query/body, else first building for tenant. */
export async function resolveBuildingId(
  prisma: PrismaService,
  buildingId?: string | null,
  tenantId?: string | null,
): Promise<string> {
  if (buildingId) {
    const b = await prisma.building.findUnique({
      where: { id: buildingId },
      select: { id: true, tenantId: true },
    });
    if (!b) throw new NotFoundException('Будинок не знайдено');
    if (tenantId && b.tenantId !== tenantId) {
      throw new ForbiddenException('Будинок належить іншій організації');
    }
    return b.id;
  }
  const first = await prisma.building.findFirst({
    where: tenantId ? { tenantId } : undefined,
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!first) throw new BadRequestException('Будинок не налаштовано');
  return first.id;
}

export function fundBuildingWhere(buildingId?: string) {
  return buildingId ? { buildingId } : {};
}
