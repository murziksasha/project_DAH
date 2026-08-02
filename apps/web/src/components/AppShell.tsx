'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { BuildingSwitcher } from '@/components/BuildingSwitcher';
import { HealthBanner } from '@/components/HealthBanner';
import { NavIcon } from '@/components/ui/NavIcon';
import { apiFetch, getToken } from '@/lib/api';
import { getRoleHome, getStoredUser, logout } from '@/lib/auth';
import {
  getStoredLocale,
  groupLabel,
  navLabelForHref,
  setStoredLocale,
  t,
  type Locale,
} from '@/lib/i18n';
import { getNavGroups, getShellTitle, type NavGroup } from '@/lib/nav-config';
import { applyTheme, getStoredTheme, toggleTheme, type ThemeMode } from '@/lib/theme';

const NAV_COLLAPSED_KEY = 'dah-nav-collapsed';
const DESKTOP_MQ = '(min-width: 1024px)';

interface AppShellProps {
  children: ReactNode;
}

/**
 * Pick at most one active nav href: exact match, else longest prefix match.
 * Avoids both `/admin/expenses` and `/admin/expenses/list` lighting up together.
 */
export function resolveActiveNavHref(
  pathname: string,
  hrefs: string[],
  homeHref: string,
): string | null {
  if (pathname === homeHref) return homeHref;

  const exact = hrefs.find((h) => h === pathname);
  if (exact) return exact;

  let best: string | null = null;
  for (const href of hrefs) {
    // Home-style roots only match exactly (handled above).
    if (href === homeHref || href === '/admin' || href === '/resident') continue;
    if (pathname === href || pathname.startsWith(`${href}/`)) {
      if (!best || href.length > best.length) best = href;
    }
  }
  return best;
}

function NavGroups({
  groups,
  pathname,
  homeHref,
  locale,
  iconOnly,
}: {
  groups: NavGroup[];
  pathname: string;
  homeHref: string;
  locale: Locale;
  iconOnly: boolean;
}) {
  const homeLabel = t('home', locale);
  const allHrefs = groups.flatMap((g) => g.items.map((i) => i.href));
  const activeHref = resolveActiveNavHref(pathname, allHrefs, homeHref);

  return (
    <nav className="app-drawer-nav" id="app-nav" aria-label="Основна навігація">
      <Link
        href={homeHref}
        className={`app-drawer-link${activeHref === homeHref || pathname === homeHref ? ' active' : ''}`}
        title={iconOnly ? homeLabel : undefined}
        aria-label={iconOnly ? homeLabel : undefined}
      >
        <NavIcon name="home" className="app-drawer-link-icon" />
        <span className="app-drawer-link-label">{homeLabel}</span>
      </Link>
      {groups.map((group) => (
        <div key={group.id} className="nav-group">
          <div className="nav-group-label">{groupLabel(group.id, group.label, locale)}</div>
          {group.items.map((item) => {
            const label = navLabelForHref(item.href, item.label, locale);
            const active = activeHref === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`app-drawer-link${active ? ' active' : ''}`}
                title={iconOnly ? label : undefined}
                aria-label={iconOnly ? label : undefined}
              >
                <NavIcon name={item.icon} className="app-drawer-link-icon" />
                <span className="app-drawer-link-label">{label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  /** Desktop: expanded labels when true; collapsed = icon rail. Default: icons-only. */
  const [navExpanded, setNavExpanded] = useState(false);
  /** Mobile: full drawer overlay open. */
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isInitialized, setIsInitialized] = useState(true);
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [locale, setLocale] = useState<Locale>('uk');
  const user = getStoredUser();

  const loadInitStatus = useCallback(async () => {
    if (user?.role !== 'super_admin') return;
    const token = getToken();
    if (!token) return;
    try {
      const status = await apiFetch<{ isInitialized: boolean }>('/setup/status', { token });
      setIsInitialized(status.isInitialized);
    } catch {
      setIsInitialized(true);
    }
  }, [user?.role]);

  useEffect(() => {
    applyTheme(getStoredTheme());
    setTheme(getStoredTheme());
    const loc = getStoredLocale();
    setLocale(loc);
    setStoredLocale(loc);
    try {
      const stored = localStorage.getItem(NAV_COLLAPSED_KEY);
      if (stored === '1') setNavExpanded(false);
      if (stored === '0') setNavExpanded(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MQ);
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    loadInitStatus();

    apiFetch<{ locale?: string }>('/building/settings', { token })
      .then((s) => {
        if (s.locale === 'uk' || s.locale === 'ru') {
          setStoredLocale(s.locale);
          setLocale(s.locale);
        }
      })
      .catch(() => undefined);
  }, [loadInitStatus]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  if (!user) return null;

  const navGroups = getNavGroups(user.role, isInitialized);
  const homeHref = getRoleHome(user.role, isInitialized);
  const orgType = user.tenant?.orgType ?? null;
  const titleKey =
    user.role === 'super_admin'
      ? t('setupTitle', locale)
      : user.role === 'resident'
        ? t('residentCabinet', locale)
        : orgType === 'management_company'
          ? 'Кабінет УК'
          : t('boardCabinet', locale);
  const title = titleKey || getShellTitle(user.role, orgType);
  const userLabel = `${user.firstName} ${user.lastName}`.trim() || user.email;
  const desktopCollapsed = !navExpanded;
  const iconOnly = isDesktop ? desktopCollapsed : !mobileOpen;
  const menuOpenVisual = isDesktop ? navExpanded : mobileOpen;

  function persistExpanded(next: boolean) {
    setNavExpanded(next);
    try {
      localStorage.setItem(NAV_COLLAPSED_KEY, next ? '0' : '1');
    } catch {
      /* ignore */
    }
  }

  function onToggleMenu() {
    if (isDesktop) {
      persistExpanded(!navExpanded);
    } else {
      setMobileOpen((v) => !v);
    }
  }

  function onToggleTheme() {
    setTheme(toggleTheme());
  }

  function onToggleLocale() {
    const next: Locale = locale === 'uk' ? 'ru' : 'uk';
    setStoredLocale(next);
    setLocale(next);
  }

  return (
    <div
      className={[
        'app-shell',
        desktopCollapsed ? 'nav-collapsed' : '',
        mobileOpen ? 'nav-mobile-open' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header className="app-header">
        <button
          type="button"
          className={`app-menu-btn${menuOpenVisual ? ' open' : ''}`}
          aria-label="Меню"
          aria-expanded={menuOpenVisual}
          aria-controls="app-nav"
          onClick={onToggleMenu}
        >
          <span className={`app-menu-icon${menuOpenVisual ? ' open' : ''}`} />
        </button>
        <div className="app-header-title">
          <span className="app-brand">{t('appName', locale)}</span>
          <span className="app-header-sub">{title}</span>
        </div>
        <div className="app-header-actions">
          <BuildingSwitcher />
          <button
            type="button"
            className="app-icon-btn"
            aria-label={locale === 'uk' ? 'RU' : 'UK'}
            title={t('language', locale)}
            onClick={onToggleLocale}
          >
            {locale === 'uk' ? 'RU' : 'UK'}
          </button>
          <button
            type="button"
            className="app-icon-btn"
            aria-label={theme === 'dark' ? 'Світла тема' : 'Темна тема'}
            title={theme === 'dark' ? 'Світла тема' : 'Темна тема'}
            onClick={onToggleTheme}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <button type="button" className="app-logout-btn" onClick={() => logout()}>
            {t('logout', locale)}
          </button>
        </div>
      </header>

      <HealthBanner />

      <div className="app-shell-body">
        {mobileOpen && (
          <button
            type="button"
            className="app-drawer-backdrop"
            aria-label="Закрити меню"
            onClick={() => setMobileOpen(false)}
          />
        )}

        <aside
          className={[
            'app-drawer',
            desktopCollapsed ? 'collapsed' : '',
            mobileOpen ? 'open' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <p className="app-drawer-user">{userLabel}</p>
          <NavGroups
            groups={navGroups}
            pathname={pathname}
            homeHref={homeHref}
            locale={locale}
            iconOnly={iconOnly}
          />
        </aside>

        <div className="app-content">{children}</div>
      </div>
    </div>
  );
}
