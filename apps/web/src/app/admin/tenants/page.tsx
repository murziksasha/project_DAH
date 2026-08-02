'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable } from '@/components/ui/DataTable';
import { apiFetch, getToken } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import { getSelectedTenantId, setSelectedTenantId } from '@/lib/building-context';
import { orgTypeLabel } from '@/lib/org-labels';

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  orgType?: 'osbb' | 'management_company';
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
    orgType: 'osbb' as 'osbb' | 'management_company',
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
          orgType: form.orgType,
          chairmanEmail: form.chairmanEmail || undefined,
          chairmanPassword: form.chairmanPassword || undefined,
        }),
      });
      setMessage(
        form.orgType === 'management_company'
          ? 'Управляючу компанію (УК) створено'
          : 'ОСББ створено',
      );
      setForm({
        name: '',
        slug: '',
        orgType: 'osbb',
        chairmanEmail: '',
        chairmanPassword: '',
      });
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

  async function setOrgType(t: TenantRow, orgType: 'osbb' | 'management_company') {
    const token = getToken();
    if (!token || t.orgType === orgType) return;
    try {
      await apiFetch(`/tenants/${t.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ orgType }),
      });
      setMessage(`Тип оновлено: ${orgTypeLabel(orgType)}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  const isUk = form.orgType === 'management_company';

  return (
    <main>
      <PageHeader
        title="Організації"
        description="ОСББ або управляючі компанії (УК) на одному інстансі «Мій дім». Multi-tenant + multi-building."
      />
      {error && <p className="error">{error}</p>}
      {message && <p className="success-banner">{message}</p>}

      <form
        onSubmit={createTenant}
        className="card"
        style={{ display: 'grid', gap: '0.75rem', marginBottom: '1rem' }}
      >
        <h2 style={{ fontSize: '1.05rem' }}>Нова організація</h2>
        <div>
          <label>Тип</label>
          <select
            value={form.orgType}
            onChange={(e) =>
              setForm({
                ...form,
                orgType: e.target.value as 'osbb' | 'management_company',
              })
            }
          >
            <option value="osbb">ОСББ</option>
            <option value="management_company">Управляюча компанія (УК)</option>
          </select>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.35rem' }}>
            {isUk
              ? 'УК: кілька об’єктів (будинків), роль «керівник» замість голови правління.'
              : 'ОСББ: самоуправління співвласників, правління, ревізійна комісія.'}
          </p>
        </div>
        <div>
          <label>Назва</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            placeholder={isUk ? 'ТОВ «Комфорт-Сервіс»' : 'ОСББ «Зелений двір»'}
          />
        </div>
        <div>
          <label>Slug (латиниця)</label>
          <input
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            placeholder={isUk ? 'uk-comfort' : 'osbb-pryklad'}
          />
        </div>
        <div>
          <label>{isUk ? 'Email керівника (опційно)' : 'Email голови (опційно)'}</label>
          <input
            type="email"
            value={form.chairmanEmail}
            onChange={(e) => setForm({ ...form, chairmanEmail: e.target.value })}
          />
        </div>
        <div>
          <label>{isUk ? 'Пароль керівника' : 'Пароль голови'}</label>
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
          <EmptyState
            title="Немає організацій"
            description="Створіть перше ОСББ або управляючу компанію."
          />
        ) : (
          <DataTable
            rows={rows}
            rowKey={(t) => t.id}
            columns={[
              { key: 'name', header: 'Назва', render: (t) => t.name },
              {
                key: 'orgType',
                header: 'Тип',
                render: (t) => (
                  <select
                    value={t.orgType ?? 'osbb'}
                    onChange={(e) =>
                      void setOrgType(
                        t,
                        e.target.value as 'osbb' | 'management_company',
                      )
                    }
                    aria-label={`Тип організації ${t.name}`}
                    style={{ maxWidth: '12rem' }}
                  >
                    <option value="osbb">ОСББ</option>
                    <option value="management_company">УК</option>
                  </select>
                ),
              },
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
            Активна організація: <code>{activeTenant}</code>{' '}
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => {
                setSelectedTenantId(null);
                setActiveTenant(null);
                setMessage('Контекст скинуто');
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
