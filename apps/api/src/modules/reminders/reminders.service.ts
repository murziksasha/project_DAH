import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AccrualLineStatus, FundType, Prisma } from '../../prisma/client';
import { roundMoney } from '../../common/utils/money';
import { calcDailyPenalty, daysOverdue } from '../../common/utils/penalty';
import { PrismaService } from '../../prisma/prisma.service';
import { markOverdueAccrualLines } from '../../common/utils/mark-overdue';
import { parseBuildingSettings } from '../building/building-settings';
import { JournalService } from '../journal/journal.service';
import { PostingService } from '../journal/posting.service';
import { MailService } from '../mail/mail.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { runExclusive } from '../../common/jobs/job-lock';

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private journal: JournalService,
    private posting: PostingService,
  ) {}

  /**
   * @param tenantId organization scope; `null` = platform-wide (super_admin only).
   */
  list(includeSent = false, tenantId: string | null = null) {
    const where: Prisma.ReminderWhereInput = {
      ...(includeSent ? {} : { sentAt: null }),
      ...(tenantId ? { tenantId } : {}),
    };
    return this.prisma.reminder.findMany({
      where: Object.keys(where).length ? where : undefined,
      orderBy: { dueAt: 'asc' },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        apartment: { select: { id: true, number: true, entrance: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      take: 200,
    });
  }

  async create(dto: CreateReminderDto, createdById: string, tenantId: string | null = null) {
    if (tenantId && dto.userId) {
      // Target user must be a member of the same organization (no cross-tenant e-mail).
      const member = await this.prisma.tenantMembership.findFirst({
        where: { userId: dto.userId, tenantId },
        select: { id: true },
      });
      if (!member) throw new NotFoundException('Користувача не знайдено');
    }
    let resolvedTenantId = tenantId;
    if (!resolvedTenantId && dto.apartmentId) {
      const apt = await this.prisma.apartment.findUnique({
        where: { id: dto.apartmentId },
        select: { building: { select: { tenantId: true } } },
      });
      resolvedTenantId = apt?.building.tenantId ?? null;
    }
    return this.prisma.reminder.create({
      data: {
        type: dto.type || 'custom',
        title: dto.title,
        body: dto.body,
        dueAt: new Date(dto.dueAt),
        userId: dto.userId,
        apartmentId: dto.apartmentId,
        createdById,
        tenantId: resolvedTenantId,
      },
    });
  }

  async remove(id: string, tenantId: string | null = null) {
    const r = await this.prisma.reminder.findUnique({ where: { id } });
    if (!r || (tenantId && r.tenantId !== tenantId)) {
      throw new NotFoundException('Нагадування не знайдено');
    }
    await this.prisma.reminder.delete({ where: { id } });
    return { id, deleted: true };
  }

  /**
   * Process due custom reminders + generate debt due emails.
   * Called by worker and optionally by API "run now".
   */
  async processDue(tenantId: string | null = null): Promise<{
    customSent: number;
    debtSent: number;
    markedOverdue: number;
    penaltyLines: number;
    skipped?: boolean;
  }> {
    // M9: one run at a time per scope (worker vs manual `process`, several workers).
    const lease = await runExclusive(
      this.prisma,
      `reminders_scan:${tenantId ?? 'all'}`,
      30 * 60 * 1000,
      async () => {
        const markedOverdue = await markOverdueAccrualLines(this.prisma);
        const customSent = await this.sendDueCustomReminders(tenantId);
        const debtSent = await this.sendDebtReminders(false, tenantId);
        const penaltyLines = await this.processDailyPenalties(tenantId);
        return { customSent, debtSent, markedOverdue, penaltyLines };
      },
    );
    if (lease.skipped) {
      return { customSent: 0, debtSent: 0, markedOverdue: 0, penaltyLines: 0, skipped: true };
    }
    return lease.result;
  }

  /**
   * Daily пеня on overdue accrual debt when building.settings.penalty.enabled.
   * Idempotent per apartment+day via accrual title.
   */
  async processDailyPenalties(tenantId: string | null = null): Promise<number> {
    const buildings = await this.prisma.building.findMany({
      where: tenantId ? { tenantId } : undefined,
      select: { id: true, settings: true },
    });
    let createdLines = 0;
    const period = new Date().toISOString().slice(0, 7);
    const dayKey = new Date().toISOString().slice(0, 10);

    for (const building of buildings) {
      const settings = parseBuildingSettings(building.settings);
      const pen = settings.penalty;
      if (!pen?.enabled) continue;
      const annual = pen.annualRatePercent ?? 0;
      if (annual <= 0) continue;
      const grace = pen.graceDays ?? 0;

      let fundId = pen.fundId ?? null;
      if (!fundId) {
        const fund = await this.prisma.fund.findFirst({
          where: { buildingId: building.id, type: FundType.maintenance },
          select: { id: true },
        });
        fundId = fund?.id ?? null;
      }
      if (!fundId) continue;

      const title = `Пеня ${dayKey}`;
      const periodRow = await this.prisma.accountingPeriod.findUnique({
        where: { buildingId_period: { buildingId: building.id, period } },
      });
      if (periodRow && periodRow.status !== 'open') continue;

      const existing = await this.prisma.accrual.findFirst({
        where: { fundId, period, title },
      });
      if (existing) continue; // already ran today for this fund

      const apts = await this.prisma.apartment.findMany({
        where: { buildingId: building.id },
        select: { id: true },
      });
      const lines: { apartmentId: string; amount: number }[] = [];

      for (const apt of apts) {
        const open = await this.prisma.accrualLine.findMany({
          where: {
            apartmentId: apt.id,
            status: {
              in: [
                AccrualLineStatus.open,
                AccrualLineStatus.partially_paid,
                AccrualLineStatus.overdue,
              ],
            },
            dueDate: { not: null, lt: new Date() },
            // exclude existing penalty lines from base debt (title starts with Пеня)
            accrual: { title: { not: { startsWith: 'Пеня ' } } },
          },
          select: { amount: true, paidAmount: true, dueDate: true },
        });
        let debt = 0;
        let maxDays = 0;
        for (const l of open) {
          const rem = roundMoney(Number(l.amount) - Number(l.paidAmount));
          if (rem > 0) {
            debt += rem;
            if (l.dueDate) maxDays = Math.max(maxDays, daysOverdue(l.dueDate));
          }
        }
        const amount = calcDailyPenalty(debt, {
          annualRatePercent: annual,
          graceDays: grace,
          daysOverdue: maxDays,
          dailyCap: pen.dailyCap,
        });
        if (amount > 0) lines.push({ apartmentId: apt.id, amount });
      }

      if (!lines.length) continue;

      const total = roundMoney(lines.reduce((s, l) => s + l.amount, 0));
      try {
        await this.prisma.$transaction(async (tx) => {
          const accrual = await tx.accrual.create({
            data: { fundId: fundId!, period, title },
          });
          await tx.accrualLine.createMany({
            data: lines.map((l) => ({
              accrualId: accrual.id,
              apartmentId: l.apartmentId,
              amount: l.amount,
              status: AccrualLineStatus.open,
              dueDate: new Date(),
            })),
          });
          await this.posting.postPenalty(
            accrual.id,
            total,
            {
              buildingId: building.id,
              fundId: fundId!,
              description: title,
            },
            tx,
          );
        });
      } catch (e) {
        // Unique (fundId, period, title): a concurrent run already created today's penalty.
        if ((e as { code?: string })?.code === 'P2002') continue;
        throw e;
      }
      createdLines += lines.length;
      this.logger.log(
        `penalty ${building.id} ${dayKey}: ${lines.length} lines, total=${total}`,
      );
    }
    return createdLines;
  }

  /** Force email to all current debtors (board action from reports). */
  async notifyAllDebtors(tenantId: string | null = null): Promise<{ debtSent: number }> {
    const debtSent = await this.sendDebtReminders(true, tenantId);
    return { debtSent };
  }

  private async sendDueCustomReminders(tenantId: string | null = null): Promise<number> {
    const now = new Date();
    const due = await this.prisma.reminder.findMany({
      where: { sentAt: null, dueAt: { lte: now }, ...(tenantId ? { tenantId } : {}) },
      include: {
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
            emailNotifyEnabled: true,
          },
        },
        apartment: { select: { number: true } },
      },
      take: 100,
    });

    let sent = 0;
    for (const r of due) {
      try {
        if (r.user?.email && r.user.emailNotifyEnabled !== false) {
          await this.mail.sendTemplate(r.user.email, 'reminder.due', {
            firstName: r.user.firstName,
            lastName: r.user.lastName,
            title: r.title,
            body: r.body ?? undefined,
            dueDate: r.dueAt.toLocaleDateString('uk-UA'),
            apartmentNumber: r.apartment?.number,
            actionPath: '/resident',
            actionLabel: 'Відкрити кабінет',
          });
        } else if (r.apartmentId) {
          await this.mail.notifyResidentsOfApartments([r.apartmentId], 'reminder.due', () => ({
            title: r.title,
            body: r.body ?? undefined,
            dueDate: r.dueAt.toLocaleDateString('uk-UA'),
            apartmentNumber: r.apartment?.number,
            actionPath: '/resident',
            actionLabel: 'Відкрити кабінет',
          }));
        } else {
          // broadcast to admins
          await this.mail.notifyAdmins(r.tenantId, 'reminder.due', {
            title: r.title,
            body: r.body ?? undefined,
            dueDate: r.dueAt.toLocaleDateString('uk-UA'),
            actionPath: '/admin',
            actionLabel: 'Відкрити кабінет правління',
          });
        }
        await this.prisma.reminder.update({
          where: { id: r.id },
          data: { sentAt: new Date() },
        });
        sent++;
      } catch (err) {
        this.logger.error(`Reminder ${r.id} failed`, err);
      }
    }
    return sent;
  }

  private async sendDebtReminders(
    forceAll: boolean,
    tenantId: string | null = null,
  ): Promise<number> {
    const buildings = await this.prisma.building.findMany({
      where: tenantId ? { tenantId } : undefined,
      select: { id: true, tenantId: true, settings: true },
    });
    let sent = 0;
    for (const building of buildings) {
      sent += await this.sendDebtRemindersForBuilding(building, forceAll);
    }
    return sent;
  }

  private async sendDebtRemindersForBuilding(
    building: { id: string; tenantId: string; settings: Prisma.JsonValue },
    forceAll: boolean,
  ): Promise<number> {
    const settings = parseBuildingSettings(building.settings);
    const days = settings.reminderDaysBeforeDue ?? 3;

    const horizon = new Date();
    horizon.setHours(23, 59, 59, 999);
    horizon.setDate(horizon.getDate() + days);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const lines = await this.prisma.accrualLine.findMany({
      where: {
        apartment: { buildingId: building.id },
        status: {
          in: [
            AccrualLineStatus.open,
            AccrualLineStatus.partially_paid,
            AccrualLineStatus.overdue,
          ],
        },
        ...(forceAll
          ? {}
          : {
              dueDate: { lte: horizon, gte: todayStart },
            }),
      },
      include: {
        apartment: { select: { id: true, number: true } },
        accrual: { select: { title: true, period: true } },
      },
    });

    // Group by apartment
    const byApt = new Map<
      string,
      { number: string; amount: number; dueDate: Date; title: string }
    >();
    for (const line of lines) {
      const bal = roundMoney(Number(line.amount) - Number(line.paidAmount));
      if (bal <= 0 || !line.dueDate) continue;
      const key = line.apartmentId;
      const prev = byApt.get(key);
      if (!prev) {
        byApt.set(key, {
          number: line.apartment.number,
          amount: bal,
          dueDate: line.dueDate,
          title: line.accrual.title,
        });
      } else {
        prev.amount = roundMoney(prev.amount + bal);
        if (line.dueDate < prev.dueDate) prev.dueDate = line.dueDate;
      }
    }

    let sent = 0;
    for (const [apartmentId, row] of byApt) {
      // Avoid spamming: skip if we already sent a debt reminder today for this apt
      const dayKey = todayStart.toISOString().slice(0, 10);
      if (!forceAll) {
        const already = await this.prisma.reminder.findFirst({
          where: {
            type: 'debt_auto',
            apartmentId,
            sentAt: { gte: todayStart },
            meta: { path: ['day'], equals: dayKey },
          },
        });
        if (already) continue;
      }

      await this.mail.notifyResidentsOfApartments([apartmentId], 'reminder.debt', () => ({
        apartmentNumber: row.number,
        amount: row.amount,
        dueDate: row.dueDate.toLocaleDateString('uk-UA'),
        title: row.title,
        actionPath: '/resident?tab=account',
        actionLabel: 'Сплатити / реквізити',
      }));

      await this.prisma.reminder.create({
        data: {
          type: 'debt_auto',
          title: `Борг кв. ${row.number}`,
          body: `Сума ${row.amount} ₴, термін ${row.dueDate.toISOString().slice(0, 10)}`,
          dueAt: row.dueDate,
          sentAt: new Date(),
          apartmentId,
          tenantId: building.tenantId,
          meta: { day: dayKey, amount: row.amount },
        },
      });
      sent++;
    }
    return sent;
  }
}
