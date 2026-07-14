import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { MailTemplateId, TemplateContext, renderTemplate } from './mail.templates';
import { sendSmtp } from './smtp-client';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.config.get('SMTP_HOST'));
  }

  getAppUrl(): string {
    return (
      this.config.get('APP_URL') ||
      this.config.get('CORS_ORIGIN') ||
      this.config.get('NEXT_PUBLIC_API_URL')?.replace(/\/api\/?$/, '') ||
      'http://localhost:3000'
    );
  }

  async sendTemplate(
    to: string,
    template: MailTemplateId,
    ctx: TemplateContext = {},
  ): Promise<{ ok: boolean; skipped?: boolean }> {
    if (!to?.includes('@')) {
      return { ok: false, skipped: true };
    }

    const building = await this.prisma.building.findFirst({ select: { name: true } });
    const rendered = renderTemplate(template, {
      buildingName: building?.name,
      appUrl: this.getAppUrl(),
      ...ctx,
    });

    return this.sendRaw({
      to,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      template,
    });
  }

  async sendRaw(opts: {
    to: string;
    subject: string;
    text: string;
    html?: string;
    template: string;
  }): Promise<{ ok: boolean; skipped?: boolean }> {
    const host = this.config.get<string>('SMTP_HOST');
    try {
      if (!host) {
        this.logger.log(`[mail:dev] to=${opts.to} template=${opts.template} subject=${opts.subject}`);
        await this.log(opts.to, opts.subject, opts.template, 'logged');
        return { ok: true, skipped: true };
      }

      await sendSmtp(
        {
          host,
          port: Number(this.config.get('SMTP_PORT') ?? 587),
          secure: this.config.get('SMTP_SECURE') === 'true',
          user: this.config.get('SMTP_USER') || undefined,
          pass: this.config.get('SMTP_PASS') || undefined,
          from: this.config.get('SMTP_FROM') ?? 'DAH <noreply@osbb.local>',
        },
        {
          to: opts.to,
          subject: opts.subject,
          text: opts.text,
          html: opts.html,
        },
      );
      await this.log(opts.to, opts.subject, opts.template, 'sent');
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Mail failed to=${opts.to}: ${message}`);
      await this.log(opts.to, opts.subject, opts.template, 'failed', message);
      return { ok: false };
    }
  }

  /** Notify active users with email notifications enabled. */
  async notifyUsers(
    users: Array<{ email: string; firstName?: string; lastName?: string; emailNotifyEnabled?: boolean }>,
    template: MailTemplateId,
    ctx: TemplateContext = {},
  ) {
    for (const u of users) {
      if (u.emailNotifyEnabled === false) continue;
      await this.sendTemplate(u.email, template, {
        firstName: u.firstName,
        lastName: u.lastName,
        ...ctx,
      });
    }
  }

  async notifyAdmins(template: MailTemplateId, ctx: TemplateContext = {}) {
    const admins = await this.prisma.user.findMany({
      where: {
        status: 'active',
        emailNotifyEnabled: true,
        role: { in: ['chairman', 'accountant', 'board'] },
      },
      select: { email: true, firstName: true, lastName: true, emailNotifyEnabled: true },
    });
    await this.notifyUsers(admins, template, ctx);
  }

  async notifyResidentsOfApartments(
    apartmentIds: string[],
    template: MailTemplateId,
    ctxByApartment?: (apartmentId: string) => TemplateContext,
  ) {
    if (!apartmentIds.length) return;
    const users = await this.prisma.user.findMany({
      where: {
        status: 'active',
        emailNotifyEnabled: true,
        role: 'resident',
        OR: [
          { apartmentId: { in: apartmentIds } },
          { apartmentLinks: { some: { apartmentId: { in: apartmentIds } } } },
        ],
      },
      select: {
        email: true,
        firstName: true,
        lastName: true,
        emailNotifyEnabled: true,
        apartmentId: true,
        apartmentLinks: { select: { apartmentId: true, isPrimary: true } },
      },
    });

    for (const u of users) {
      const aptId =
        u.apartmentLinks.find((l) => apartmentIds.includes(l.apartmentId) && l.isPrimary)
          ?.apartmentId ??
        u.apartmentLinks.find((l) => apartmentIds.includes(l.apartmentId))?.apartmentId ??
        (u.apartmentId && apartmentIds.includes(u.apartmentId) ? u.apartmentId : undefined);
      const extra = aptId && ctxByApartment ? ctxByApartment(aptId) : {};
      await this.sendTemplate(u.email, template, {
        firstName: u.firstName,
        lastName: u.lastName,
        ...extra,
      });
    }
  }

  async listLogs(limit = 50) {
    return this.prisma.emailLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
    });
  }

  private async log(
    to: string,
    subject: string,
    template: string,
    status: string,
    error?: string,
  ) {
    try {
      await this.prisma.emailLog.create({
        data: { to, subject, template, status, error },
      });
    } catch {
      // schema may not be migrated yet in partial deploys
    }
  }
}
