import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  MeetingStatus,
  MeetingType,
  Prisma,
  UserRole,
  VoteWeightMode,
} from '../../prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { KepService } from '../kep/kep.service';
import type { KepProvider } from '../kep/kep.types';
import {
  CreateMeetingDto,
  SignMeetingDto,
  VoteAgendaDto,
} from './dto/meeting.dto';

const MANAGE_ROLES: UserRole[] = [
  UserRole.chairman,
  UserRole.board,
  UserRole.super_admin,
];

/**
 * Who may vote at general meetings: apartment owners only (ЗУ «Про ОСББ», ст. 10).
 * Staff roles (accountant, dispatcher, brigade, auditor, platform admin) never vote
 * by role; chairman/board vote only for apartments linked to their account.
 */
export const MEETING_VOTER_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.resident,
  UserRole.chairman,
  UserRole.board,
]);

/** Vote weight of one apartment for the meeting mode. */
export function apartmentVoteWeight(mode: VoteWeightMode, area: number | null | undefined): number {
  if (mode === VoteWeightMode.by_area) {
    const a = Number(area ?? 0);
    return a > 0 ? a : 0;
  }
  return 1;
}

function linkedApartmentIds(user: AuthUser): string[] {
  if (user.apartmentIds?.length) return user.apartmentIds;
  return user.apartmentId ? [user.apartmentId] : [];
}

@Injectable()
export class MeetingsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    @Inject(forwardRef(() => KepService))
    private kep: KepService,
  ) {}

  /** Meeting of the caller's organization (404 otherwise). */
  private async loadMeeting(id: string, user: AuthUser) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id } });
    if (!meeting) throw new NotFoundException('Збори не знайдено');
    this.assertMeetingTenant(meeting, user);
    return meeting;
  }

  private assertMeetingTenant(meeting: { tenantId: string | null }, user: AuthUser) {
    if (user.role === UserRole.super_admin) return;
    if (!user.tenantId || meeting.tenantId !== user.tenantId) {
      throw new NotFoundException('Збори не знайдено');
    }
  }

  /**
   * Apartments the user may vote for at this meeting: linked to the account and
   * located in the meeting's building (or organization when no building is set).
   */
  async eligibleApartments(
    meeting: { tenantId: string | null; buildingId: string | null },
    user: AuthUser,
  ): Promise<Array<{ id: string; area: number }>> {
    if (!MEETING_VOTER_ROLES.has(user.role as UserRole)) {
      throw new ForbiddenException('Голосують лише власники квартир');
    }
    const ids = linkedApartmentIds(user);
    if (!ids.length) {
      throw new ForbiddenException('Голосують лише власники квартир (немає привʼязаної квартири)');
    }
    const apts = await this.prisma.apartment.findMany({
      where: {
        id: { in: ids },
        ...(meeting.buildingId
          ? { buildingId: meeting.buildingId }
          : meeting.tenantId
            ? { building: { tenantId: meeting.tenantId } }
            : {}),
      },
      select: { id: true, area: true },
    });
    if (!apts.length) {
      throw new ForbiddenException('Ваша квартира не належить будинку цих зборів');
    }
    return apts;
  }

  list(user: AuthUser) {
    const isStaff = MANAGE_ROLES.includes(user.role as UserRole);
    const tenantFilter: Prisma.MeetingWhereInput =
      user.role === UserRole.super_admin || !user.tenantId
        ? {}
        : { tenantId: user.tenantId };
    const statusFilter: Prisma.MeetingWhereInput = isStaff
      ? {}
      : { status: { in: [MeetingStatus.scheduled, MeetingStatus.open, MeetingStatus.closed] } };

    return this.prisma.meeting.findMany({
      where: {
        ...tenantFilter,
        ...statusFilter,
      },
      orderBy: { scheduledAt: 'desc' },
      include: {
        agendaItems: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { participants: true, signatures: true } },
      },
    });
  }

  async get(id: string, user: AuthUser) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id },
      include: {
        agendaItems: {
          orderBy: { sortOrder: 'asc' },
          include: {
            votes: {
              select: {
                optionKey: true,
                weight: true,
                userId: true,
                apartmentId: true,
              },
            },
          },
        },
        participants: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, role: true } },
          },
        },
        signatures: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!meeting) throw new NotFoundException('Збори не знайдено');
    this.assertMeetingTenant(meeting, user);
    const myApartments = linkedApartmentIds(user);

    const agenda = meeting.agendaItems.map((item) => {
      const byOption: Record<string, number> = {};
      let totalWeight = 0;
      for (const v of item.votes) {
        const w = Number(v.weight);
        byOption[v.optionKey] = (byOption[v.optionKey] ?? 0) + w;
        totalWeight += w;
      }
      const myVote =
        item.votes.find((v) => v.userId === user.id) ??
        item.votes.find((v) => v.apartmentId && myApartments.includes(v.apartmentId));
      return {
        id: item.id,
        title: item.title,
        description: item.description,
        sortOrder: item.sortOrder,
        options: item.options,
        totals: byOption,
        totalWeight,
        myVote: myVote?.optionKey ?? null,
      };
    });

    const participantWeight = meeting.participants.reduce(
      (s, p) => s + Number(p.weight),
      0,
    );
    const signedCount = meeting.signatures.filter((s) => s.status === 'signed').length;
    const verifiedCount = meeting.signatures.filter(
      (s) =>
        s.status === 'signed' &&
        Boolean(
          (s.signaturePayload as Record<string, unknown> | null)?.verified === true,
        ),
    ).length;

    // Eligible weight for by_area / one_per_apartment (building apartments)
    let eligibleWeight = participantWeight;
    if (meeting.buildingId) {
      if (meeting.voteWeight === VoteWeightMode.by_area) {
        const areas = await this.prisma.apartment.aggregate({
          where: { buildingId: meeting.buildingId },
          _sum: { area: true },
        });
        eligibleWeight = areas._sum.area ?? participantWeight;
      } else if (meeting.voteWeight === VoteWeightMode.one_per_apartment) {
        eligibleWeight = await this.prisma.apartment.count({
          where: { buildingId: meeting.buildingId },
        });
      }
    }
    const quorumPercent = meeting.quorumPercent ? Number(meeting.quorumPercent) : null;
    const participationPercent =
      eligibleWeight > 0
        ? Math.round((participantWeight / eligibleWeight) * 1000) / 10
        : 0;
    const quorumMet =
      quorumPercent == null ? true : participationPercent >= quorumPercent;

    return {
      ...meeting,
      agendaItems: agenda,
      stats: {
        participants: meeting.participants.length,
        participantWeight,
        eligibleWeight,
        participationPercent,
        signedCount,
        verifiedCount,
        quorumPercent,
        quorumMet,
      },
    };
  }

  async create(dto: CreateMeetingDto, user: AuthUser) {
    if (!MANAGE_ROLES.includes(user.role as UserRole)) {
      throw new ForbiddenException();
    }

    if (dto.buildingId && user.role !== UserRole.super_admin && user.tenantId) {
      const b = await this.prisma.building.findUnique({
        where: { id: dto.buildingId },
        select: { tenantId: true },
      });
      if (!b || b.tenantId !== user.tenantId) {
        throw new BadRequestException('Будинок не належить вашій організації');
      }
    }

    const meeting = await this.prisma.meeting.create({
      data: {
        title: dto.title,
        description: dto.description,
        type: dto.type ?? MeetingType.general,
        tenantId: user.tenantId ?? null,
        buildingId: dto.buildingId,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        quorumPercent: dto.quorumPercent,
        voteWeight: dto.voteWeight ?? VoteWeightMode.one_per_apartment,
        status: MeetingStatus.draft,
        createdById: user.id,
        agendaItems: dto.agenda?.length
          ? {
              create: dto.agenda.map((a, i) => ({
                sortOrder: i,
                title: a.title,
                description: a.description,
                options: (a.options ?? ['За', 'Проти', 'Утримався']) as Prisma.InputJsonValue,
              })),
            }
          : undefined,
      },
      include: { agendaItems: true },
    });

    await this.audit.log({
      userId: user.id,
      action: 'meeting.created',
      entityType: 'Meeting',
      entityId: meeting.id,
      payload: { title: dto.title },
    });

    return meeting;
  }

  /** Allowed lifecycle: draft→scheduled→open→closed; any→cancelled (except closed). */
  private assertStatusTransition(from: MeetingStatus, to: MeetingStatus) {
    if (from === to) return;
    const allowed: Record<MeetingStatus, MeetingStatus[]> = {
      [MeetingStatus.draft]: [MeetingStatus.scheduled, MeetingStatus.cancelled],
      [MeetingStatus.scheduled]: [
        MeetingStatus.open,
        MeetingStatus.cancelled,
        MeetingStatus.draft,
      ],
      [MeetingStatus.open]: [MeetingStatus.closed, MeetingStatus.cancelled],
      [MeetingStatus.closed]: [], // terminal unless super reopens via cancelled path not allowed
      [MeetingStatus.cancelled]: [MeetingStatus.draft],
    };
    if (!allowed[from]?.includes(to)) {
      throw new BadRequestException(
        `Перехід статусу ${from} → ${to} заборонено. Дозволено: ${(allowed[from] ?? []).join(', ') || 'немає'}`,
      );
    }
  }

  async setStatus(id: string, status: MeetingStatus, user: AuthUser) {
    if (!MANAGE_ROLES.includes(user.role as UserRole)) {
      throw new ForbiddenException();
    }
    const meeting = await this.loadMeeting(id, user);

    this.assertStatusTransition(meeting.status, status);

    const updated = await this.prisma.meeting.update({
      where: { id },
      data: { status },
    });

    // Auto-build protocol text when closing
    if (status === MeetingStatus.closed) {
      await this.buildProtocol(id, user);
    }

    await this.audit.log({
      userId: user.id,
      action: 'meeting.status',
      entityType: 'Meeting',
      entityId: id,
      payload: { status, previous: meeting.status },
    });

    return updated;
  }

  /**
   * Register the caller's eligible apartment(s) as participants (one row per apartment;
   * a co-owner registering the same apartment does not double the quorum weight).
   */
  async register(id: string, user: AuthUser, apartmentId?: string) {
    const meeting = await this.loadMeeting(id, user);
    if (meeting.status !== MeetingStatus.open && meeting.status !== MeetingStatus.scheduled) {
      throw new BadRequestException('Реєстрація недоступна для цього статусу');
    }
    let apts = await this.eligibleApartments(meeting, user);
    if (apartmentId) {
      apts = apts.filter((a) => a.id === apartmentId);
      if (!apts.length) throw new ForbiddenException('Немає права голосу за цю квартиру');
    }

    const rows = [];
    for (const apt of apts) {
      const weight = apartmentVoteWeight(meeting.voteWeight, apt.area);
      rows.push(
        await this.prisma.meetingParticipant.upsert({
          where: { meetingId_apartmentId: { meetingId: id, apartmentId: apt.id } },
          create: { meetingId: id, userId: user.id, apartmentId: apt.id, weight },
          update: { weight },
        }),
      );
    }
    return { ...rows[0], participants: rows };
  }

  /**
   * One vote per apartment per agenda item (re-vote overwrites). Weight follows the
   * meeting mode: 1 per apartment or apartment area (by_area).
   */
  async vote(meetingId: string, agendaItemId: string, dto: VoteAgendaDto, user: AuthUser) {
    const meeting = await this.loadMeeting(meetingId, user);
    if (meeting.status !== MeetingStatus.open) {
      throw new BadRequestException('Голосування доступне лише для відкритих зборів');
    }

    const item = await this.prisma.meetingAgendaItem.findFirst({
      where: { id: agendaItemId, meetingId },
    });
    if (!item) throw new NotFoundException('Питання порядку денного не знайдено');

    const options = Array.isArray(item.options)
      ? (item.options as string[])
      : ['За', 'Проти', 'Утримався'];
    if (!options.includes(dto.optionKey)) {
      throw new BadRequestException(`Невідомий варіант. Доступні: ${options.join(', ')}`);
    }

    const apts = await this.eligibleApartments(meeting, user);
    const target = dto.apartmentId
      ? apts.find((a) => a.id === dto.apartmentId)
      : (apts.find((a) => a.id === user.apartmentId) ?? apts[0]);
    if (!target) throw new ForbiddenException('Немає права голосу за цю квартиру');
    const weight = apartmentVoteWeight(meeting.voteWeight, target.area);

    // Auto-register the apartment if needed
    await this.prisma.meetingParticipant.upsert({
      where: { meetingId_apartmentId: { meetingId, apartmentId: target.id } },
      create: { meetingId, userId: user.id, apartmentId: target.id, weight },
      update: { weight },
    });

    const vote = await this.prisma.meetingVote.upsert({
      where: {
        agendaItemId_apartmentId: { agendaItemId, apartmentId: target.id },
      },
      create: {
        agendaItemId,
        userId: user.id,
        apartmentId: target.id,
        optionKey: dto.optionKey,
        weight,
      },
      update: { optionKey: dto.optionKey, weight, userId: user.id },
    });

    return vote;
  }

  /**
   * Build canonical text for QES (protocol snapshot).
   */
  async buildSignDocument(meetingId: string, user: AuthUser) {
    const meeting = await this.loadMeeting(meetingId, user);
    if (
      meeting.status !== MeetingStatus.open &&
      meeting.status !== MeetingStatus.closed
    ) {
      throw new BadRequestException('Підпис доступний після відкриття зборів');
    }

    let protocolText = meeting.protocolText;
    if (!protocolText) {
      const data = await this.get(meetingId, user);
      protocolText = [
        `ПРОТОКОЛ: ${data.title}`,
        `ID: ${meetingId}`,
        `Статус: ${data.status}`,
        data.scheduledAt ? `Дата: ${new Date(data.scheduledAt).toISOString()}` : '',
        `Підписувач userId: ${user.id}`,
        `Згенеровано: ${new Date().toISOString()}`,
        '',
        'ПОРЯДОК ДЕННИЙ / РЕЗУЛЬТАТИ:',
        ...(data.agendaItems as Array<{ title: string; totals: Record<string, number> }>).map(
          (a) =>
            `— ${a.title}: ${Object.entries(a.totals || {})
              .map(([k, v]) => `${k}=${v}`)
              .join(', ') || 'голосiв немає'}`,
        ),
      ]
        .filter(Boolean)
        .join('\n');
    }

    return {
      title: `Протокол: ${meeting.title}`,
      text: protocolText,
    };
  }

  /**
   * Start KEP / Diia.Підпис session for meeting (via KepService).
   */
  async sign(meetingId: string, dto: SignMeetingDto, user: AuthUser) {
    const doc = await this.buildSignDocument(meetingId, user);
    const provider = (dto.provider ?? undefined) as KepProvider | undefined;
    const result = await this.kep.startSession({
      purpose: 'meeting_protocol',
      refType: 'Meeting',
      refId: meetingId,
      userId: user.id,
      documentTitle: doc.title,
      documentText: doc.text,
      provider,
      returnUrl: dto.returnUrl,
    });

    // Pending MeetingSignature row for UI
    if (!result.signed) {
      await this.prisma.meetingSignature.upsert({
        where: { meetingId_userId: { meetingId, userId: user.id } },
        create: {
          meetingId,
          userId: user.id,
          provider: result.provider,
          status: 'pending',
          sessionId: result.sessionId,
          signaturePayload: {
            digest: result.digest,
            authorizeUrl: result.authorizeUrl,
            deeplink: result.deeplink,
          },
        },
        update: {
          provider: result.provider,
          status: 'pending',
          sessionId: result.sessionId,
          signaturePayload: {
            digest: result.digest,
            authorizeUrl: result.authorizeUrl,
            deeplink: result.deeplink,
          },
        },
      });
    }

    return result;
  }

  async buildProtocol(id: string, user: AuthUser) {
    if (!MANAGE_ROLES.includes(user.role as UserRole)) {
      throw new ForbiddenException();
    }
    const data = await this.get(id, user);
    const lines: string[] = [
      `ПРОТОКОЛ: ${data.title}`,
      `Статус: ${data.status}`,
      data.scheduledAt ? `Дата: ${new Date(data.scheduledAt).toISOString()}` : '',
      `Учасників: ${data.stats.participants}, підписів: ${data.stats.signedCount}`,
      data.stats.quorumPercent != null
        ? `Кворум: ${data.stats.participationPercent}% / ${data.stats.quorumPercent}% (${data.stats.quorumMet ? 'є' : 'немає'})`
        : `Явка: ${data.stats.participationPercent}%`,
      '',
      'ПОРЯДОК ДЕННИЙ / ГОЛОСУВАННЯ:',
    ];
    for (const item of data.agendaItems as Array<{
      title: string;
      totals: Record<string, number>;
      totalWeight: number;
    }>) {
      lines.push(`— ${item.title}`);
      for (const [opt, w] of Object.entries(item.totals)) {
        lines.push(`   ${opt}: ${w}`);
      }
      lines.push(`   Всього вага: ${item.totalWeight}`);
    }
    const protocolText = lines.filter(Boolean).join('\n');
    return this.prisma.meeting.update({
      where: { id },
      data: { protocolText },
    });
  }

  /** PDF buffer of saved protocol (builds text first if missing). */
  async protocolPdf(id: string, user: AuthUser): Promise<{ buffer: Buffer; filename: string }> {
    let meeting: Awaited<ReturnType<typeof this.loadMeeting>> | null = await this.loadMeeting(
      id,
      user,
    );
    if (!meeting.protocolText) {
      await this.buildProtocol(id, user);
      meeting = await this.prisma.meeting.findUnique({ where: { id } });
    }
    if (!meeting?.protocolText) {
      throw new BadRequestException('Не вдалося сформувати протокол');
    }

    const PDFDocument = (await import('pdfkit')).default;
    const { registerPdfFonts, usePdfFont } = await import('../../common/utils/pdf-font');

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    registerPdfFonts(doc);
    usePdfFont(doc, 'Regular');
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));

    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    doc.fontSize(16).text('ПРОТОКОЛ ЗБОРІВ', { align: 'center' });
    doc.moveDown();
    doc.fontSize(11).text(meeting.protocolText, { align: 'left', lineGap: 4 });
    doc.moveDown(2);
    doc.fontSize(9).fillColor('#666').text(
      `Згенеровано: ${new Date().toISOString()} · Мій дім`,
      { align: 'center' },
    );
    doc.end();

    const buffer = await done;
    const safe = meeting.title.replace(/[^\wа-яА-ЯіІїЇєЄ0-9-]+/g, '_').slice(0, 40);
    return { buffer, filename: `protocol-${safe || id}.pdf` };
  }
}
