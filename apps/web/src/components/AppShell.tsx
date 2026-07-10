'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { apiFetch, getToken } from '@/lib/api';
import { getRoleHome, getStoredUser, logout } from '@/lib/auth';
import { getNavItems, getShellTitle } from '@/lib/nav-config';

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isInitialized, setIsInitialized] = useState(true);
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
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    loadInitStatus();
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

  const navItems = getNavItems(user.role, isInitialized);
  const homeHref = getRoleHome(user.role, isInitialized);
  const title = getShellTitle(user.role);
  const userLabel = `${user.firstName} ${user.lastName}`.trim() || user.email;

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
          <span className="app-brand">DAH</span>
          <span className="app-header-sub">{title}</span>
        </div>
        <button type="button" className="app-logout-btn" onClick={() => logout()}>
          Вихід
        </button>
      </header>

      {drawerOpen && (
        <button
          type="button"
          className="app-drawer-backdrop"
          aria-label="Закрити меню"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <aside className={`app-drawer${drawerOpen ? ' open' : ''}`} aria-hidden={!drawerOpen}>
        <p className="app-drawer-user">{userLabel}</p>
        <nav className="app-drawer-nav">
          <Link
            href={homeHref}
            className={`app-drawer-link${pathname === homeHref ? ' active' : ''}`}
          >
            Домівка
          </Link>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`app-drawer-link${pathname === item.href || pathname.startsWith(item.href + '/') ? ' active' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="app-content">{children}</div>
    </div>
  );
}