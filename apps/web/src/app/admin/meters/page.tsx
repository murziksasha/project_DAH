'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable } from '@/components/ui/DataTable';
import { useI18n } from '@/components/LocaleProvider';
import { formatApartmentOption } from '@/lib/apartment-label';
import { apiFetch, getToken } from '@/lib/api';
import { withBuildingBody } from '@/lib/building-context';
import { meterDefaultName, meterTypeLabel } from '@/lib/i18n';
import { useApartmentsQuery } from '@/lib/queries';

interface MeterRow {
  id: string;
  name: string;
  type: string;
  unit: string;
  serialNumber: string | null;
  isActive: boolean;
  apartment: { id: string; number: string; entrance: number };
  readings: Array<{ period: string; value: string | number; consumption: string | number }>;
}

const METER_TYPES = ['cold_water', 'hot_water', 'heating', 'electricity', 'other'] as const;

export default function MetersPage() {
  const { t, locale } = useI18n();
  const [meters, setMeters] = useState<MeterRow[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    apartmentId: '',
    type: 'cold_water',
    name: '',
    serialNumber: '',
  });
  const [reading, setReading] = useState({ meterId: '', period: '', value: '' });
  const apartmentsQuery = useApartmentsQuery(Boolean(getToken()));

  // Default name follows locale + type when user hasn't customized
  useEffect(() => {
    setForm((f) => {
      const defaults = METER_TYPES.map((ty) => meterDefaultName(ty, locale));
      if (!f.name || defaults.includes(f.name)) {
        return { ...f, name: meterDefaultName(f.type, locale) };
      }
      return f;
    });
  }, [locale]);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    try {
      setMeters(await apiFetch<MeterRow[]>('/meters', { token }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const apts = apartmentsQuery.data ?? [];
    if (apts[0] && !form.apartmentId) {
      setForm((f) => ({ ...f, apartmentId: apts[0].id }));
    }
  }, [apartmentsQuery.data, form.apartmentId]);

  async function createMeter(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setError('');
    try {
      await apiFetch('/meters', {
        method: 'POST',
        token,
        body: JSON.stringify(
          withBuildingBody({
            apartmentId: form.apartmentId,
            type: form.type,
            name: form.name,
            serialNumber: form.serialNumber || undefined,
          }),
        ),
      });
      setMessage(t('metersAdded'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    }
  }

  async function addReading(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token || !reading.meterId) return;
    setError('');
    try {
      await apiFetch(`/meters/${reading.meterId}/readings`, {
        method: 'POST',
        token,
        body: JSON.stringify({
          period: reading.period || new Date().toISOString().slice(0, 7),
          value: Number(reading.value),
        }),
      });
      setMessage(t('metersReadingSaved'));
      setReading({ meterId: '', period: '', value: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    }
  }

  const apartments = apartmentsQuery.data ?? [];
  const aptPrefix = t('aptPrefix');

  return (
    <main>
      <PageHeader title={t('metersTitle')} description={t('metersDesc')} />
      {error && <p className="error">{error}</p>}
      {message && <p className="success-banner">{message}</p>}

      <form
        onSubmit={createMeter}
        className="card"
        style={{ display: 'grid', gap: '0.75rem', marginBottom: '1rem' }}
      >
        <h2 style={{ fontSize: '1.05rem' }}>{t('metersNew')}</h2>
        <div>
          <label>{t('apartment')}</label>
          <select
            value={form.apartmentId}
            onChange={(e) => setForm({ ...form, apartmentId: e.target.value })}
            required
          >
            {apartments.map((a) => (
              <option key={a.id} value={a.id}>
                {formatApartmentOption(a, aptPrefix)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>{t('type')}</label>
          <select
            value={form.type}
            onChange={(e) => {
              const type = e.target.value;
              const defaults = METER_TYPES.map((ty) => meterDefaultName(ty, locale));
              setForm((f) => ({
                ...f,
                type,
                name: !f.name || defaults.includes(f.name) ? meterDefaultName(type, locale) : f.name,
              }));
            }}
          >
            {METER_TYPES.map((k) => (
              <option key={k} value={k}>
                {meterTypeLabel(k, locale)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>{t('name')}</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div>
          <label>{t('metersSerial')}</label>
          <input
            value={form.serialNumber}
            onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
          />
        </div>
        <button type="submit">{t('metersAdd')}</button>
      </form>

      <form
        onSubmit={addReading}
        className="card"
        style={{ display: 'grid', gap: '0.75rem', marginBottom: '1rem' }}
      >
        <h2 style={{ fontSize: '1.05rem' }}>{t('metersReadingTitle')}</h2>
        <div>
          <label>{t('metersMeter')}</label>
          <select
            value={reading.meterId}
            onChange={(e) => setReading({ ...reading, meterId: e.target.value })}
            required
          >
            <option value="">{t('select')}</option>
            {meters
              .filter((m) => m.isActive)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {aptPrefix} {m.apartment.number} · {m.name}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label>{t('metersPeriod')}</label>
          <input
            value={reading.period}
            onChange={(e) => setReading({ ...reading, period: e.target.value })}
            placeholder={new Date().toISOString().slice(0, 7)}
            pattern="\d{4}-\d{2}"
          />
        </div>
        <div>
          <label>{t('metersValue')}</label>
          <input
            type="number"
            step="0.001"
            min="0"
            value={reading.value}
            onChange={(e) => setReading({ ...reading, value: e.target.value })}
            required
          />
        </div>
        <button type="submit">{t('metersSaveReading')}</button>
      </form>

      <section className="card">
        {meters.length === 0 ? (
          <EmptyState title={t('metersEmpty')} description={t('metersEmptyDesc')} />
        ) : (
          <DataTable
            rows={meters}
            rowKey={(m) => m.id}
            columns={[
              {
                key: 'apt',
                header: t('metersColApt'),
                render: (m) => m.apartment.number,
              },
              {
                key: 'name',
                header: t('name'),
                render: (m) => (
                  <>
                    {m.name}{' '}
                    <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                      ({meterTypeLabel(m.type, locale)})
                    </span>
                  </>
                ),
              },
              {
                key: 'last',
                header: t('metersLast'),
                render: (m) =>
                  m.readings[0]
                    ? `${m.readings[0].period}: ${m.readings[0].value} (${m.readings[0].consumption} ${m.unit})`
                    : '—',
              },
              {
                key: 'status',
                header: t('status'),
                render: (m) => (m.isActive ? t('active') : t('inactive')),
              },
            ]}
          />
        )}
      </section>
    </main>
  );
}
