'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable } from '@/components/ui/DataTable';
import { apiFetch, getToken } from '@/lib/api';
import { withBuildingBody } from '@/lib/building-context';
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

const TYPE_LABELS: Record<string, string> = {
  cold_water: 'Хол. вода',
  hot_water: 'Гар. вода',
  heating: 'Опалення',
  electricity: 'Електро',
  other: 'Інше',
};

export default function MetersPage() {
  const [meters, setMeters] = useState<MeterRow[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    apartmentId: '',
    type: 'cold_water',
    name: 'Холодна вода',
    serialNumber: '',
  });
  const [reading, setReading] = useState({ meterId: '', period: '', value: '' });
  const apartmentsQuery = useApartmentsQuery(Boolean(getToken()));

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    try {
      setMeters(await apiFetch<MeterRow[]>('/meters', { token }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }, []);

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
      setMessage('Лічильник додано');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
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
      setMessage('Показник збережено');
      setReading({ meterId: '', period: '', value: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  const apartments = apartmentsQuery.data ?? [];

  return (
    <main>
      <PageHeader
        title="Лічильники"
        description="Показники для нарахування by_meter (вода, тепло, електро)"
      />
      {error && <p className="error">{error}</p>}
      {message && <p className="success-banner">{message}</p>}

      <form
        onSubmit={createMeter}
        className="card"
        style={{ display: 'grid', gap: '0.75rem', marginBottom: '1rem' }}
      >
        <h2 style={{ fontSize: '1.05rem' }}>Новий лічильник</h2>
        <div>
          <label>Квартира</label>
          <select
            value={form.apartmentId}
            onChange={(e) => setForm({ ...form, apartmentId: e.target.value })}
            required
          >
            {apartments.map((a) => (
              <option key={a.id} value={a.id}>
                кв. {a.number}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Тип</label>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Назва</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div>
          <label>Заводський №</label>
          <input
            value={form.serialNumber}
            onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
          />
        </div>
        <button type="submit">Додати</button>
      </form>

      <form
        onSubmit={addReading}
        className="card"
        style={{ display: 'grid', gap: '0.75rem', marginBottom: '1rem' }}
      >
        <h2 style={{ fontSize: '1.05rem' }}>Внести показник</h2>
        <div>
          <label>Лічильник</label>
          <select
            value={reading.meterId}
            onChange={(e) => setReading({ ...reading, meterId: e.target.value })}
            required
          >
            <option value="">— оберіть —</option>
            {meters
              .filter((m) => m.isActive)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  кв. {m.apartment.number} · {m.name}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label>Період (YYYY-MM)</label>
          <input
            value={reading.period}
            onChange={(e) => setReading({ ...reading, period: e.target.value })}
            placeholder={new Date().toISOString().slice(0, 7)}
            pattern="\d{4}-\d{2}"
          />
        </div>
        <div>
          <label>Показник</label>
          <input
            type="number"
            step="0.001"
            min="0"
            value={reading.value}
            onChange={(e) => setReading({ ...reading, value: e.target.value })}
            required
          />
        </div>
        <button type="submit">Зберегти показник</button>
      </form>

      <section className="card">
        {meters.length === 0 ? (
          <EmptyState title="Немає лічильників" description="Додайте перший для by_meter нарахувань." />
        ) : (
          <DataTable
            rows={meters}
            rowKey={(m) => m.id}
            columns={[
              {
                key: 'apt',
                header: 'Кв.',
                render: (m) => m.apartment.number,
              },
              {
                key: 'name',
                header: 'Назва',
                render: (m) => (
                  <>
                    {m.name}{' '}
                    <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                      ({TYPE_LABELS[m.type] ?? m.type})
                    </span>
                  </>
                ),
              },
              {
                key: 'last',
                header: 'Останній',
                render: (m) =>
                  m.readings[0]
                    ? `${m.readings[0].period}: ${m.readings[0].value} (${m.readings[0].consumption} ${m.unit})`
                    : '—',
              },
              {
                key: 'status',
                header: 'Статус',
                render: (m) => (m.isActive ? 'активний' : 'вимкн.'),
              },
            ]}
          />
        )}
      </section>
    </main>
  );
}
