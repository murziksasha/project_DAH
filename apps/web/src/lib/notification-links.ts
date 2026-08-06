/**
 * Resolve in-app / push notification target URLs for residents and staff.
 * Migrates legacy paths and fills missing urls from `kind`.
 */
export function resolveNotificationHref(item: {
  url?: string | null;
  kind?: string | null;
  title?: string;
  body?: string;
}): string {
  const kind = (item.kind ?? '').toLowerCase();
  let url = (item.url ?? '').trim();

  if (url) {
    // Legacy resident communications tab → news or requests
    if (url.includes('tab=communications')) {
      const toRequests =
        kind.includes('request') ||
        /заявк/i.test(item.title ?? '') ||
        /заявк/i.test(item.body ?? '');
      url = url.replace('tab=communications', toRequests ? 'tab=requests' : 'tab=news');
    }
    // Relative path only (security)
    if (url.startsWith('/') && !url.startsWith('//')) return url;
    try {
      const u = new URL(url, 'https://local.invalid');
      if (u.pathname.startsWith('/')) {
        return `${u.pathname}${u.search}${u.hash}`;
      }
    } catch {
      /* fall through */
    }
  }

  if (kind.includes('request') || kind === 'sla_breached' || kind === 'sla_warning') {
    if (kind.startsWith('sla') || kind.includes('dispatch')) return '/admin/dispatch';
    return '/resident?tab=requests';
  }
  if (kind.includes('announcement') || kind.includes('news') || kind.includes('poll')) {
    return '/resident?tab=news';
  }
  if (kind.includes('accrual') || kind.includes('payment') || kind.includes('debt')) {
    return '/resident?tab=account';
  }
  if (kind.includes('meter')) return '/resident/meters';
  if (kind.includes('meeting') || kind.includes('kep')) return '/resident/meetings';
  if (kind.includes('message') || kind.includes('messenger') || kind.includes('chat')) {
    return '/resident/messenger';
  }

  return url && url.startsWith('/') ? url : '/resident';
}

export function isPendingApprovalMessage(msg: string): boolean {
  return /очікуйте підтвердження|ожидайте подтвержд|pending|підтвердження від правління|подтверждения от правления/i.test(
    msg,
  );
}
