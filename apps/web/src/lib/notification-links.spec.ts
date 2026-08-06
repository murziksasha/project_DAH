import { isPendingApprovalMessage, resolveNotificationHref } from './notification-links';

describe('resolveNotificationHref', () => {
  it('keeps modern resident paths', () => {
    expect(resolveNotificationHref({ url: '/resident?tab=news' })).toBe('/resident?tab=news');
  });

  it('migrates legacy communications tab', () => {
    expect(
      resolveNotificationHref({
        url: '/resident?tab=communications',
        kind: 'announcement',
      }),
    ).toBe('/resident?tab=news');
    expect(
      resolveNotificationHref({
        url: '/resident?tab=communications',
        title: 'Заявка оновлена',
      }),
    ).toBe('/resident?tab=requests');
  });

  it('fills from kind when url missing', () => {
    expect(resolveNotificationHref({ kind: 'request_status' })).toBe('/resident?tab=requests');
    expect(resolveNotificationHref({ kind: 'meter' })).toBe('/resident/meters');
    expect(resolveNotificationHref({ kind: 'sla_breached' })).toBe('/admin/dispatch');
  });
});

describe('isPendingApprovalMessage', () => {
  it('detects uk pending login error', () => {
    expect(isPendingApprovalMessage('Очікуйте підтвердження від правління')).toBe(true);
    expect(isPendingApprovalMessage('Невірний email або пароль')).toBe(false);
  });
});
