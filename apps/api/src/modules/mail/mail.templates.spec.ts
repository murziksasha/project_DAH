import { renderTemplate, resolveActionUrl } from './mail.templates';

describe('mail.templates deep-links', () => {
  const base = 'https://miydim.example';

  describe('resolveActionUrl', () => {
    it('prefers actionUrl', () => {
      expect(
        resolveActionUrl({
          appUrl: base,
          actionPath: '/resident',
          actionUrl: 'https://other.example/x',
        }),
      ).toBe('https://other.example/x');
    });

    it('joins appUrl + actionPath', () => {
      expect(
        resolveActionUrl({
          appUrl: `${base}/`,
          actionPath: '/resident?tab=account',
        }),
      ).toBe(`${base}/resident?tab=account`);
    });

    it('normalizes path without leading slash', () => {
      expect(
        resolveActionUrl({
          appUrl: base,
          actionPath: 'resident?tab=news',
        }),
      ).toBe(`${base}/resident?tab=news`);
    });
  });

  describe('renderTemplate CTAs', () => {
    it('accrual.created includes account deep-link and HTML button', () => {
      const { text, html } = renderTemplate('accrual.created', {
        appUrl: base,
        actionPath: '/resident?tab=account',
        actionLabel: 'Переглянути рахунок / сплатити',
        firstName: 'Іван',
        lastName: 'Тест',
        amount: 100,
        period: '2026-08',
      });
      expect(text).toContain(`${base}/resident?tab=account`);
      expect(html).toContain(`href="${base}/resident?tab=account"`);
      expect(html).toContain('Переглянути рахунок');
      expect(html).toContain('background:#2563eb');
    });

    it('request.status_changed embeds requestId in URL', () => {
      const id = 'req_abc123';
      const { text, html } = renderTemplate('request.status_changed', {
        appUrl: base,
        requestId: id,
        actionPath: `/resident?tab=requests&requestId=${id}`,
        title: 'Протікає труба',
        status: 'В роботі',
        firstName: 'Оля',
      });
      expect(text).toContain(`requestId=${id}`);
      expect(html).toContain(`requestId=${id}`);
      expect(html).toContain('Відкрити мою заявку');
    });

    it('announcement.created links to news tab', () => {
      const { html } = renderTemplate('announcement.created', {
        appUrl: base,
        actionPath: '/resident?tab=news',
        title: 'Відключення води',
        body: 'Завтра з 10:00',
      });
      expect(html).toContain(`${base}/resident?tab=news`);
      expect(html).toContain('Читати в кабінеті');
    });

    it('auth.password_reset uses absolute actionUrl as CTA', () => {
      const reset = `${base}/login?reset=tok123`;
      const { text, html } = renderTemplate('auth.password_reset', {
        appUrl: base,
        actionUrl: reset,
        actionLabel: 'Скинути пароль',
        firstName: 'Петро',
      });
      expect(text).toContain(reset);
      expect(html).toContain(`href="${reset}"`);
      expect(html).toContain('Скинути пароль');
    });

    it('reminder.debt points to pay / account', () => {
      const { html } = renderTemplate('reminder.debt', {
        appUrl: base,
        actionPath: '/resident?tab=account',
        actionLabel: 'Сплатити / реквізити',
        amount: 250,
        apartmentNumber: '12',
      });
      expect(html).toContain('/resident?tab=account');
      expect(html).toContain('Сплатити');
    });
  });
});
