'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { apiFetch, getToken } from '@/lib/api';
import { getSelectedBuildingId } from '@/lib/building-context';
import { formatMoney } from '@/lib/money';

interface Fund {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
}

interface BudgetLine {
  id: string;
  year: number;
  month: number | null;
  plannedAmount: string | number;
  notes?: string | null;
  fund?: { id: string; name: string } | null;
  category?: { id: string; name: string } | null;
}

interface PlanFact {
  plannedTotal: number;
  actualTotal: number;
  variance: number;
  variancePercent: number | null;
  byFund: Array<{
    fundId: string | null;
    fundName: string;
    planned: number;
    actual: number;
    variance: number;
  }>;
  byCategory: Array<{
    categoryId: string | null;
    categoryName: string;
    planned: number;
    actual: number;
    variance: number;
  }>;
  lines: BudgetLine[];
}

interface EncumbranceLine {
  id: string;
  plannedAmount: number;
  actual: number;
  encumbrance: number;
  committed: number;
  variance: number;
  usagePct: number;
  alert: 'over' | 'warn' | null;
  fund?: { id: string; name: string } | null;
  category?: { id: string; name: string } | null;
  month?: number | null;
}

export default function BudgetPage() {
  const [buildingId, setBuildingId] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [report, setReport] = useState<PlanFact | null>(null);
  const [encLines, setEncLines] = useState<EncumbranceLine[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [fundId, setFundId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [planned, setPlanned] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (bid: string, y: number) => {
    const token = getToken();
    if (!token || !bid) return;
    setLoading(true);
    setError('');
    try {
      const [pf, f, c, enc] = await Promise.all([
        apiFetch<PlanFact>(
          `/finance/budget/plan-fact?buildingId=${encodeURIComponent(bid)}&year=${y}`,
          { token },
        ),
        apiFetch<Fund[]>('/finance/funds', { token }),
        apiFetch<Category[]>('/finance/categories', { token }),
        apiFetch<{ lines: EncumbranceLine[] }>(
          `/accounting/budget/plan-fact-encumbrance?buildingId=${encodeURIComponent(bid)}&year=${y}`,
          { token },
        ).catch(() => ({ lines: [] as EncumbranceLine[] })),
      ]);
      setReport(pf);
      setEncLines(Array.isArray(enc?.lines) ? enc.lines : []);
      setFunds(Array.isArray(f) ? f : []);
      setCategories(Array.isArray(c) ? c : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      window.location.href = '/login';
      return;
    }
    void (async () => {
      const token = getToken()!;
      try {
        const list = await apiFetch<Array<{ id: string; name: string }>>('/building', {
          token,
        });
        const rows = Array.isArray(list) ? list : [];
        const stored = getSelectedBuildingId();
        const bid =
          stored && rows.some((b) => b.id === stored) ? stored : rows[0]?.id ?? '';
        if (bid) {
          setBuildingId(bid);
          await load(bid, year);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Помилка');
      }
    })();
  }, [load, year]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token || !buildingId) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await apiFetch('/finance/budget', {
        method: 'POST',
        token,
        body: JSON.stringify({
          buildingId,
          year,
          fundId: fundId || undefined,
          categoryId: categoryId || undefined,
          plannedAmount: Number(planned.replace(',', '.')),
          notes: notes || undefined,
        }),
      });
      setMessage('Рядок бюджету додано');
      setPlanned('');
      setNotes('');
      await load(buildingId, year);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setLoading(false);
    }
  }

  async function onDelete(id: string) {
    const token = getToken();
    if (!token || !window.confirm('Видалити рядок бюджету?')) return;
    try {
      await apiFetch(`/finance/budget/${id}`, { method: 'DELETE', token });
      await load(buildingId, year);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Бюджет (план / факт)"
        description="Річний план витрат vs фактичні витрати по фондах і категоріях"
      />
      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      <div className="card" style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <label>
          Рік
          <input
            type="number"
            value={year}
            onChange={(e) => {
              const y = Number(e.target.value) || new Date().getFullYear();
              setYear(y);
              if (buildingId) void load(buildingId, y);
            }}
            style={{ width: 100, marginLeft: 8 }}
          />
        </label>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => buildingId && void load(buildingId, year)}
        >
          Оновити
        </button>
      </div>

      {report && (
        <div className="grid-2" style={{ marginBottom: '1rem' }}>
          <StatCard label="План" value={formatMoney(report.plannedTotal)} />
          <StatCard
            label="Факт (витрати)"
            value={formatMoney(report.actualTotal)}
            tone="danger"
          />
          <StatCard
            label="Відхилення (план−факт)"
            value={formatMoney(report.variance)}
            tone={report.variance >= 0 ? 'success' : 'danger'}
          />
          <StatCard
            label="% відхилення"
            value={
              report.variancePercent != null ? `${report.variancePercent}%` : '—'
            }
          />
        </div>
      )}

      {encLines.length > 0 && (
        <section className="card" style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.1rem' }}>План / факт + encumbrance (AP)</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Фонд</th>
                <th>Категорія</th>
                <th>План</th>
                <th>Факт</th>
                <th>Зобовʼязання</th>
                <th>Committed</th>
                <th>%</th>
                <th>Alert</th>
              </tr>
            </thead>
            <tbody>
              {encLines.map((l) => (
                <tr key={l.id}>
                  <td>{l.fund?.name ?? '—'}</td>
                  <td>{l.category?.name ?? '—'}</td>
                  <td className="num">{formatMoney(l.plannedAmount)}</td>
                  <td className="num">{formatMoney(l.actual)}</td>
                  <td className="num">{formatMoney(l.encumbrance)}</td>
                  <td className="num">{formatMoney(l.committed)}</td>
                  <td className="num">{l.usagePct}%</td>
                  <td>
                    {l.alert === 'over'
                      ? '⚠️ over'
                      : l.alert === 'warn'
                        ? '⚡ 80%+'
                        : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.1rem' }}>Новий рядок плану</h2>
        <form onSubmit={onCreate} className="form-grid">
          <label>
            Фонд
            <select value={fundId} onChange={(e) => setFundId(e.target.value)}>
              <option value="">—</option>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Категорія
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            План, ₴
            <input
              required
              inputMode="decimal"
              value={planned}
              onChange={(e) => setPlanned(e.target.value)}
            />
          </label>
          <label>
            Нотатка
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <button type="submit" disabled={loading || !buildingId}>
            Додати
          </button>
        </form>
      </section>

      {report && (
        <>
          <section className="card" style={{ marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.1rem' }}>По фондах</h2>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Фонд</th>
                    <th>План</th>
                    <th>Факт</th>
                    <th>Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byFund.map((r) => (
                    <tr key={r.fundId ?? r.fundName}>
                      <td>{r.fundName}</td>
                      <td>{formatMoney(r.planned)}</td>
                      <td>{formatMoney(r.actual)}</td>
                      <td>{formatMoney(r.variance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card" style={{ marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.1rem' }}>По категоріях</h2>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Категорія</th>
                    <th>План</th>
                    <th>Факт</th>
                    <th>Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byCategory.map((r) => (
                    <tr key={r.categoryId ?? r.categoryName}>
                      <td>{r.categoryName}</td>
                      <td>{formatMoney(r.planned)}</td>
                      <td>{formatMoney(r.actual)}</td>
                      <td>{formatMoney(r.variance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h2 style={{ fontSize: '1.1rem' }}>Рядки плану</h2>
            {!report.lines.length ? (
              <p style={{ color: 'var(--muted)' }}>Ще немає рядків бюджету</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                {report.lines.map((l) => (
                  <li
                    key={l.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      flexWrap: 'wrap',
                      borderBottom: '1px solid var(--border)',
                      paddingBottom: 6,
                    }}
                  >
                    <span>
                      {l.fund?.name ?? '—'} · {l.category?.name ?? '—'} ·{' '}
                      <strong>{formatMoney(Number(l.plannedAmount))}</strong>
                      {l.notes ? ` · ${l.notes}` : ''}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => void onDelete(l.id)}
                    >
                      Видалити
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
