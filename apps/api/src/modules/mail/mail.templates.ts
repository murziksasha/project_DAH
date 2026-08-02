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
  appUrl?: string;
  [key: string]: unknown;
}

export function renderTemplate(
  id: MailTemplateId,
  ctx: TemplateContext,
): { subject: string; text: string; html: string } {
  const name = [ctx.firstName, ctx.lastName].filter(Boolean).join(' ') || 'мешканцю';
  const building = ctx.buildingName ?? 'Мій дім';
  const app = ctx.appUrl ?? '';

  switch (id) {
    case 'registration.pending':
      return wrap(
        `${building}: заявку на реєстрацію прийнято`,
        `Вітаємо, ${name}!\n\nВашу заявку на реєстрацію прийнято. Очікуйте підтвердження від правління.\n${app}`,
      );
    case 'registration.new_request':
      return wrap(
        `${building}: нова заявка мешканця`,
        `Нова реєстрація: ${name} (${ctx.email ?? ''})${ctx.apartmentNumber ? `, кв. ${ctx.apartmentNumber}` : ''}.\nПідтвердіть у кабінеті: Мешканці.\n${app}`,
      );
    case 'registration.approved':
      return wrap(
        `${building}: доступ відкрито`,
        `Вітаємо, ${name}!\n\nВаш обліковий запис підтверджено. Можете увійти в кабінет.\n${app}`,
      );
    case 'registration.rejected':
      return wrap(
        `${building}: заявку відхилено`,
        `Шановний(а) ${name},\n\nЗаявку на реєстрацію відхилено.${ctx.reason ? `\nПричина: ${ctx.reason}` : ''}\nЗверніться до правління.\n${app}`,
      );
    case 'accrual.created':
      return wrap(
        `${building}: нарахування ${ctx.period ?? ''}`.trim(),
        `Шановний(а) ${name},\n\nНараховано: ${ctx.title ?? 'внесок'}${ctx.period ? ` за ${ctx.period}` : ''}.\nСума: ${ctx.amount ?? '—'} ₴${ctx.dueDate ? `\nТермін оплати: ${ctx.dueDate}` : ''}${ctx.apartmentNumber ? `\nКвартира: ${ctx.apartmentNumber}` : ''}.\nДеталі в кабінеті.\n${app}`,
      );
    case 'payment.received':
      return wrap(
        `${building}: платіж зараховано`,
        `Шановний(а) ${name},\n\nОтримано платіж на суму ${ctx.amount ?? '—'} ₴${ctx.apartmentNumber ? ` (кв. ${ctx.apartmentNumber})` : ''}.\nДякуємо!\n${app}`,
      );
    case 'announcement.created':
      return wrap(
        `${building}: ${ctx.title ?? 'оголошення'}`,
        `${ctx.title ?? 'Оголошення'}\n\n${ctx.body ?? ''}\n\n${app}`,
      );
    case 'request.created':
      return wrap(
        `${building}: нова заявка`,
        `Нова заявка від ${name}: ${ctx.title ?? ''}\n${ctx.body ?? ''}\n${app}`,
      );
    case 'request.status_changed':
      return wrap(
        `${building}: статус заявки — ${ctx.status ?? ''}`,
        `Шановний(а) ${name},\n\nЗаявка «${ctx.title ?? ''}» тепер: ${ctx.status ?? ''}.\n${app}`,
      );
    case 'reminder.due':
      return wrap(
        `${building}: нагадування — ${ctx.title ?? ''}`,
        `Шановний(а) ${name},\n\n${ctx.title ?? 'Нагадування'}\n${ctx.body ?? ''}${ctx.dueDate ? `\nДата: ${ctx.dueDate}` : ''}\n${app}`,
      );
    case 'reminder.debt':
      return wrap(
        `${building}: нагадування про борг`,
        `Шановний(а) ${name},\n\nНагадуємо про заборгованість${ctx.apartmentNumber ? ` кв. ${ctx.apartmentNumber}` : ''}: ${ctx.amount ?? '—'} ₴.${ctx.dueDate ? `\nТермін: ${ctx.dueDate}` : ''}\nБудь ласка, сплатіть внесок.\n${app}`,
      );
    case 'test':
      return wrap(`${building}: тестовий лист`, `Це тестове email-сповіщення Мій дім.\n${app}`);
    default:
      return wrap(`${building}: повідомлення`, String(ctx.body ?? ''));
  }
}

function wrap(subject: string, text: string) {
  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;padding:1.25rem">
    <p style="white-space:pre-wrap">${escapeHtml(text)}</p>
    <p style="color:#64748b;font-size:12px;margin-top:2rem">Мій дім — self-hosted кабінет ОСББ та УК</p>
  </div></body></html>`;
  return { subject, text, html };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
