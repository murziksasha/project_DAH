'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, getToken } from '@/lib/api';
import { t } from '@/lib/i18n';

interface Apartment {
  id: string;
  number: string;
  entrance: number;
  area: number;
}

export default function AdminSearchPage() {
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    apiFetch<Apartment[]>('/building/apartments', { token })
      .then(setApartments)
      .catch((err) => setError(err.message));
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return apartments.slice(0, 30);
    return apartments
      .filter(
        (a) =>
          a.number.toLowerCase().includes(s) ||
          String(a.entrance).includes(s) ||
          `кв ${a.number}`.includes(s),
      )
      .slice(0, 50);
  }, [apartments, q]);

  return (
    <main>
      <PageHeader title={t('search')} description={t('apartmentAccount')} />
      {error && <p className="error">{error}</p>}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <label htmlFor="q">{t('search')}</label>
        <input
          id="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="101, під'їзд 2…"
          autoFocus
        />
      </div>
      <section className="card">
        {filtered.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>{t('noData')}</p>
        ) : (
          <ul style={{ listStyle: 'none', display: 'grid', gap: '0.5rem' }}>
            {filtered.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/admin/apartments/${a.id}`}
                  className="app-drawer-link"
                  style={{ display: 'flex', justifyContent: 'space-between' }}
                >
                  <span>
                    кв. {a.number} · під&apos;їзд {a.entrance}
                  </span>
                  <span style={{ color: 'var(--muted)' }}>{a.area} м²</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
