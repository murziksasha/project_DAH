'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { BuildingSwitcher } from '@/components/BuildingSwitcher';
import { HealthBanner } from '@/components/HealthBanner';
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

interface AppShellProps {
  children: ReactNode;
}

function isLinkActive(pathname: string, href: string, homeHref: string) {
  if (href === homeHref || href === '/admin' || href === '/resident') {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(href + '/');
}

function NavGroups({
  groups,
  pathname,
  homeHref,
  locale,
}: {
  groups: NavGroup[];
  pathname: string;
  homeHref: string;
  locale: Locale;
}) {
  return (
    <nav className="app-drawer-nav">
      <Link
        href={homeHref}
        className={`app-drawer-link${pathname === homeHref ? ' active' : ''}`}
      >
        {t('home', locale)}
      </Link>
      {groups.map((group) => (
        <div key={group.id} className="nav-group">
          <div className="nav-group-label">{groupLabel(group.id, group.label, locale)}</div>
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`app-drawer-link${isLinkActive(pathname, item.href, homeHref) ? ' active' : ''}`}
            >
              {navLabelForHref(item.href, item.label, locale)}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
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
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    loadInitStatus();

    // Sync locale from building settings when available
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
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDrawerOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  if (!user) return null;

  const navGroups = getNavGroups(user.role, isInitialized);
  const homeHref = getRoleHome(user.role, isInitialized);
  const titleKey =
    user.role === 'super_admin'
      ? t('setupTitle', locale)
      : user.role === 'resident'
        ? t('residentCabinet', locale)
        : t('boardCabinet', locale);
  const title = titleKey || getShellTitle(user.role);
  const userLabel = `${user.firstName} ${user.lastName}`.trim() || user.email;

  function onToggleTheme() {
    setTheme(toggleTheme());
  }

  function onToggleLocale() {
    const next: Locale = locale === 'uk' ? 'ru' : 'uk';
    setStoredLocale(next);
    setLocale(next);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <button
          type="button"
          className="app-menu-btn"
          aria-label="Меню"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((v) => !v)}
        >
          <span className="app-menu-icon" />
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
        {drawerOpen && (
          <button
            type="button"
            className="app-drawer-backdrop"
            aria-label="Закрити меню"
            onClick={() => setDrawerOpen(false)}
          />
        )}

        <aside className={`app-drawer${drawerOpen ? ' open' : ''}`} aria-hidden={false}>
          <p className="app-drawer-user">{userLabel}</p>
          <NavGroups groups={navGroups} pathname={pathname} homeHref={homeHref} locale={locale} />
        </aside>

        <div className="app-content">{children}</div>
      </div>
    </div>
  );
}
