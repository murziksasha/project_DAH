'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, getToken } from '@/lib/api';
import { meterTypeLabel } from '@/lib/i18n';

interface Meter {
  id: string;
  name: string;
  type: string;
  unit: string;
  isActive: boolean;
  readings: Array<{ period: string; value: string | number; consumption: string | number }>;
}

export default function ResidentMetersPage() {
  const { t, locale } = useI18n();
  const [meters, setMeters] = useState<Meter[]>([]);
  const [apartmentId, setApartmentId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ meterId: '', period: '', value: '' });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    let aptId = '';
    try {
      const raw = localStorage.getItem('dah_user');
      aptId = raw ? (JSON.parse(raw) as { apartmentId?: string }).apartmentId ?? '' : '';
    } catch {
      aptId = '';
    }
    if (!aptId) {
      setError(t('residentMetersNoApt'));
      setLoading(false);
      return;
    }
    setApartmentId(aptId);
    try {
      const list = await apiFetch<Meter[]>(`/meters/apartment/${aptId}`, { token });
      setMeters(list.filter((m) => m.isActive));
      if (list[0] && !form.meterId) {
        setForm((f) => ({ ...f, meterId: list[0].id, period: new Date().toISOString().slice(0, 7) }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setLoading(false);
    }
  }, [form.meterId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitReading(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token || !form.meterId) return;
    setError('');
    setMessage('');
    try {
      await apiFetch(`/meters/${form.meterId}/readings/self`, {
        method: 'POST',
        token,
        body: JSON.stringify({
          period: form.period || new Date().toISOString().slice(0, 7),
          value: Number(form.value),
        }),
      });
      setMessage(t('residentMetersAccepted'));
      setForm((f) => ({ ...f, value: '' }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    }
  }

  return (
    <main>
      <Link href="/resident" style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
        {t('residentBackCabinet')}
      </Link>
      <PageHeader
        title={t('residentMetersTitle')}
        description={apartmentId ? t('residentMetersDesc') : undefined}
      />
      {error && <p className="error">{error}</p>}
      {message && <p className="success-banner">{message}</p>}
      {loading && <p style={{ color: 'var(--muted)' }}>{t('loading')}</p>}

      {!loading && meters.length === 0 && (
        <EmptyState
          title={t('residentMetersEmpty')}
          description={t('residentMetersEmptyDesc')}
        />
      )}

      {meters.length > 0 && (
        <>
          <form
            onSubmit={submitReading}
            className="card"
            style={{ display: 'grid', gap: '0.75rem', marginBottom: '1rem' }}
          >
            <h2 style={{ fontSize: '1.05rem' }}>{t('residentMetersNew')}</h2>
            <div>
              <label>{t('metersMeter')}</label>
              <select
                value={form.meterId}
                onChange={(e) => setForm({ ...form, meterId: e.target.value })}
                required
              >
                {meters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({meterTypeLabel(m.type, locale)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>{t('metersPeriod')}</label>
              <input
                value={form.period}
                onChange={(e) => setForm({ ...form, period: e.target.value })}
                pattern="\d{4}-\d{2}"
                required
              />
            </div>
            <div>
              <label>{t('metersValue')}</label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                required
              />
            </div>
            <button type="submit">{t('residentMetersSend')}</button>
          </form>

          <section className="card">
            <h2 style={{ fontSize: '1.05rem', marginBottom: '0.75rem' }}>
              {t('residentMetersHistory')}
            </h2>
            <ul style={{ listStyle: 'none', display: 'grid', gap: '0.75rem' }}>
              {meters.map((m) => (
                <li key={m.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                  <strong>{m.name}</strong>{' '}
                  <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                    {meterTypeLabel(m.type, locale)} · {m.unit}
                  </span>
                  {m.readings[0] ? (
                    <div style={{ fontSize: '0.9rem', marginTop: 4 }}>
                      {m.readings[0].period}: {m.readings[0].value} ({t('residentMetersConsumption')}{' '}
                      {m.readings[0].consumption} {m.unit})
                    </div>
                  ) : (
                    <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                      {t('residentMetersNoReadings')}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
