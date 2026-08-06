export type MailTemplateId =
  | 'registration.pending'
  | 'registration.new_request'
  | 'registration.approved'
  | 'registration.rejected'
  | 'accrual.created'
  | 'payment.received'
  | 'announcement.created'
  | 'request.created'
  | 'request.status_changed'
  | 'reminder.due'
  | 'reminder.debt'
  | 'auth.password_reset'
  | 'request.sla_warning'
  | 'request.sla_breached'
  | 'test';

export interface TemplateContext {
  buildingName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  apartmentNumber?: string;
  title?: string;
  body?: string;
  period?: string;
  amount?: string | number;
  dueDate?: string;
  status?: string;
  reason?: string;
  /** Absolute base URL of the web app */
  appUrl?: string;
  /**
   * Path starting with / (e.g. /resident?tab=account).
   * Combined with appUrl into actionUrl unless actionUrl is set.
   */
  actionPath?: string;
  /** Full absolute deep link (preferred for CTAs) */
  actionUrl?: string;
  /** CTA button label in HTML */
  actionLabel?: string;
  requestId?: string;
  [key: string]: unknown;
}

export function resolveActionUrl(ctx: TemplateContext): string {
  if (ctx.actionUrl) return ctx.actionUrl;
  const base = (ctx.appUrl ?? '').replace(/\/$/, '');
  const path = ctx.actionPath?.startsWith('/')
    ? ctx.actionPath
    : ctx.actionPath
      ? `/${ctx.actionPath}`
      : '';
  if (base && path) return `${base}${path}`;
  if (path) return path;
  return base;
}

export function renderTemplate(
  id: MailTemplateId,
  ctx: TemplateContext,
): { subject: string; text: string; html: string } {
  const name = [ctx.firstName, ctx.lastName].filter(Boolean).join(' ') || 'мешканцю';
  const building = ctx.buildingName ?? 'Мій дім';
  const app = (ctx.appUrl ?? '').replace(/\/$/, '');
  const actionUrl = resolveActionUrl(ctx);
  const cta = ctx.actionLabel ?? 'Відкрити в кабінеті «Мій дім»';

  switch (id) {
    case 'registration.pending':
      return wrap(
        `${building}: заявку на реєстрацію прийнято`,
        `Вітаємо, ${name}!\n\nВашу заявку на реєстрацію прийнято. Очікуйте підтвердження від правління.`,
        actionUrl || app,
        'Сторінка входу',
      );
    case 'registration.new_request':
      return wrap(
        `${building}: нова заявка мешканця`,
        `Нова реєстрація: ${name} (${ctx.email ?? ''})${ctx.apartmentNumber ? `, кв. ${ctx.apartmentNumber}` : ''}.\nПідтвердіть у кабінеті: Мешканці.`,
        actionUrl || (app ? `${app}/admin/residents` : ''),
        'Відкрити заявки на реєстрацію',
      );
    case 'registration.approved':
      return wrap(
        `${building}: доступ відкрито`,
        `Вітаємо, ${name}!\n\nВаш обліковий запис підтверджено. Можете увійти в кабінет.`,
        actionUrl || (app ? `${app}/login` : app),
        'Увійти в кабінет',
      );
    case 'registration.rejected':
      return wrap(
        `${building}: заявку відхилено`,
        `Шановний(а) ${name},\n\nЗаявку на реєстрацію відхилено.${ctx.reason ? `\nПричина: ${ctx.reason}` : ''}\nЗверніться до правління.`,
        actionUrl || app,
        cta,
      );
    case 'accrual.created':
      return wrap(
        `${building}: нарахування ${ctx.period ?? ''}`.trim(),
        `Шановний(а) ${name},\n\nНараховано: ${ctx.title ?? 'внесок'}${ctx.period ? ` за ${ctx.period}` : ''}.\nСума: ${ctx.amount ?? '—'} ₴${ctx.dueDate ? `\nТермін оплати: ${ctx.dueDate}` : ''}${ctx.apartmentNumber ? `\nКвартира: ${ctx.apartmentNumber}` : ''}.`,
        actionUrl || (app ? `${app}/resident?tab=account` : ''),
        'Переглянути рахунок / сплатити',
      );
    case 'payment.received':
      return wrap(
        `${building}: платіж зараховано`,
        `Шановний(а) ${name},\n\nОтримано платіж на суму ${ctx.amount ?? '—'} ₴${ctx.apartmentNumber ? ` (кв. ${ctx.apartmentNumber})` : ''}.\nДякуємо!`,
        actionUrl || (app ? `${app}/resident?tab=account` : ''),
        'Відкрити рахунок',
      );
    case 'announcement.created':
      return wrap(
        `${building}: ${ctx.title ?? 'оголошення'}`,
        `${ctx.title ?? 'Оголошення'}\n\n${ctx.body ?? ''}`,
        actionUrl || (app ? `${app}/resident?tab=news` : ''),
        'Читати в кабінеті',
      );
    case 'request.created':
      return wrap(
        `${building}: нова заявка`,
        `Нова заявка від ${name}: ${ctx.title ?? ''}\n${ctx.body ?? ''}`,
        actionUrl || (app ? `${app}/admin/dispatch` : ''),
        'Відкрити чергу заявок',
      );
    case 'request.status_changed':
      return wrap(
        `${building}: статус заявки — ${ctx.status ?? ''}`,
        `Шановний(а) ${name},\n\nЗаявка «${ctx.title ?? ''}» тепер: ${ctx.status ?? ''}.`,
        actionUrl ||
          (app
            ? `${app}/resident?tab=requests${ctx.requestId ? `&requestId=${ctx.requestId}` : ''}`
            : ''),
        'Відкрити мою заявку',
      );
    case 'reminder.due':
      return wrap(
        `${building}: нагадування — ${ctx.title ?? ''}`,
        `Шановний(а) ${name},\n\n${ctx.title ?? 'Нагадування'}\n${ctx.body ?? ''}${ctx.dueDate ? `\nДата: ${ctx.dueDate}` : ''}`,
        actionUrl || (app ? `${app}/resident` : ''),
        cta,
      );
    case 'reminder.debt':
      return wrap(
        `${building}: нагадування про борг`,
        `Шановний(а) ${name},\n\nНагадуємо про заборгованість${ctx.apartmentNumber ? ` кв. ${ctx.apartmentNumber}` : ''}: ${ctx.amount ?? '—'} ₴.${ctx.dueDate ? `\nТермін: ${ctx.dueDate}` : ''}\nБудь ласка, сплатіть внесок.`,
        actionUrl || (app ? `${app}/resident?tab=account` : ''),
        'Сплатити / реквізити',
      );
    case 'auth.password_reset':
      return wrap(
        `${building}: скидання пароля`,
        `Шановний(а) ${name},\n\nЗапит на скидання пароля. Перейдіть за посиланням (дійсне 1 годину).\nЯкщо ви не надсилали запит — проігноруйте цей лист.`,
        actionUrl || app || String(ctx.body ?? ''),
        'Скинути пароль',
      );
    case 'request.sla_warning':
      return wrap(
        `${building}: SLA — наближається дедлайн`,
        `Заявка «${ctx.title ?? ''}» наближається до дедлайну SLA.${ctx.dueDate ? `\nДедлайн: ${ctx.dueDate}` : ''}`,
        actionUrl || (app ? `${app}/admin/dispatch` : ''),
        'Відкрити диспетчерську',
      );
    case 'request.sla_breached':
      return wrap(
        `${building}: SLA — прострочено`,
        `Заявка «${ctx.title ?? ''}» прострочена за SLA.${ctx.dueDate ? `\nДедлайн був: ${ctx.dueDate}` : ''}`,
        actionUrl || (app ? `${app}/admin/dispatch` : ''),
        'Відкрити диспетчерську',
      );
    case 'test':
      return wrap(
        `${building}: тестовий лист`,
        `Це тестове email-сповіщення Мій дім.`,
        actionUrl || app,
        cta,
      );
    default:
      return wrap(`${building}: повідомлення`, String(ctx.body ?? ''), actionUrl || app, cta);
  }
}

function wrap(subject: string, text: string, actionUrl?: string, actionLabel?: string) {
  const linkLine =
    actionUrl && actionUrl.startsWith('http')
      ? `\n\n${actionLabel ?? 'Відкрити'}:\n${actionUrl}`
      : actionUrl
        ? `\n\n${actionUrl}`
        : '';
  const fullText = `${text}${linkLine}`;

  const buttonHtml =
    actionUrl && actionUrl.startsWith('http')
      ? `<p style="margin:1.5rem 0 0">
          <a href="${escapeHtml(actionUrl)}"
             style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:0.7rem 1.1rem;border-radius:8px;font-weight:600">
            ${escapeHtml(actionLabel ?? 'Відкрити в кабінеті')}
          </a>
        </p>
        <p style="color:#64748b;font-size:12px;margin-top:0.75rem;word-break:break-all">${escapeHtml(actionUrl)}</p>`
      : '';

  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;padding:1.25rem">
    <p style="white-space:pre-wrap">${escapeHtml(text)}</p>
    ${buttonHtml}
    <p style="color:#64748b;font-size:12px;margin-top:2rem">Мій дім — self-hosted кабінет ОСББ та УК</p>
  </div></body></html>`;
  return { subject, text: fullText, html };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
