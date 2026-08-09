'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
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
  orgType?: 'osbb' | 'management_company';
  isActive: boolean;
  _count?: { buildings: number; users: number };
}

export default function TenantsPage() {
  const { t } = useI18n();
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
      setError(err instanceof Error ? err.message : t('error'));
    }
  }, [t]);

  useEffect(() => {
    void load();
    setActiveTenant(getSelectedTenantId());
  }, [load]);

  function typeLabel(orgType?: 'osbb' | 'management_company') {
    return orgType === 'management_company' ? t('orgTypeUk') : t('orgTypeOsbb');
  }

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
          ? t('tenantsCreatedUk')
          : t('tenantsCreatedOsbb'),
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
      setError(err instanceof Error ? err.message : t('error'));
    }
  }

  async function toggleActive(tenant: TenantRow) {
    const token = getToken();
    if (!token) return;
    try {
      await apiFetch(`/tenants/${tenant.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ isActive: !tenant.isActive }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    }
  }

  async function setOrgType(tenant: TenantRow, orgType: 'osbb' | 'management_company') {
    const token = getToken();
    if (!token || tenant.orgType === orgType) return;
    try {
      await apiFetch(`/tenants/${tenant.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ orgType }),
      });
      setMessage(t('tenantsTypeUpdated', { type: typeLabel(orgType) }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    }
  }

  const isUk = form.orgType === 'management_company';

  return (
    <main>
      <PageHeader
        title={t('tenantsTitle')}
        description={t('tenantsDesc')}
      />
      <p className="muted" style={{ marginTop: '-0.5rem', marginBottom: '1rem', maxWidth: '52rem' }}>
        {t('tenantsDisableHint')}
      </p>
      {error && <p className="error">{error}</p>}
      {message && <p className="success-banner">{message}</p>}

      <form
        onSubmit={createTenant}
        className="card"
        style={{ display: 'grid', gap: '0.75rem', marginBottom: '1rem' }}
      >
        <h2 style={{ fontSize: '1.05rem' }}>{t('tenantsNew')}</h2>
        <div>
          <label>{t('type')}</label>
          <select
            value={form.orgType}
            onChange={(e) =>
              setForm({
                ...form,
                orgType: e.target.value as 'osbb' | 'management_company',
              })
            }
          >
            <option value="osbb">{t('orgTypeOsbb')}</option>
            <option value="management_company">{t('orgTypeUk')}</option>
          </select>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.35rem' }}>
            {isUk ? t('tenantsUkHint') : t('tenantsOsbbHint')}
          </p>
        </div>
        <div>
          <label>{t('name')}</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            placeholder={isUk ? t('tenantsNamePhUk') : t('tenantsNamePhOsbb')}
          />
        </div>
        <div>
          <label>{t('tenantsSlug')}</label>
          <input
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            placeholder={isUk ? t('tenantsSlugPhUk') : t('tenantsSlugPhOsbb')}
          />
        </div>
        <div>
          <label>{isUk ? t('tenantsManagerEmail') : t('tenantsChairmanEmail')}</label>
          <input
            type="email"
            value={form.chairmanEmail}
            onChange={(e) => setForm({ ...form, chairmanEmail: e.target.value })}
          />
        </div>
        <div>
          <label>{isUk ? t('tenantsManagerPassword') : t('tenantsChairmanPassword')}</label>
          <input
            type="password"
            value={form.chairmanPassword}
            onChange={(e) => setForm({ ...form, chairmanPassword: e.target.value })}
            minLength={8}
          />
        </div>
        <button type="submit">{t('create')}</button>
      </form>

      <section className="card">
        {rows.length === 0 ? (
          <EmptyState
            title={t('tenantsEmpty')}
            description={t('tenantsEmptyDesc')}
          />
        ) : (
          <DataTable
            rows={rows}
            rowKey={(tenant) => tenant.id}
            columns={[
              { key: 'name', header: t('name'), render: (tenant) => tenant.name },
              {
                key: 'orgType',
                header: t('type'),
                render: (tenant) => (
                  <select
                    value={tenant.orgType ?? 'osbb'}
                    onChange={(e) =>
                      void setOrgType(
                        tenant,
                        e.target.value as 'osbb' | 'management_company',
                      )
                    }
                    aria-label={t('tenantsOrgTypeAria', { name: tenant.name })}
                    style={{ maxWidth: '12rem' }}
                  >
                    <option value="osbb">{t('orgTypeOsbb')}</option>
                    <option value="management_company">{t('orgTypeUkShort')}</option>
                  </select>
                ),
              },
              { key: 'slug', header: 'Slug', render: (tenant) => tenant.slug },
              {
                key: 'counts',
                header: t('tenantsBuildingsUsers'),
                render: (tenant) => `${tenant._count?.buildings ?? 0} / ${tenant._count?.users ?? 0}`,
              },
              {
                key: 'status',
                header: t('status'),
                render: (tenant) => (tenant.isActive ? t('active') : t('inactive')),
              },
              {
                key: 'ctx',
                header: t('tenantsContext'),
                render: (tenant) => (
                  <button
                    type="button"
                    className={`btn btn-sm${activeTenant === tenant.id ? '' : ' btn-ghost'}`}
                    onClick={() => {
                      setSelectedTenantId(tenant.id);
                      setActiveTenant(tenant.id);
                      setMessage(t('tenantsContextSet', { name: tenant.name }));
                    }}
                  >
                    {activeTenant === tenant.id ? t('tenantsSelected') : t('tenantsSelect')}
                  </button>
                ),
              },
              {
                key: 'act',
                header: '',
                render: (tenant) => (
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => void toggleActive(tenant)}
                  >
                    {tenant.isActive ? t('tenantsDisable') : t('tenantsEnable')}
                  </button>
                ),
              },
            ]}
          />
        )}
        {activeTenant && (
          <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
            {t('tenantsActiveOrg')} <code>{activeTenant}</code>{' '}
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => {
                setSelectedTenantId(null);
                setActiveTenant(null);
                setMessage(t('tenantsContextCleared'));
              }}
            >
              {t('tenantsReset')}
            </button>
          </p>
        )}
      </section>
    </main>
  );
}
