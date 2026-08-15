'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, getToken } from '@/lib/api';
import { getSelectedBuildingId } from '@/lib/building-context';

type PeriodStatus = 'open' | 'soft_closed' | 'locked';

interface PeriodRow {
  id: string;
  period: string;
  status: PeriodStatus;
  notes?: string | null;
  closedAt?: string | null;
}

interface BuildingRow {
  id: string;
  name: string;
}

const STATUS_LABEL: Record<PeriodStatus, string> = {
  open: 'Відкритий',
  soft_closed: 'Мʼяко закритий (лише платежі)',
  locked: 'Заблокований',
};

export default function AccountingPeriodsPage() {
  const [buildingId, setBuildingId] = useState('');
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [status, setStatus] = useState<PeriodStatus>('soft_closed');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [checklist, setChecklist] = useState<{
    canSoftClose: boolean;
    canLock: boolean;
    checks: Array<{ id: string; ok: boolean; label: string; detail: number }>;
  } | null>(null);

  const load = useCallback(async (bid: string, periodKey?: string) => {
    const token = getToken();
    if (!token || !bid) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<PeriodRow[]>(
        `/finance/periods?buildingId=${encodeURIComponent(bid)}`,
        { token },
      );
      setPeriods(Array.isArray(data) ? data : []);
      const p = periodKey ?? period;
      if (p) {
        const cl = await apiFetch<{
          canSoftClose: boolean;
          canLock: boolean;
          checks: Array<{ id: string; ok: boolean; label: string; detail: number }>;
        }>(
          `/finance/periods/checklist?buildingId=${encodeURIComponent(bid)}&period=${encodeURIComponent(p)}`,
          { token },
        );
        setChecklist(cl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не вдалося завантажити періоди');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    void (async () => {
      try {
        const list = await apiFetch<BuildingRow[]>('/building', { token });
        const rows = Array.isArray(list) ? list : [];
        setBuildings(rows);
        const stored = getSelectedBuildingId();
        const bid =
          stored && rows.some((b) => b.id === stored) ? stored : rows[0]?.id ?? '';
        if (bid) {
          setBuildingId(bid);
          await load(bid);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не вдалося завантажити будинки');
      }
    })();
  }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token || !buildingId) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await apiFetch('/finance/periods', {
        method: 'PATCH',
        token,
        body: JSON.stringify({ buildingId, period, status, notes: notes || undefined }),
      });
      setMessage(`Період ${period} → ${STATUS_LABEL[status]}`);
      await load(buildingId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка збереження');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Облікові періоди"
        description="Відкритий → мʼяке закриття (лише платежі) → повне блокування. Locked лише голова."
      />

      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      {checklist && (
        <section className="card" style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.05rem', marginTop: 0 }}>Чекліст закриття місяця</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
            {checklist.checks.map((c) => (
              <li key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>
                  {c.ok ? '✓' : '✗'} {c.label}
                </span>
                <strong>{c.detail}</strong>
              </li>
            ))}
          </ul>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: 0 }}>
            soft_close: {checklist.canSoftClose ? 'дозволено' : 'є блокуючі пункти'} · lock:{' '}
            {checklist.canLock ? 'дозволено' : 'є блокуючі пункти'}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-sm"
              disabled={!buildingId || !period || loading}
              onClick={async () => {
                const token = getToken();
                if (!token || !buildingId) return;
                setLoading(true);
                setError('');
                setMessage('');
                try {
                  await apiFetch('/accounting/periods/close-snapshot', {
                    method: 'POST',
                    token,
                    body: JSON.stringify({ buildingId, period }),
                  });
                  setMessage(`Знімок закриття ${period} збережено`);
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Помилка snapshot');
                } finally {
                  setLoading(false);
                }
              }}
            >
              Зберегти close pack (snapshot)
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={!buildingId || loading}
              onClick={async () => {
                const token = getToken();
                if (!token || !buildingId) return;
                const year = Number(period.slice(0, 4));
                if (!window.confirm(`Year-end soft_close для ${year}?`)) return;
                setLoading(true);
                setError('');
                setMessage('');
                try {
                  const res = await apiFetch<{
                    yearEndSnapshotId: string;
                    months: Array<{ period: string; statusAction: string | null }>;
                  }>('/accounting/year-end', {
                    method: 'POST',
                    token,
                    body: JSON.stringify({ buildingId, year }),
                  });
                  const closed = res.months.filter((m) => m.statusAction).length;
                  setMessage(
                    `Year-end ${year}: soft_closed ${closed} міс., snapshot ${res.yearEndSnapshotId.slice(-8)}`,
                  );
                  await load(buildingId);
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Year-end error');
                } finally {
                  setLoading(false);
                }
              }}
            >
              Year-end ({period.slice(0, 4)})
            </button>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: 8 }}>
            Reopen locked/soft_closed → потрібен reason у полі «Нотатка».
          </p>
        </section>
      )}

      <section className="card" style={{ marginBottom: '1rem' }}>
        <form onSubmit={onSubmit} className="form-grid">
          <label>
            Будинок
            <select
              value={buildingId}
              onChange={(e) => {
                setBuildingId(e.target.value);
                void load(e.target.value);
              }}
              required
            >
              <option value="">—</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Період (YYYY-MM)
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              required
            />
          </label>
          <label>
            Статус
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as PeriodStatus)}
            >
              <option value="open">Відкритий</option>
              <option value="soft_closed">Мʼяко закритий</option>
              <option value="locked">Заблокований</option>
            </select>
          </label>
          <label>
            Нотатка
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Опційно" />
          </label>
          <button type="submit" disabled={loading || !buildingId}>
            {loading ? '…' : 'Зберегти статус'}
          </button>
        </form>
      </section>

      <section className="card">
        <h2 style={{ fontSize: '1.1rem' }}>Історія періодів</h2>
        {loading && !periods.length ? (
          <p>Завантаження…</p>
        ) : periods.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Ще немає записів — періоди створюються при зміні статусу.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Період</th>
                  <th>Статус</th>
                  <th>Закрито</th>
                  <th>Нотатка</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.id}>
                    <td>{p.period}</td>
                    <td>
                      <span
                        className={`badge badge-${
                          p.status === 'open'
                            ? 'success'
                            : p.status === 'soft_closed'
                              ? 'warning'
                              : 'danger'
                        }`}
                      >
                        {STATUS_LABEL[p.status] ?? p.status}
                      </span>
                    </td>
                    <td>{p.closedAt ? new Date(p.closedAt).toLocaleString('uk-UA') : '—'}</td>
                    <td>{p.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
