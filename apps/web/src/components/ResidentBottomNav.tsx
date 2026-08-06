'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { NavIcon, type NavIconName } from '@/components/ui/NavIcon';
import { apiFetch, getToken } from '@/lib/api';
import { resolveResidentApartmentId } from '@/lib/apartment-context';
import {
  countQueuedMeterReadings,
  METER_QUEUE_EVENT,
} from '@/lib/meter-offline-queue';

type NavKey =
  | 'home'
  | 'residentTabAccount'
  | 'residentTabRequests'
  | 'meters'
  | 'residentNavMore';

interface Item {
  href: string;
  labelKey: NavKey;
  icon: NavIconName;
}

const ITEMS: Item[] = [
  { href: '/resident', labelKey: 'home', icon: 'home' },
  { href: '/resident?tab=account', labelKey: 'residentTabAccount', icon: 'wallet' },
  { href: '/resident?tab=requests', labelKey: 'residentTabRequests', icon: 'bell' },
  { href: '/resident/meters', labelKey: 'meters', icon: 'gauge' },
  { href: '/resident?tab=more', labelKey: 'residentNavMore', icon: 'list' },
];

function resolveActive(pathname: string, tab: string | null): NavKey {
  if (pathname.startsWith('/resident/meters')) return 'meters';

  const secondary =
    pathname.startsWith('/resident/messenger') ||
    pathname.startsWith('/resident/meetings') ||
    pathname.startsWith('/resident/security') ||
    pathname.startsWith('/resident/instructions');
  if (secondary) return 'residentNavMore';

  if (pathname === '/resident' || pathname === '/resident/') {
    if (!tab || tab === 'home') return 'home';
    if (tab === 'account') return 'residentTabAccount';
    if (tab === 'requests' || tab === 'communications') return 'residentTabRequests';
    return 'residentNavMore';
  }

  return 'home';
}

function formatBadge(n: number): string {
  if (n <= 0) return '';
  return n > 9 ? '9+' : String(n);
}

/** Mobile-only primary navigation for residents (PWA) with live badges. */
export function ResidentBottomNav() {
  const { t } = useI18n();
  const pathname = usePathname();
  const search = useSearchParams();
  const tab = search?.get('tab') ?? null;
  const active = resolveActive(pathname, tab);
  const [newsUnread, setNewsUnread] = useState(0);
  const [openRequests, setOpenRequests] = useState(0);
  const [metersBadge, setMetersBadge] = useState(0);

  const refreshLocalMeters = useCallback(() => {
    const apt = resolveResidentApartmentId();
    setMetersBadge(countQueuedMeterReadings(apt || undefined));
  }, []);

  const loadServerBadges = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const [unread, requests] = await Promise.all([
        apiFetch<{ unread: number }>('/communications/announcements/unread-count', {
          token,
        }).catch(() => ({ unread: 0 })),
        apiFetch<Array<{ status: string }>>('/communications/requests', { token }).catch(
          () => [] as Array<{ status: string }>,
        ),
      ]);
      setNewsUnread(unread.unread ?? 0);
      setOpenRequests(
        requests.filter((r) => r.status === 'new' || r.status === 'in_progress').length,
      );
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refreshLocalMeters();
    void loadServerBadges();
    const id = window.setInterval(() => void loadServerBadges(), 60_000);
    const onQueue = () => refreshLocalMeters();
    window.addEventListener(METER_QUEUE_EVENT, onQueue);
    return () => {
      window.clearInterval(id);
      window.removeEventListener(METER_QUEUE_EVENT, onQueue);
    };
  }, [loadServerBadges, refreshLocalMeters]);

  // Re-poll when route changes (e.g. after reading news)
  useEffect(() => {
    void loadServerBadges();
    refreshLocalMeters();
  }, [pathname, tab, loadServerBadges, refreshLocalMeters]);

  function badgeFor(key: NavKey): number {
    if (key === 'meters') return metersBadge;
    if (key === 'residentTabRequests') return openRequests;
    if (key === 'residentNavMore') return newsUnread;
    if (key === 'home') {
      // nudge home if anything needs attention
      return newsUnread + openRequests + metersBadge > 0
        ? Math.min(9, newsUnread + openRequests + metersBadge)
        : 0;
    }
    return 0;
  }

  return (
    <nav className="resident-bottom-nav" aria-label={t('residentBottomNav')}>
      {ITEMS.map((item) => {
        const isActive = active === item.labelKey;
        const count = badgeFor(item.labelKey);
        const badge = formatBadge(count);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`resident-bottom-nav-item${isActive ? ' active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            aria-label={
              badge
                ? `${t(item.labelKey)}, ${t('residentNavBadgeAria', { count })}`
                : t(item.labelKey)
            }
          >
            <span className="resident-bottom-nav-icon-wrap">
              <NavIcon name={item.icon} className="resident-bottom-nav-icon" />
              {badge && (
                <span className="resident-bottom-nav-badge" aria-hidden>
                  {badge}
                </span>
              )}
            </span>
            <span>{t(item.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
