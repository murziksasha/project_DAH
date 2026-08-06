'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { apiFetch, getToken } from '@/lib/api';
import { logout } from '@/lib/auth';
import { formatDateUk } from '@/lib/money';

interface SessionItem {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string;
  current?: boolean;
}

function shortUa(ua: string | null | undefined): string {
  if (!ua) return '—';
  const s = ua.slice(0, 80);
  if (/Mobile|Android|iPhone/i.test(ua)) return `📱 ${s}`;
  if (/Windows|Macintosh|Linux/i.test(ua)) return `💻 ${s}`;
  return s;
}

export function SessionsPanel() {
  const { t } = useI18n();
  const [items, setItems] = useState<SessionItem[]>([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ items: SessionItem[] }>('/auth/sessions', { token });
      setItems(res.items ?? []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function revoke(id: string, isCurrent?: boolean) {
    const token = getToken();
    if (!token) return;
    setBusyId(id);
    setError('');
    try {
      const res = await apiFetch<{ currentRevoked?: boolean }>(`/auth/sessions/${id}`, {
        method: 'DELETE',
        token,
      });
      if (res.currentRevoked || isCurrent) {
        logout();
        return;
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {error && <p className="error">{error}</p>}
      {loading ? (
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{t('loading')}</p>
      ) : items.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{t('securitySessionsEmpty')}</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {items.map((s) => (
            <li
              key={s.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
                padding: '0.6rem 0',
                borderBottom: '1px solid var(--border)',
                alignItems: 'center',
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                  {shortUa(s.userAgent)}
                  {s.current && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: '0.75rem',
                        color: 'var(--success)',
                        fontWeight: 700,
                      }}
                    >
                      {t('securitySessionCurrent')}
                    </span>
                  )}
                </div>
                <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                  {s.ip ?? '—'} · {t('securitySessionLast')}: {formatDateUk(s.lastUsedAt)}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={busyId === s.id}
                onClick={() => void revoke(s.id, s.current)}
              >
                {s.current ? t('securitySessionEndThis') : t('securitySessionRevoke')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => void load()}>
          {t('refresh')}
        </button>
      </div>
    </div>
  );
}
