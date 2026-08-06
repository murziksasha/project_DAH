'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, getToken } from '@/lib/api';

interface SearchResult {
  apartments: Array<{
    id: string;
    number: string;
    entrance: number;
    area: number;
    building?: { id: string; name: string };
  }>;
  users: Array<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    status: string;
    apartmentId: string | null;
  }>;
  requests: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    category: string;
    createdAt: string;
  }>;
}

export default function AdminSearchPage() {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [data, setData] = useState<SearchResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const initial = new URLSearchParams(window.location.search).get('q');
    if (initial) setQ(initial);
  }, []);

  const search = useCallback(async (term: string) => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    if (!term.trim()) {
      setData({ apartments: [], users: [], requests: [] });
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<SearchResult>(
        `/building/search?q=${encodeURIComponent(term.trim())}`,
        { token },
      );
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void search(q), 250);
    return () => window.clearTimeout(id);
  }, [q, search]);

  return (
    <main>
      <PageHeader
        title={t('search')}
        description="Квартири, мешканці, email, відкриті заявки"
      />
      {error && <p className="error">{error}</p>}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <label htmlFor="q">{t('search')}</label>
        <input
          id="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="кв. 42 / Прізвище / email / заявка"
          autoFocus
        />
      </div>

      {loading && <p style={{ color: 'var(--muted)' }}>…</p>}

      {data && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <section className="card">
            <h3 style={{ marginTop: 0 }}>Квартири ({data.apartments.length})</h3>
            {data.apartments.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>{t('noData')}</p>
            ) : (
              <ul style={{ listStyle: 'none', display: 'grid', gap: 6, margin: 0, padding: 0 }}>
                {data.apartments.map((a) => (
                  <li key={a.id}>
                    <Link href={`/admin/apartments/detail/?id=${encodeURIComponent(a.id)}`}>
                      {t('aptPrefix')} {a.number} · під&apos;їзд {a.entrance}
                      {a.building ? ` · ${a.building.name}` : ''}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h3 style={{ marginTop: 0 }}>Користувачі ({data.users.length})</h3>
            {data.users.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>{t('noData')}</p>
            ) : (
              <ul style={{ listStyle: 'none', display: 'grid', gap: 6, margin: 0, padding: 0 }}>
                {data.users.map((u) => (
                  <li key={u.id}>
                    <span>
                      {u.lastName} {u.firstName}
                    </span>
                    <span style={{ color: 'var(--muted)' }}>
                      {' '}
                      · {u.email} · {u.role}
                    </span>
                    {u.apartmentId && (
                      <>
                        {' '}
                        <Link href={`/admin/apartments/detail/?id=${encodeURIComponent(u.apartmentId!)}`}>рахунок</Link>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h3 style={{ marginTop: 0 }}>Заявки ({data.requests.length})</h3>
            {data.requests.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>{t('noData')}</p>
            ) : (
              <ul style={{ listStyle: 'none', display: 'grid', gap: 6, margin: 0, padding: 0 }}>
                {data.requests.map((r) => (
                  <li key={r.id}>
                    <Link href="/admin/dispatch">
                      {r.title} · {r.status} · {r.priority}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
