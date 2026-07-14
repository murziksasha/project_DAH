import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RequestStatus, UserRole } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { CreatePollDto } from './dto/create-poll.dto';
import { CreateRequestDto } from './dto/create-request.dto';
import { UpdateRequestDto } from './dto/update-request.dto';

const ADMIN_ROLES: UserRole[] = [UserRole.chairman, UserRole.accountant, UserRole.board];

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

  listRequests(user: AuthUser) {
    const isAdmin = ADMIN_ROLES.includes(user.role as UserRole);
    return this.prisma.request.findMany({
      where: isAdmin ? undefined : { authorId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async createRequest(dto: CreateRequestDto, authorId: string) {
    const request = await this.prisma.request.create({
      data: {
        title: dto.title,
        description: dto.description,
        category: dto.category,
        authorId,
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
      payload: { title: dto.title, category: dto.category },
    });

    void this.mail.notifyAdmins('request.created', {
      firstName: request.author.firstName,
      lastName: request.author.lastName,
      title: dto.title,
      body: dto.description,
    });

    return request;
  }

  async updateRequest(id: string, dto: UpdateRequestDto, userId: string) {
    const request = await this.prisma.request.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Заявку не знайдено');

    if (dto.assigneeId) {
      const assignee = await this.prisma.user.findUnique({ where: { id: dto.assigneeId } });
      if (!assignee || !ADMIN_ROLES.includes(assignee.role)) {
        throw new BadRequestException('Виконавець має бути з правління');
      }
    }

    const updated = await this.prisma.request.update({
      where: { id },
      data: {
        status: dto.status,
        assigneeId: dto.assigneeId,
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
      payload: { status: dto.status, assigneeId: dto.assigneeId },
    });
    return updated;
  }

  async listPolls(userId?: string) {
    const polls = await this.prisma.poll.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        options: {
          include: { _count: { select: { votes: true } } },
        },
        votes: userId ? { where: { userId }, select: { optionId: true } } : false,
        _count: { select: { votes: true } },
      },
    });

    return polls.map(({ votes, ...poll }) => ({
      ...poll,
      userVote: votes?.[0]?.optionId ?? null,
    }));
  }

  async getPoll(id: string, userId: string) {
    const poll = await this.prisma.poll.findUnique({
      where: { id },
      include: {
        options: {
          include: { _count: { select: { votes: true } } },
        },
        votes: { where: { userId }, select: { optionId: true } },
        _count: { select: { votes: true } },
      },
    });
    if (!poll) throw new NotFoundException('Опитування не знайдено');

    const userVote = poll.votes[0]?.optionId ?? null;
    const { votes: _votes, ...rest } = poll;
    return { ...rest, userVote };
  }

  async createPoll(dto: CreatePollDto, userId: string) {
    if (dto.options.length < 2) {
      throw new BadRequestException('Потрібно щонайменше 2 варіанти відповіді');
    }
    const poll = await this.prisma.poll.create({
      data: {
        question: dto.question,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
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
      payload: { question: dto.question, optionsCount: dto.options.length },
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

    await this.prisma.pollVote.create({
      data: { pollId, optionId, userId },
    });

    return this.getPoll(pollId, userId);
  }

  async closePoll(id: string, userId: string) {
    const poll = await this.prisma.poll.findUnique({ where: { id } });
    if (!poll) throw new NotFoundException('Опитування не знайдено');
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
      payload: { question: poll.question },
    });
    return updated;
  }
}