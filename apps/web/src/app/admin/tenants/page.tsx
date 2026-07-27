'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable } from '@/components/ui/DataTable';
import { apiFetch, getToken } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import { getSelectedTenantId, setSelectedTenantId } from '@/lib/building-context';

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  _count?: { buildings: number; users: number };
}

export default function TenantsPage() {
  const [rows, setRows] = useState<TenantRow[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [activeTenant, setActiveTenant] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    slug: '',
    chairmanEmail: '',
    chairmanPassword: '',
  });

  const load = useCallback(async () => {
    const token = getToken();
    const user = getStoredUser();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    if (user?.role !== 'super_admin') {
      window.location.href = '/admin';
      return;
    }
    try {
      setRows(await apiFetch<TenantRow[]>('/tenants', { token }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }, []);

  useEffect(() => {
    void load();
    setActiveTenant(getSelectedTenantId());
  }, [load]);

  async function createTenant(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setError('');
    try {
      await apiFetch('/tenants', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: form.name,
          slug: form.slug || form.name.toLowerCase().replace(/\s+/g, '-'),
          chairmanEmail: form.chairmanEmail || undefined,
          chairmanPassword: form.chairmanPassword || undefined,
        }),
      });
      setMessage('ОСББ (tenant) створено');
      setForm({ name: '', slug: '', chairmanEmail: '', chairmanPassword: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  async function toggleActive(t: TenantRow) {
    const token = getToken();
    if (!token) return;
    try {
      await apiFetch(`/tenants/${t.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ isActive: !t.isActive }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  return (
    <main>
      <PageHeader
        title="ОСББ (tenants)"
        description="Multi-tenant: кілька юридичних осіб на одному інстансі DAH"
      />
      {error && <p className="error">{error}</p>}
      {message && <p className="success-banner">{message}</p>}

      <form
        onSubmit={createTenant}
        className="card"
        style={{ display: 'grid', gap: '0.75rem', marginBottom: '1rem' }}
      >
        <h2 style={{ fontSize: '1.05rem' }}>Нове ОСББ</h2>
        <div>
          <label>Назва</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div>
          <label>Slug (латиниця)</label>
          <input
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            placeholder="osbb-pryklad"
          />
        </div>
        <div>
          <label>Email голови (опційно)</label>
          <input
            type="email"
            value={form.chairmanEmail}
            onChange={(e) => setForm({ ...form, chairmanEmail: e.target.value })}
          />
        </div>
        <div>
          <label>Пароль голови</label>
          <input
            type="password"
            value={form.chairmanPassword}
            onChange={(e) => setForm({ ...form, chairmanPassword: e.target.value })}
            minLength={8}
          />
        </div>
        <button type="submit">Створити</button>
      </form>

      <section className="card">
        {rows.length === 0 ? (
          <EmptyState title="Немає tenants" description="Створіть перше ОСББ." />
        ) : (
          <DataTable
            rows={rows}
            rowKey={(t) => t.id}
            columns={[
              { key: 'name', header: 'Назва', render: (t) => t.name },
              { key: 'slug', header: 'Slug', render: (t) => t.slug },
              {
                key: 'counts',
                header: 'Будинки / юзери',
                render: (t) => `${t._count?.buildings ?? 0} / ${t._count?.users ?? 0}`,
              },
              {
                key: 'status',
                header: 'Статус',
                render: (t) => (t.isActive ? 'активний' : 'вимкн.'),
              },
              {
                key: 'ctx',
                header: 'Контекст',
                render: (t) => (
                  <button
                    type="button"
                    className={`btn btn-sm${activeTenant === t.id ? '' : ' btn-ghost'}`}
                    onClick={() => {
                      setSelectedTenantId(t.id);
                      setActiveTenant(t.id);
                      setMessage(`Контекст super-admin: ${t.name} (X-Tenant-Id)`);
                    }}
                  >
                    {activeTenant === t.id ? 'Обрано' : 'Обрати'}
                  </button>
                ),
              },
              {
                key: 'act',
                header: '',
                render: (t) => (
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => void toggleActive(t)}
                  >
                    {t.isActive ? 'Вимкнути' : 'Увімкнути'}
                  </button>
                ),
              },
            ]}
          />
        )}
        {activeTenant && (
          <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
            Активний tenant: <code>{activeTenant}</code>{' '}
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => {
                setSelectedTenantId(null);
                setActiveTenant(null);
                setMessage('Контекст скинуто (усі tenants)');
              }}
            >
              Скинути
            </button>
          </p>
        )}
      </section>
    </main>
  );
}
