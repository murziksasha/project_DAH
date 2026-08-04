import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscribeDto } from './dto/subscribe.dto';

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private enabled = false;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  onModuleInit() {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT') ?? 'mailto:admin@osbb.local';

    if (publicKey && privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.enabled = true;
      this.logger.log('Web Push enabled');
    } else {
      this.logger.warn('VAPID keys not configured — push notifications disabled');
    }
  }

  getPublicKey(): string | null {
    return this.config.get<string>('VAPID_PUBLIC_KEY') ?? null;
  }

  async subscribe(userId: string, dto: SubscribeDto) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        userId,
        endpoint: dto.endpoint,
        p256dh: dto.p256dh,
        auth: dto.auth,
      },
      update: {
        userId,
        p256dh: dto.p256dh,
        auth: dto.auth,
      },
    });
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
    return { unsubscribed: true };
  }

  async sendToAll(payload: PushPayload) {
    if (!this.enabled) return { sent: 0, failed: 0 };

    const subscriptions = await this.prisma.pushSubscription.findMany();
    let sent = 0;
    let failed = 0;

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url ?? '/',
    });

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            body,
          );
          sent++;
        } catch (err: unknown) {
          failed++;
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
          }
        }
      }),
    );

    return { sent, failed };
  }

  /** Persist in-app bell notification (+ optional push to that user). */
  async notifyUser(
    userId: string,
    payload: PushPayload & { kind?: string },
  ) {
    await this.prisma.appNotification.create({
      data: {
        userId,
        title: payload.title,
        body: payload.body,
        url: payload.url,
        kind: payload.kind ?? 'info',
      },
    });

    if (!this.enabled) return { push: false };
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url ?? '/',
    });
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            body,
          );
        } catch {
          /* ignore */
        }
      }),
    );
    return { push: true };
  }

  async notifyUsers(
    userIds: string[],
    payload: PushPayload & { kind?: string },
  ) {
    const unique = [...new Set(userIds)];
    for (const id of unique) {
      await this.notifyUser(id, payload);
    }
    return { count: unique.length };
  }

  async listInbox(userId: string, limit = 30) {
    const items = await this.prisma.appNotification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });
    const unread = await this.prisma.appNotification.count({
      where: { userId, readAt: null },
    });
    return { items, unread };
  }

  async markRead(userId: string, id?: string) {
    if (id) {
      await this.prisma.appNotification.updateMany({
        where: { id, userId },
        data: { readAt: new Date() },
      });
    } else {
      await this.prisma.appNotification.updateMany({
        where: { userId, readAt: null },
        data: { readAt: new Date() },
      });
    }
    return { ok: true };
  }

  /**
   * Scan open requests for SLA warning/breach; notify staff once per stage.
   */
  async processSlaAlerts() {
    const open = await this.prisma.request.findMany({
      where: { status: { not: 'done' }, dueAt: { not: null } },
      select: {
        id: true,
        title: true,
        dueAt: true,
        status: true,
        slaWarnedAt: true,
        slaBreachedAt: true,
      },
    });

    const staff = await this.prisma.user.findMany({
      where: {
        status: 'active',
        role: { in: ['chairman', 'board', 'dispatcher'] },
      },
      select: { id: true, email: true, emailNotifyEnabled: true },
    });

    let warned = 0;
    let breached = 0;
    const now = Date.now();
    const warnMs = 4 * 60 * 60 * 1000;

    for (const r of open) {
      if (!r.dueAt) continue;
      const msLeft = r.dueAt.getTime() - now;
      if (msLeft < 0 && !r.slaBreachedAt) {
        await this.prisma.request.update({
          where: { id: r.id },
          data: { slaBreachedAt: new Date(), slaWarnedAt: r.slaWarnedAt ?? new Date() },
        });
        await this.notifyUsers(
          staff.map((s) => s.id),
          {
            title: 'SLA прострочено',
            body: r.title,
            url: '/admin/dispatch',
            kind: 'sla_breached',
          },
        );
        breached++;
      } else if (msLeft >= 0 && msLeft <= warnMs && !r.slaWarnedAt) {
        await this.prisma.request.update({
          where: { id: r.id },
          data: { slaWarnedAt: new Date() },
        });
        await this.notifyUsers(
          staff.map((s) => s.id),
          {
            title: 'SLA — близько дедлайну',
            body: r.title,
            url: '/admin/dispatch',
            kind: 'sla_warning',
          },
        );
        warned++;
      }
    }

    return { warned, breached, scanned: open.length };
  }
}