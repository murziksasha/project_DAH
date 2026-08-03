import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RequestPriority, RequestStatus, UserRole, VoteWeightMode } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { roundMoney } from '../../common/utils/money';
import {
  computeDueAt,
  computeSlaStatus,
  type RequestPriority as SlaPriority,
} from '../../common/utils/request-sla';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { CreatePollDto } from './dto/create-poll.dto';
import { CreateRequestDto } from './dto/create-request.dto';
import { UpdateRequestDto } from './dto/update-request.dto';

const ADMIN_ROLES: UserRole[] = [
  UserRole.chairman,
  UserRole.accountant,
  UserRole.board,
  UserRole.dispatcher,
];

const REQUEST_ASSIGNEE_ROLES: UserRole[] = [
  UserRole.chairman,
  UserRole.board,
  UserRole.dispatcher,
  UserRole.crew,
];

@Injectable()
export class CommunicationsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private audit: AuditService,
    private mail: MailService,
  ) {}

  listAnnouncements() {
    return this.prisma.announcement.findMany({
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async createAnnouncement(dto: CreateAnnouncementDto, authorId: string) {
    const announcement = await this.prisma.announcement.create({
      data: {
        title: dto.title,
        body: dto.body,
        isPinned: dto.isPinned ?? false,
        authorId,
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await this.audit.log({
      userId: authorId,
      action: 'announcement.created',
      entityType: 'Announcement',
      entityId: announcement.id,
      payload: { title: dto.title, isPinned: dto.isPinned ?? false },
    });

    this.notifications
      .sendToAll({
        title: 'Нове оголошення',
        body: dto.title,
        url: '/resident?tab=communications',
      })
      .catch(() => undefined);

    void this.prisma.user
      .findMany({
        where: { status: 'active', emailNotifyEnabled: true, role: 'resident' },
        select: { email: true, firstName: true, lastName: true, emailNotifyEnabled: true },
      })
      .then((users) =>
        this.mail.notifyUsers(users, 'announcement.created', {
          title: dto.title,
          body: dto.body,
        }),
      )
      .catch(() => undefined);

    return announcement;
  }

  async deleteAnnouncement(id: string, userId: string) {
    const announcement = await this.prisma.announcement.findUnique({ where: { id } });
    if (!announcement) throw new NotFoundException('Оголошення не знайдено');
    await this.prisma.announcement.delete({ where: { id } });
    await this.audit.log({
      userId,
      action: 'announcement.deleted',
      entityType: 'Announcement',
      entityId: id,
      payload: { title: announcement.title },
    });
    return { id, deleted: true };
  }

  private enrichRequestSla<T extends { dueAt: Date | null; status: string; priority?: string }>(
    row: T,
  ) {
    const slaStatus = computeSlaStatus(row.dueAt, row.status);
    return {
      ...row,
      slaStatus,
      isOverdue: slaStatus === 'breached',
    };
  }

  async listRequests(user: AuthUser) {
    const isAdmin = ADMIN_ROLES.includes(user.role as UserRole);
    const isCrew = user.role === UserRole.crew;
    const rows = await this.prisma.request.findMany({
      where: isAdmin
        ? undefined
        : isCrew
          ? { assigneeId: user.id }
          : { authorId: user.id },
      orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
      include: {
        author: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return rows.map((r) => this.enrichRequestSla(r));
  }

  /**
   * Dispatcher queue: open requests with SLA filters.
   * query: status, overdueOnly, unassignedOnly, mineOnly, priority
   */
  async listRequestQueue(
    user: AuthUser,
    query: {
      status?: string;
      overdueOnly?: boolean;
      unassignedOnly?: boolean;
      mineOnly?: boolean;
      priority?: string;
    } = {},
  ) {
    const isCrew = user.role === UserRole.crew;
    if (!ADMIN_ROLES.includes(user.role as UserRole) && !isCrew) {
      throw new ForbiddenException('Немає доступу до черги заявок');
    }

    const where: {
      status?: RequestStatus | { not: RequestStatus };
      assigneeId?: string | null;
      priority?: RequestPriority;
    } = {};

    if (query.status && Object.values(RequestStatus).includes(query.status as RequestStatus)) {
      where.status = query.status as RequestStatus;
    } else {
      where.status = { not: RequestStatus.done };
    }

    if (isCrew || query.mineOnly) where.assigneeId = user.id;
    else if (query.unassignedOnly) where.assigneeId = null;
    if (
      query.priority &&
      Object.values(RequestPriority).includes(query.priority as RequestPriority)
    ) {
      where.priority = query.priority as RequestPriority;
    }

    const rows = await this.prisma.request.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }, { createdAt: 'asc' }],
      include: {
        author: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    let enriched = rows.map((r) => this.enrichRequestSla(r));
    if (query.overdueOnly) {
      enriched = enriched.filter((r) => r.isOverdue);
    }

    const summary = {
      open: enriched.length,
      overdue: enriched.filter((r) => r.isOverdue).length,
      warning: enriched.filter((r) => r.slaStatus === 'warning').length,
      unassigned: enriched.filter((r) => !r.assigneeId).length,
      urgent: enriched.filter((r) => r.priority === RequestPriority.urgent).length,
    };

    return { items: enriched, summary };
  }

  async createRequest(dto: CreateRequestDto, authorId: string) {
    const priority = dto.priority ?? RequestPriority.normal;
    const building = await this.prisma.building.findFirst({ select: { settings: true } });
    const settings =
      building?.settings && typeof building.settings === 'object'
        ? (building.settings as { slaHoursByCategory?: Record<string, number> })
        : {};
    const dueAt = dto.dueAt
      ? new Date(dto.dueAt)
      : computeDueAt(
          new Date(),
          dto.category,
          priority as SlaPriority,
          settings.slaHoursByCategory ?? null,
        );

    const request = await this.prisma.request.create({
      data: {
        title: dto.title,
        description: dto.description,
        category: dto.category,
        priority,
        authorId,
        dueAt,
        photoKeys: dto.photoKeys ?? [],
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    await this.audit.log({
      userId: authorId,
      action: 'request.created',
      entityType: 'Request',
      entityId: request.id,
      payload: {
        title: dto.title,
        category: dto.category,
        priority,
        dueAt: dueAt.toISOString(),
      },
    });

    void this.mail.notifyAdmins('request.created', {
      firstName: request.author.firstName,
      lastName: request.author.lastName,
      title: dto.title,
      body: dto.description,
    });

    return this.enrichRequestSla(request);
  }

  async updateRequest(id: string, dto: UpdateRequestDto, userId: string, actorRole?: string) {
    const request = await this.prisma.request.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Заявку не знайдено');

    // Crew may only update own assigned tickets (status)
    if (actorRole === UserRole.crew) {
      if (request.assigneeId !== userId) {
        throw new ForbiddenException('Бригада може змінювати лише призначені собі заявки');
      }
      if (dto.assigneeId && dto.assigneeId !== userId) {
        throw new ForbiddenException('Бригада не може перепризначати заявки');
      }
    }

    if (dto.assigneeId) {
      const assignee = await this.prisma.user.findUnique({ where: { id: dto.assigneeId } });
      if (!assignee || !REQUEST_ASSIGNEE_ROLES.includes(assignee.role)) {
        throw new BadRequestException(
          'Виконавець: диспетчер, бригада, правління або керівник',
        );
      }
    }

    const updated = await this.prisma.request.update({
      where: { id },
      data: {
        status: dto.status,
        priority: dto.priority,
        assigneeId: dto.assigneeId,
        ...(dto.dueAt !== undefined
          ? { dueAt: dto.dueAt ? new Date(dto.dueAt) : null }
          : {}),
        ...(dto.photoKeys !== undefined ? { photoKeys: dto.photoKeys } : {}),
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            emailNotifyEnabled: true,
          },
        },
        assignee: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (dto.status && dto.status !== request.status && updated.author.emailNotifyEnabled !== false) {
      const statusLabel: Record<string, string> = {
        new: 'Нова',
        in_progress: 'В роботі',
        done: 'Виконано',
      };
      void this.mail.sendTemplate(updated.author.email, 'request.status_changed', {
        firstName: updated.author.firstName,
        lastName: updated.author.lastName,
        title: updated.title,
        status: statusLabel[dto.status] ?? dto.status,
      });
    }

    await this.audit.log({
      userId,
      action: 'request.updated',
      entityType: 'Request',
      entityId: id,
      payload: {
        status: dto.status,
        priority: dto.priority,
        assigneeId: dto.assigneeId,
        dueAt: dto.dueAt,
      },
    });
    return this.enrichRequestSla(updated);
  }

  async listPolls(userId?: string) {
    const polls = await this.prisma.poll.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        options: {
          include: {
            votes: { select: { weight: true } },
            _count: { select: { votes: true } },
          },
        },
        votes: userId
          ? { where: { userId }, select: { optionId: true, weight: true } }
          : false,
        _count: { select: { votes: true } },
      },
    });

    return Promise.all(
      polls.map(async (poll) => {
        const stats = await this.pollStats(poll.id, poll.voteWeight, poll.quorumPercent);
        const userVotes = userId ? (poll.votes as Array<{ optionId: string }>) : [];
        return {
          id: poll.id,
          question: poll.question,
          isActive: poll.isActive,
          endsAt: poll.endsAt,
          voteWeight: poll.voteWeight,
          quorumPercent: poll.quorumPercent,
          createdAt: poll.createdAt,
          _count: poll._count,
          options: poll.options.map((o) => ({
            id: o.id,
            text: o.text,
            pollId: o.pollId,
            voteCount: o._count.votes,
            weightSum: roundMoney(o.votes.reduce((s, v) => s + Number(v.weight), 0)),
          })),
          userVote: userVotes[0]?.optionId ?? null,
          stats,
        };
      }),
    );
  }

  async getPoll(id: string, userId: string) {
    const poll = await this.prisma.poll.findUnique({
      where: { id },
      include: {
        options: {
          include: {
            votes: { select: { weight: true } },
            _count: { select: { votes: true } },
          },
        },
        votes: { where: { userId }, select: { optionId: true, weight: true } },
        _count: { select: { votes: true } },
      },
    });
    if (!poll) throw new NotFoundException('Опитування не знайдено');

    const userVote = poll.votes[0]?.optionId ?? null;
    const stats = await this.pollStats(id, poll.voteWeight, poll.quorumPercent);
    return {
      id: poll.id,
      question: poll.question,
      isActive: poll.isActive,
      endsAt: poll.endsAt,
      voteWeight: poll.voteWeight,
      quorumPercent: poll.quorumPercent,
      createdAt: poll.createdAt,
      options: poll.options.map((o) => ({
        id: o.id,
        text: o.text,
        voteCount: o._count.votes,
        weightSum: roundMoney(o.votes.reduce((s, v) => s + Number(v.weight), 0)),
      })),
      _count: poll._count,
      userVote,
      stats,
    };
  }

  async createPoll(dto: CreatePollDto, userId: string) {
    if (dto.options.length < 2) {
      throw new BadRequestException('Потрібно щонайменше 2 варіанти відповіді');
    }
    const poll = await this.prisma.poll.create({
      data: {
        question: dto.question,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        voteWeight: dto.voteWeight ?? VoteWeightMode.one_per_user,
        quorumPercent: dto.quorumPercent,
        options: { create: dto.options.map((text) => ({ text })) },
      },
      include: {
        options: { include: { _count: { select: { votes: true } } } },
        _count: { select: { votes: true } },
      },
    });
    await this.audit.log({
      userId,
      action: 'poll.created',
      entityType: 'Poll',
      entityId: poll.id,
      payload: {
        question: dto.question,
        optionsCount: dto.options.length,
        voteWeight: dto.voteWeight ?? VoteWeightMode.one_per_user,
        quorumPercent: dto.quorumPercent ?? null,
      },
    });
    return poll;
  }

  async votePoll(pollId: string, optionId: string, userId: string) {
    const poll = await this.prisma.poll.findUnique({
      where: { id: pollId },
      include: { options: true },
    });
    if (!poll) throw new NotFoundException('Опитування не знайдено');
    if (!poll.isActive) throw new BadRequestException('Опитування закрито');
    if (poll.endsAt && poll.endsAt < new Date()) {
      throw new BadRequestException('Термін опитування минув');
    }

    const option = poll.options.find((o) => o.id === optionId);
    if (!option) throw new BadRequestException('Невірний варіант відповіді');

    const existing = await this.prisma.pollVote.findUnique({
      where: { pollId_userId: { pollId, userId } },
    });
    if (existing) throw new ForbiddenException('Ви вже проголосували');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        apartmentLinks: { include: { apartment: true }, orderBy: { isPrimary: 'desc' } },
        primaryApartment: true,
      },
    });
    if (!user) throw new NotFoundException('Користувача не знайдено');

    const apartment =
      user.apartmentLinks.find((l) => l.isPrimary)?.apartment ??
      user.primaryApartment ??
      user.apartmentLinks[0]?.apartment ??
      null;

    let weight = 1;
    let apartmentId: string | null = apartment?.id ?? null;

    if (poll.voteWeight === VoteWeightMode.one_per_apartment) {
      if (!apartment) {
        throw new BadRequestException('Для голосування потрібна привʼязка до квартири');
      }
      const already = await this.prisma.pollVote.findFirst({
        where: { pollId, apartmentId: apartment.id },
      });
      if (already) {
        throw new ForbiddenException('Від цієї квартири вже проголосували');
      }
      weight = 1;
      apartmentId = apartment.id;
    } else if (poll.voteWeight === VoteWeightMode.by_area) {
      if (!apartment) {
        throw new BadRequestException('Для голосування за площею потрібна квартира');
      }
      const already = await this.prisma.pollVote.findFirst({
        where: { pollId, apartmentId: apartment.id },
      });
      if (already) {
        throw new ForbiddenException('Від цієї квартири вже проголосували');
      }
      weight = roundMoney(apartment.area);
      apartmentId = apartment.id;
    }

    await this.prisma.pollVote.create({
      data: { pollId, optionId, userId, apartmentId, weight },
    });

    return this.getPoll(pollId, userId);
  }

  async closePoll(id: string, userId: string) {
    const poll = await this.prisma.poll.findUnique({ where: { id } });
    if (!poll) throw new NotFoundException('Опитування не знайдено');
    const stats = await this.pollStats(id, poll.voteWeight, poll.quorumPercent);
    const updated = await this.prisma.poll.update({
      where: { id },
      data: { isActive: false },
      include: {
        options: { include: { _count: { select: { votes: true } } } },
        _count: { select: { votes: true } },
      },
    });
    await this.audit.log({
      userId,
      action: 'poll.closed',
      entityType: 'Poll',
      entityId: id,
      payload: { question: poll.question, stats },
    });
    return { ...updated, stats };
  }

  private async pollStats(
    pollId: string,
    voteWeight: VoteWeightMode,
    quorumPercent: { toNumber?: () => number } | number | null,
  ) {
    const votes = await this.prisma.pollVote.findMany({
      where: { pollId },
      select: { weight: true, optionId: true },
    });
    const votedWeight = roundMoney(votes.reduce((s, v) => s + Number(v.weight), 0));

    let eligibleWeight = 0;
    if (voteWeight === VoteWeightMode.one_per_user) {
      eligibleWeight = await this.prisma.user.count({
        where: { status: 'active', role: 'resident' },
      });
    } else if (voteWeight === VoteWeightMode.one_per_apartment) {
      eligibleWeight = await this.prisma.apartment.count();
    } else {
      const areas = await this.prisma.apartment.aggregate({ _sum: { area: true } });
      eligibleWeight = roundMoney(areas._sum.area ?? 0);
    }

    const q =
      quorumPercent == null
        ? null
        : typeof quorumPercent === 'number'
          ? quorumPercent
          : Number(quorumPercent);
    const participation =
      eligibleWeight > 0 ? roundMoney((votedWeight / eligibleWeight) * 100) : 0;
    const quorumMet = q == null ? true : participation >= q;

    return {
      votedWeight,
      eligibleWeight,
      participationPercent: participation,
      quorumPercent: q,
      quorumMet,
      voteCount: votes.length,
    };
  }
}