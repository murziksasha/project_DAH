import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isPendingApprovalMessage, resolveNotificationHref } from './notification-links';

describe('resolveNotificationHref', () => {
  it('keeps modern resident paths', () => {
    assert.equal(resolveNotificationHref({ url: '/resident?tab=news' }), '/resident?tab=news');
  });

  it('migrates legacy communications tab', () => {
    assert.equal(
      resolveNotificationHref({
        url: '/resident?tab=communications',
        kind: 'announcement',
      }),
      '/resident?tab=news',
    );
    assert.equal(
      resolveNotificationHref({
        url: '/resident?tab=communications',
        title: 'Заявка оновлена',
      }),
      '/resident?tab=requests',
    );
  });

  it('fills from kind when url missing', () => {
    assert.equal(resolveNotificationHref({ kind: 'request_status' }), '/resident?tab=requests');
    assert.equal(resolveNotificationHref({ kind: 'meter' }), '/resident/meters');
    assert.equal(resolveNotificationHref({ kind: 'sla_breached' }), '/admin/dispatch');
  });
});

describe('isPendingApprovalMessage', () => {
  it('detects uk pending login error', () => {
    assert.equal(isPendingApprovalMessage('Очікуйте підтвердження від правління'), true);
    assert.equal(isPendingApprovalMessage('Невірний email або пароль'), false);
  });
});
