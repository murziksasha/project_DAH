'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { apiFetch, getToken } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';

const STAFF = new Set([
  'chairman',
  'accountant',
  'board',
  'dispatcher',
  'auditor',
  'super_admin',
]);

interface QuickHit {
  apartments: Array<{ id: string; number: string; entrance: number }>;
  users: Array<{ id: string; firstName: string; lastName: string; email: string }>;
  requests: Array<{ id: string; title: string }>;
}

/** Compact admin header search → /admin/search or instant hits. */
export function HeaderSearch() {
  const { t } = useI18n();
  const router = useRouter();
  const user = getStoredUser();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<QuickHit | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const allowed = user && STAFF.has(user.role);

  useEffect(() => {
    if (!allowed || q.trim().length < 1) {
      setHits(null);
      return;
    }
    const token = getToken();
    if (!token) return;
    const id = window.setTimeout(() => {
      apiFetch<QuickHit>(`/building/search?q=${encodeURIComponent(q.trim())}`, { token })
        .then(setHits)
        .catch(() => setHits(null));
    }, 220);
    return () => window.clearTimeout(id);
  }, [q, allowed]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  if (!allowed) return null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (!term) {
      router.push('/admin/search');
      return;
    }
    router.push(`/admin/search?q=${encodeURIComponent(term)}`);
    setOpen(false);
  }

  const hasHits =
    hits &&
    (hits.apartments.length > 0 || hits.users.length > 0 || hits.requests.length > 0);

  return (
    <div ref={boxRef} className="header-search" style={{ position: 'relative' }}>
      <form onSubmit={onSubmit}>
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={t('headerSearchPh')}
          aria-label={t('search')}
          className="header-search-input"
          style={{
            width: 'min(200px, 28vw)',
            padding: '0.4rem 0.65rem',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            fontSize: '0.85rem',
          }}
        />
      </form>
      {open && hasHits && (
        <div
          className="card"
          style={{
            position: 'absolute',
            right: 0,
            top: '110%',
            width: 'min(320px, 90vw)',
            maxHeight: 320,
            overflow: 'auto',
            zIndex: 45,
            boxShadow: 'var(--shadow)',
            padding: '0.5rem',
          }}
        >
          {hits!.apartments.slice(0, 5).map((a) => (
            <Link
              key={a.id}
              href={`/admin/apartments/detail/?id=${encodeURIComponent(a.id)}`}
              onClick={() => setOpen(false)}
              style={{
                display: 'block',
                padding: '0.4rem 0.5rem',
                color: 'inherit',
                textDecoration: 'none',
                borderRadius: 6,
              }}
            >
              {t('aptPrefix')} {a.number}
            </Link>
          ))}
          {hits!.users.slice(0, 4).map((u) => (
            <div key={u.id} style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}>
              {u.lastName} {u.firstName}
              <span style={{ color: 'var(--muted)' }}> · {u.email}</span>
            </div>
          ))}
          {hits!.requests.slice(0, 3).map((r) => (
            <Link
              key={r.id}
              href="/admin/dispatch"
              onClick={() => setOpen(false)}
              style={{
                display: 'block',
                padding: '0.4rem 0.5rem',
                color: 'inherit',
                textDecoration: 'none',
                fontSize: '0.85rem',
              }}
            >
              🔔 {r.title}
            </Link>
          ))}
          <Link
            href={`/admin/search?q=${encodeURIComponent(q.trim())}`}
            onClick={() => setOpen(false)}
            style={{
              display: 'block',
              padding: '0.5rem',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            {t('headerSearchAll')} →
          </Link>
        </div>
      )}
    </div>
  );
}
