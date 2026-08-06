import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChatThreadKind, UserRole } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

const STAFF: UserRole[] = [
  UserRole.chairman,
  UserRole.board,
  UserRole.dispatcher,
  UserRole.accountant,
  UserRole.super_admin,
];

@Injectable()
export class MessengerService {
  constructor(private prisma: PrismaService) {}

  async listThreads(user: AuthUser) {
    const memberships = await this.prisma.chatThreadMember.findMany({
      where: { userId: user.id },
      include: {
        thread: {
          include: {
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: {
                author: { select: { id: true, firstName: true, lastName: true } },
              },
            },
            _count: { select: { messages: true, members: true } },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    return memberships.map((m) => ({
      ...m.thread,
      lastMessage: m.thread.messages[0] ?? null,
      lastReadAt: m.lastReadAt,
      memberCount: m.thread._count.members,
      messageCount: m.thread._count.messages,
    }));
  }

  /** Resolve building only if user may access it (apartment link or same-tenant staff). */
  private async resolveAccessibleBuilding(user: AuthUser, buildingId?: string) {
    if (buildingId) {
      const building = await this.prisma.building.findUnique({ where: { id: buildingId } });
      if (!building) throw new NotFoundException('Будинок не знайдено');
      await this.assertBuildingAccess(user, building.id, building.tenantId);
      return building;
    }

    // Prefer building from user's apartments
    if (user.apartmentIds?.length) {
      const link = await this.prisma.apartment.findFirst({
        where: { id: { in: user.apartmentIds } },
        include: { building: true },
      });
      if (link?.building) return link.building;
    }

    if (user.apartmentId) {
      const apt = await this.prisma.apartment.findUnique({
        where: { id: user.apartmentId },
        include: { building: true },
      });
      if (apt?.building) return apt.building;
    }

    // Staff: first building in tenant
    if (STAFF.includes(user.role as UserRole)) {
      const where =
        user.role === UserRole.super_admin
          ? {}
          : user.tenantId
            ? { tenantId: user.tenantId }
            : { id: '__none__' };
      const building = await this.prisma.building.findFirst({
        where,
        orderBy: { createdAt: 'asc' },
      });
      if (building) return building;
    }

    throw new NotFoundException('Будинок не знайдено');
  }

  private async assertBuildingAccess(
    user: AuthUser,
    buildingId: string,
    buildingTenantId: string,
  ) {
    if (user.role === UserRole.super_admin) return;

    if (STAFF.includes(user.role as UserRole)) {
      if (!user.tenantId || user.tenantId !== buildingTenantId) {
        throw new ForbiddenException('Немає доступу до чату цього будинку');
      }
      return;
    }

    // Residents / crew: must have apartment in building
    const aptIds = [
      ...(user.apartmentIds ?? []),
      ...(user.apartmentId ? [user.apartmentId] : []),
    ];
    if (!aptIds.length) {
      throw new ForbiddenException('Немає доступу до чату цього будинку');
    }
    const ok = await this.prisma.apartment.findFirst({
      where: { id: { in: aptIds }, buildingId },
      select: { id: true },
    });
    if (!ok) {
      throw new ForbiddenException('Немає доступу до чату цього будинку');
    }
  }

  /**
   * Ensure building-wide chat exists and user is a member.
   */
  async ensureBuildingThread(user: AuthUser, buildingId?: string) {
    const building = await this.resolveAccessibleBuilding(user, buildingId);

    let thread = await this.prisma.chatThread.findFirst({
      where: { buildingId: building.id, kind: ChatThreadKind.building },
    });
    if (!thread) {
      thread = await this.prisma.chatThread.create({
        data: {
          buildingId: building.id,
          kind: ChatThreadKind.building,
          title: `Чат · ${building.name}`,
        },
      });
    }

    await this.prisma.chatThreadMember.upsert({
      where: { threadId_userId: { threadId: thread.id, userId: user.id } },
      create: { threadId: thread.id, userId: user.id },
      update: {},
    });

    return thread;
  }

  async ensureBoardResidentsThread(user: AuthUser, buildingId?: string) {
    const building = await this.resolveAccessibleBuilding(user, buildingId);

    let thread = await this.prisma.chatThread.findFirst({
      where: { buildingId: building.id, kind: ChatThreadKind.board_residents },
    });
    if (!thread) {
      thread = await this.prisma.chatThread.create({
        data: {
          buildingId: building.id,
          kind: ChatThreadKind.board_residents,
          title: `Правління ↔ мешканці · ${building.name}`,
        },
      });
    }

    await this.prisma.chatThreadMember.upsert({
      where: { threadId_userId: { threadId: thread.id, userId: user.id } },
      create: { threadId: thread.id, userId: user.id },
      update: {},
    });

    return thread;
  }

  async createDirect(user: AuthUser, peerUserId: string) {
    if (peerUserId === user.id) {
      throw new BadRequestException('Не можна створити чат із собою');
    }
    const peer = await this.prisma.user.findUnique({ where: { id: peerUserId } });
    if (!peer || peer.status !== 'active') {
      throw new NotFoundException('Користувача не знайдено');
    }

    // Same tenant only (super_admin may DM anyone)
    if (user.role !== UserRole.super_admin) {
      if (!user.tenantId || !peer.tenantId || user.tenantId !== peer.tenantId) {
        throw new ForbiddenException('Немає доступу до цього користувача');
      }
    }

    // Find existing direct thread between the two
    const mine = await this.prisma.chatThreadMember.findMany({
      where: { userId: user.id, thread: { kind: ChatThreadKind.direct } },
      include: { thread: { include: { members: true } } },
    });
    const existing = mine.find(
      (m) =>
        m.thread.members.some((x) => x.userId === peerUserId) &&
        m.thread.members.length === 2,
    );
    if (existing) return existing.thread;

    const me = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { firstName: true, lastName: true },
    });
    const thread = await this.prisma.chatThread.create({
      data: {
        kind: ChatThreadKind.direct,
        title: `${me?.firstName ?? 'Я'} ↔ ${peer.firstName} ${peer.lastName}`.trim(),
        members: {
          create: [{ userId: user.id }, { userId: peerUserId }],
        },
      },
    });
    return thread;
  }

  private async assertMember(threadId: string, userId: string) {
    const m = await this.prisma.chatThreadMember.findUnique({
      where: { threadId_userId: { threadId, userId } },
    });
    if (!m) throw new ForbiddenException('Ви не учасник цього чату');
    return m;
  }

  async getMessages(threadId: string, user: AuthUser, limit = 50) {
    await this.assertMember(threadId, user.id);
    const messages = await this.prisma.chatMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
      include: {
        author: { select: { id: true, firstName: true, lastName: true, role: true } },
      },
    });
    await this.prisma.chatThreadMember.update({
      where: { threadId_userId: { threadId, userId: user.id } },
      data: { lastReadAt: new Date() },
    });
    return messages.reverse();
  }

  async postMessage(threadId: string, body: string, user: AuthUser) {
    const text = body?.trim();
    if (!text) throw new BadRequestException('Порожнє повідомлення');
    if (text.length > 4000) throw new BadRequestException('Повідомлення задовге');

    await this.assertMember(threadId, user.id);

    const msg = await this.prisma.chatMessage.create({
      data: { threadId, authorId: user.id, body: text },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, role: true } },
      },
    });
    await this.prisma.chatThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });
    return msg;
  }

  /** Staff can list residents for starting DMs (same tenant). */
  async listPeers(user: AuthUser) {
    if (!STAFF.includes(user.role as UserRole) && user.role !== UserRole.resident) {
      return [];
    }
    const tenantFilter =
      user.role === UserRole.super_admin
        ? {}
        : user.tenantId
          ? { tenantId: user.tenantId }
          : { id: '__none__' };

    return this.prisma.user.findMany({
      where: {
        status: 'active',
        id: { not: user.id },
        ...tenantFilter,
        role: {
          in: STAFF.includes(user.role as UserRole)
            ? [UserRole.resident, UserRole.board, UserRole.chairman, UserRole.dispatcher]
            : [UserRole.chairman, UserRole.board, UserRole.dispatcher],
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        email: true,
      },
      take: 100,
      orderBy: { lastName: 'asc' },
    });
  }
}
