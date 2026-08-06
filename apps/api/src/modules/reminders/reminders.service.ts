import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AccrualLineStatus } from '@prisma/client';
import { roundMoney } from '../../common/utils/money';
import { PrismaService } from '../../prisma/prisma.service';
import { markOverdueAccrualLines } from '../../common/utils/mark-overdue';
import { parseBuildingSettings } from '../building/building-settings';
import { MailService } from '../mail/mail.service';
import { CreateReminderDto } from './dto/create-reminder.dto';

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  list(includeSent = false) {
    return this.prisma.reminder.findMany({
      where: includeSent ? undefined : { sentAt: null },
      orderBy: { dueAt: 'asc' },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        apartment: { select: { id: true, number: true, entrance: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      take: 200,
    });
  }

  async create(dto: CreateReminderDto, createdById: string) {
    return this.prisma.reminder.create({
      data: {
        type: dto.type || 'custom',
        title: dto.title,
        body: dto.body,
        dueAt: new Date(dto.dueAt),
        userId: dto.userId,
        apartmentId: dto.apartmentId,
        createdById,
      },
    });
  }

  async remove(id: string) {
    const r = await this.prisma.reminder.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Нагадування не знайдено');
    await this.prisma.reminder.delete({ where: { id } });
    return { id, deleted: true };
  }

  /**
   * Process due custom reminders + generate debt due emails.
   * Called by worker and optionally by API "run now".
   */
  async processDue(): Promise<{ customSent: number; debtSent: number; markedOverdue: number }> {
    const markedOverdue = await markOverdueAccrualLines(this.prisma);
    const customSent = await this.sendDueCustomReminders();
    const debtSent = await this.sendDebtReminders(false);
    return { customSent, debtSent, markedOverdue };
  }

  /** Force email to all current debtors (board action from reports). */
  async notifyAllDebtors(): Promise<{ debtSent: number }> {
    const debtSent = await this.sendDebtReminders(true);
    return { debtSent };
  }

  private async sendDueCustomReminders(): Promise<number> {
    const now = new Date();
    const due = await this.prisma.reminder.findMany({
      where: { sentAt: null, dueAt: { lte: now } },
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
          await this.mail.notifyAdmins('reminder.due', {
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

  private async sendDebtReminders(forceAll: boolean): Promise<number> {
    const building = await this.prisma.building.findFirst();
    const settings = parseBuildingSettings(building?.settings);
    const days = settings.reminderDaysBeforeDue ?? 3;

    const horizon = new Date();
    horizon.setHours(23, 59, 59, 999);
    horizon.setDate(horizon.getDate() + days);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const lines = await this.prisma.accrualLine.findMany({
      where: {
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
          meta: { day: dayKey, amount: row.amount },
        },
      });
      sent++;
    }
    return sent;
  }
}
