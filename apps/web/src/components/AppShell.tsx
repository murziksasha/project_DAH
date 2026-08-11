'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, Suspense, useCallback, useEffect, useState } from 'react';
import { BuildingSwitcher } from '@/components/BuildingSwitcher';
import { HeaderSearch } from '@/components/HeaderSearch';
import { useI18n } from '@/components/LocaleProvider';
import { NotificationBell } from '@/components/NotificationBell';
import { OnboardingBanner } from '@/components/OnboardingBanner';
import { MeterQueueFlusher } from '@/components/MeterQueueFlusher';
import { OrgMembershipSwitcher } from '@/components/OrgMembershipSwitcher';
import { ResidentApartmentSwitcher } from '@/components/ResidentApartmentSwitcher';
import { ResidentBottomNav } from '@/components/ResidentBottomNav';
import { ResidentTour } from '@/components/ResidentTour';
import { NavIcon } from '@/components/ui/NavIcon';
import { apiFetch, getToken } from '@/lib/api';
import { getRoleHome, getStoredUser, logout } from '@/lib/auth';
import { getSelectedTenantId } from '@/lib/building-context';
import {
  applyComfort,
  getStoredComfort,
  toggleComfort,
  type ComfortMode,
} from '@/lib/comfort';
import { groupLabel, navLabelForHref, type Locale } from '@/lib/i18n';
import { getNavGroups, getShellTitle, type NavGroup } from '@/lib/nav-config';
import { roleLabel } from '@/lib/org-labels';
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
  const { t } = useI18n();
  const homeLabel = t('home');
  const allHrefs = groups.flatMap((g) => g.items.map((i) => i.href));
  const activeHref = resolveActiveNavHref(pathname, allHrefs, homeHref);

  return (
    <nav className="app-drawer-nav" id="app-nav" aria-label={t('mainNav')}>
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
  const { locale, setLocale, t } = useI18n();
  const [navExpanded, setNavExpanded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isInitialized, setIsInitialized] = useState(true);
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [comfort, setComfort] = useState<ComfortMode>('normal');
  const user = getStoredUser();

  const loadInitStatus = useCallback(async () => {
    if (user?.role !== 'super_admin') return;
    const token = getToken();
    if (!token) return;
    try {
      // Wizard is per selected tenant (X-Tenant-Id). With orgs already created but none
      // selected, keep the master hidden — pick org first, then setup if needed.
      const selectedTenant = getSelectedTenantId();
      if (!selectedTenant) {
        const tenants = await apiFetch<Array<{ id: string }>>('/tenants', { token });
        if (Array.isArray(tenants) && tenants.length > 0) {
          setIsInitialized(true);
          return;
        }
      }
      const status = await apiFetch<{ isInitialized: boolean }>('/setup/status', { token });
      setIsInitialized(status.isInitialized);
    } catch {
      setIsInitialized(true);
    }
  }, [user?.role]);

  useEffect(() => {
    applyTheme(getStoredTheme());
    setTheme(getStoredTheme());
    applyComfort(getStoredComfort());
    setComfort(getStoredComfort());
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
          setLocale(s.locale);
        }
      })
      .catch(() => undefined);
  }, [loadInitStatus, setLocale]);

  // Re-check setup after SPA navigations (wizard complete) and tenant switches.
  useEffect(() => {
    if (user?.role !== 'super_admin') return;
    loadInitStatus();
    const onTenant = () => loadInitStatus();
    window.addEventListener('dah-tenant-change', onTenant);
    return () => window.removeEventListener('dah-tenant-change', onTenant);
  }, [pathname, loadInitStatus, user?.role]);

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
  const title =
    user.role === 'super_admin'
      ? t('setupTitle')
      : user.role === 'resident'
        ? t('residentCabinet')
        : orgType === 'management_company'
          ? t('boardCabinetUk')
          : t('boardCabinet');
  const shellFallback = getShellTitle(user.role, orgType);
  const userLabel = `${user.firstName} ${user.lastName}`.trim() || user.email;
  const roleDisplay = roleLabel(user.role, orgType);
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

  function onToggleComfort() {
    setComfort(toggleComfort());
  }

  function onToggleLocale() {
    setLocale(locale === 'uk' ? 'ru' : 'uk');
  }

  const isResident = user.role === 'resident';

  return (
    <div
      className={[
        'app-shell',
        desktopCollapsed ? 'nav-collapsed' : '',
        mobileOpen ? 'nav-mobile-open' : '',
        isResident ? 'is-resident' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header className="app-header">
        <button
          type="button"
          className={`app-menu-btn${menuOpenVisual ? ' open' : ''}`}
          aria-label={t('menu')}
          aria-expanded={menuOpenVisual}
          aria-controls="app-nav"
          onClick={onToggleMenu}
        >
          <span className={`app-menu-icon${menuOpenVisual ? ' open' : ''}`} />
        </button>
        <div className="app-header-title">
          <span className="app-brand">{t('appName')}</span>
          <span className="app-header-sub">{title || shellFallback}</span>
        </div>
        <div
          className="app-header-identity"
          title={`${userLabel} · ${roleDisplay}${user.email ? ` · ${user.email}` : ''}`}
          aria-label={`${t('signedInAs')}: ${userLabel}, ${roleDisplay}`}
        >
          <span className="app-header-identity-name">{userLabel}</span>
          <span className="app-header-identity-role">{roleDisplay}</span>
        </div>
        <div className="app-header-actions">
          <OrgMembershipSwitcher />
          <BuildingSwitcher />
          {isResident && <ResidentApartmentSwitcher />}
          <HeaderSearch />
          <NotificationBell />
          {isResident && (
            <button
              type="button"
              className="app-icon-btn"
              aria-label={comfort === 'large' ? t('comfortNormal') : t('comfortLarge')}
              title={comfort === 'large' ? t('comfortNormal') : t('comfortLarge')}
              onClick={onToggleComfort}
            >
              {comfort === 'large' ? 'A' : 'A⁺'}
            </button>
          )}
          <button
            type="button"
            className="app-icon-btn"
            aria-label={locale === 'uk' ? 'RU' : 'UK'}
            title={t('language')}
            onClick={onToggleLocale}
          >
            {locale === 'uk' ? 'RU' : 'UK'}
          </button>
          <button
            type="button"
            className="app-icon-btn"
            aria-label={theme === 'dark' ? t('themeLight') : t('themeDark')}
            title={theme === 'dark' ? t('themeLight') : t('themeDark')}
            onClick={onToggleTheme}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <button type="button" className="app-logout-btn" onClick={() => logout()}>
            {t('logout')}
          </button>
        </div>
      </header>

      <div className="app-shell-body">
        {mobileOpen && (
          <button
            type="button"
            className="app-drawer-backdrop"
            aria-label={t('closeMenu')}
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
          <div className="app-drawer-user">
            <span className="app-drawer-user-name">{userLabel}</span>
            <span className="app-drawer-user-role">{roleDisplay}</span>
          </div>
          <NavGroups
            groups={navGroups}
            pathname={pathname}
            homeHref={homeHref}
            locale={locale}
            iconOnly={iconOnly}
          />
          {isResident && (
            <div className="app-drawer-footer">
              <button
                type="button"
                className="app-drawer-link app-drawer-comfort"
                onClick={onToggleComfort}
                title={comfort === 'large' ? t('comfortNormal') : t('comfortLarge')}
                aria-label={comfort === 'large' ? t('comfortNormal') : t('comfortLarge')}
                aria-pressed={comfort === 'large'}
              >
                <span className="app-drawer-link-icon app-drawer-comfort-glyph" aria-hidden>
                  {comfort === 'large' ? 'A' : 'A⁺'}
                </span>
                <span className="app-drawer-link-label">
                  {comfort === 'large' ? t('comfortNormal') : t('comfortLarge')}
                </span>
              </button>
            </div>
          )}
        </aside>

        <div className={`app-content${isResident ? ' has-resident-nav' : ''}`}>
          <OnboardingBanner />
          {children}
        </div>
      </div>

      {isResident && (
        <>
          <MeterQueueFlusher />
          <ResidentTour />
          <Suspense fallback={null}>
            <ResidentBottomNav />
          </Suspense>
        </>
      )}
    </div>
  );
}
