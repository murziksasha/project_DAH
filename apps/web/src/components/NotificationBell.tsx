'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { apiFetch, getToken } from '@/lib/api';
import { formatDateUk } from '@/lib/money';
import { resolveNotificationHref } from '@/lib/notification-links';

interface InboxItem {
  id: string;
  title: string;
  body: string;
  url: string | null;
  kind: string;
  readAt: string | null;
  createdAt: string;
}

export function NotificationBell() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await apiFetch<{ items: InboxItem[]; unread: number }>(
        '/notifications/inbox?limit=20',
        { token },
      );
      setItems(res.items ?? []);
      setUnread(res.unread ?? 0);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  async function markAll() {
    const token = getToken();
    if (!token) return;
    try {
      await apiFetch('/notifications/inbox/read', { method: 'PATCH', token });
      setUnread(0);
      setItems((prev) =>
        prev.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })),
      );
    } catch {
      /* ignore */
    }
  }

  async function markOne(id: string) {
    const token = getToken();
    if (!token) return;
    try {
      await apiFetch(`/notifications/inbox/${id}/read`, { method: 'PATCH', token });
      setItems((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, readAt: i.readAt ?? new Date().toISOString() } : i,
        ),
      );
      setUnread((u) => Math.max(0, u - 1));
    } catch {
      /* ignore */
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-label={t('notifications')}
        title={t('notifications')}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void load();
        }}
        style={{ position: 'relative' }}
      >
        🔔
        {unread > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              background: 'var(--danger)',
              color: '#fff',
              borderRadius: 999,
              fontSize: 10,
              minWidth: 16,
              height: 16,
              display: 'grid',
              placeItems: 'center',
              padding: '0 4px',
            }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          className="card notification-panel"
          style={{
            position: 'absolute',
            right: 0,
            top: '110%',
            width: 'min(320px, 90vw)',
            maxHeight: 360,
            overflow: 'auto',
            zIndex: 40,
            boxShadow: 'var(--shadow)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <strong style={{ fontSize: '0.9rem' }}>{t('notifications')}</strong>
            {unread > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void markAll()}>
                {t('notificationsMarkAll')}
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0 }}>
              {t('notificationsEmpty')}
            </p>
          ) : (
            <ul style={{ listStyle: 'none', display: 'grid', gap: 8, margin: 0, padding: 0 }}>
              {items.map((n) => {
                const href = resolveNotificationHref(n);
                return (
                  <li
                    key={n.id}
                    style={{
                      padding: '0.5rem',
                      borderRadius: 8,
                      background: n.readAt ? 'transparent' : 'var(--surface-2)',
                    }}
                  >
                    <Link
                      href={href}
                      onClick={() => {
                        setOpen(false);
                        if (!n.readAt) void markOne(n.id);
                      }}
                      style={{ color: 'inherit', textDecoration: 'none', display: 'block' }}
                    >
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{n.title}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{n.body}</div>
                    </Link>
                    <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: 2 }}>
                      {formatDateUk(n.createdAt)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
