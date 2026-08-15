'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, getToken } from '@/lib/api';
import { getSelectedBuildingId } from '@/lib/building-context';

interface AgingApt {
  apartmentId: string;
  number: string;
  advance: number;
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  total: number;
}

interface WriteOff {
  id: string;
  amount: string | number;
  reason: string;
  status: string;
  apartment: { id: string; number: string };
}

interface Tariff {
  id: string;
  name: string;
  rate?: string | number | null;
  fixedAmount?: string | number | null;
  distribution: string;
  isActive: boolean;
  fund: { id: string; name: string };
}

function money(n: number | string) {
  const v = typeof n === 'string' ? Number(n) : n;
  return v.toLocaleString('uk-UA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function ArDeepPage() {
  const [buildingId, setBuildingId] = useState('');
  const [aging, setAging] = useState<{
    totalDebt: number;
    buckets: Record<string, number>;
    apartments: AgingApt[];
  } | null>(null);
  const [writeOffs, setWriteOffs] = useState<WriteOff[]>([]);
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [funds, setFunds] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [woForm, setWoForm] = useState({
    apartmentId: '',
    amount: '',
    reason: '',
  });
  const [tariffForm, setTariffForm] = useState({
    fundId: '',
    name: '',
    rate: '',
    fixedAmount: '',
    distribution: 'by_area',
    effectiveFrom: new Date().toISOString().slice(0, 10),
  });
  const [runPeriod, setRunPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [statementApt, setStatementApt] = useState('');
  const [statement, setStatement] = useState<{
    openDebt: number;
    netBalance: number;
    events: Array<{
      date: string;
      kind: string;
      description: string;
      debit: number;
      credit: number;
      balance: number;
    }>;
  } | null>(null);

  const load = useCallback(async (bid: string) => {
    const token = getToken();
    if (!token || !bid) return;
    try {
      const [ag, wo, tar, f] = await Promise.all([
        apiFetch<{
          totalDebt: number;
          buckets: Record<string, number>;
          apartments: AgingApt[];
        }>(`/accounting/ar-aging?buildingId=${encodeURIComponent(bid)}`, {
          token,
        }),
        apiFetch<WriteOff[]>(
          `/accounting/write-offs?buildingId=${encodeURIComponent(bid)}`,
          { token },
        ),
        apiFetch<Tariff[]>(
          `/accounting/tariffs?buildingId=${encodeURIComponent(bid)}`,
          { token },
        ),
        apiFetch<Array<{ id: string; name: string }>>(
          `/finance/funds?buildingId=${encodeURIComponent(bid)}`,
          { token },
        ),
      ]);
      setAging(ag);
      setWriteOffs(Array.isArray(wo) ? wo : []);
      setTariffs(Array.isArray(tar) ? tar : []);
      setFunds(Array.isArray(f) ? f : []);
      if (!tariffForm.fundId && f?.[0]) {
        setTariffForm((s) => ({ ...s, fundId: f[0].id }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }, [tariffForm.fundId]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    const bid = getSelectedBuildingId() || '';
    setBuildingId(bid);
    if (bid) void load(bid);
  }, [load]);

  async function createWriteOff(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    try {
      await apiFetch('/accounting/write-offs', {
        token,
        method: 'POST',
        body: JSON.stringify({
          apartmentId: woForm.apartmentId,
          amount: Number(woForm.amount),
          reason: woForm.reason,
        }),
      });
      setMessage('Списання створено (pending approve)');
      setWoForm({ apartmentId: '', amount: '', reason: '' });
      await load(buildingId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  async function approveWo(id: string) {
    const token = getToken();
    if (!token) return;
    try {
      await apiFetch(`/accounting/write-offs/${id}/approve`, {
        token,
        method: 'POST',
        body: '{}',
      });
      await load(buildingId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approve failed');
    }
  }

  async function createTariff(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token || !buildingId) return;
    try {
      await apiFetch('/accounting/tariffs', {
        token,
        method: 'POST',
        body: JSON.stringify({
          buildingId,
          fundId: tariffForm.fundId,
          name: tariffForm.name,
          distribution: tariffForm.distribution,
          rate: tariffForm.rate ? Number(tariffForm.rate) : undefined,
          fixedAmount: tariffForm.fixedAmount
            ? Number(tariffForm.fixedAmount)
            : undefined,
          effectiveFrom: tariffForm.effectiveFrom,
        }),
      });
      setMessage('Тариф створено');
      setTariffForm((s) => ({ ...s, name: '', rate: '', fixedAmount: '' }));
      await load(buildingId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка тарифу');
    }
  }

  async function loadStatement() {
    const token = getToken();
    if (!token || !statementApt) return;
    try {
      const data = await apiFetch<{
        openDebt: number;
        netBalance: number;
        events: Array<{
          date: string;
          kind: string;
          description: string;
          debit: number;
          credit: number;
          balance: number;
        }>;
      }>(`/accounting/apartments/${statementApt}/statement`, { token });
      setStatement(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка виписки');
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Дебіторка (AR) — aging / списання / тарифи"
        description="Глибокий облік особових рахунків"
      />
      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-ok">{message}</div>}

      {aging && (
        <div className="card grid-stats">
          <div>
            <div className="muted">Борг разом</div>
            <strong>{money(aging.totalDebt)}</strong>
          </div>
          <div>
            <div className="muted">Поточний / 1–30 / 31–60</div>
            <strong>
              {money(aging.buckets.current ?? 0)} / {money(aging.buckets.d1_30 ?? 0)} /{' '}
              {money(aging.buckets.d31_60 ?? 0)}
            </strong>
          </div>
          <div>
            <div className="muted">61–90 / 90+</div>
            <strong>
              {money(aging.buckets.d61_90 ?? 0)} / {money(aging.buckets.d90_plus ?? 0)}
            </strong>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Aging по квартирах</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Кв.</th>
              <th>Поточний</th>
              <th>1–30</th>
              <th>31–60</th>
              <th>61–90</th>
              <th>90+</th>
              <th>Разом</th>
              <th>Аванс</th>
            </tr>
          </thead>
          <tbody>
            {(aging?.apartments ?? []).map((a) => (
              <tr key={a.apartmentId}>
                <td>
                  <button
                    type="button"
                    className="btn btn-link"
                    onClick={() => {
                      setStatementApt(a.apartmentId);
                      setWoForm((s) => ({ ...s, apartmentId: a.apartmentId }));
                    }}
                  >
                    {a.number}
                  </button>
                </td>
                <td className="num">{money(a.current)}</td>
                <td className="num">{money(a.d1_30)}</td>
                <td className="num">{money(a.d31_60)}</td>
                <td className="num">{money(a.d61_90)}</td>
                <td className="num">{money(a.d90_plus)}</td>
                <td className="num">
                  <strong>{money(a.total)}</strong>
                </td>
                <td className="num">{money(a.advance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card row-wrap gap-2 items-end">
        <label className="field">
          <span>Виписка квартири (id)</span>
          <input
            value={statementApt}
            onChange={(e) => setStatementApt(e.target.value)}
            placeholder="apartmentId"
          />
        </label>
        <button type="button" className="btn" onClick={() => loadStatement()}>
          Завантажити statement
        </button>
      </div>
      {statement && (
        <div className="card">
          <p>
            Борг: <strong>{money(statement.openDebt)}</strong> · Нетто:{' '}
            <strong>{money(statement.netBalance)}</strong>
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Тип</th>
                <th>Опис</th>
                <th>Дт</th>
                <th>Кт</th>
                <th>Сальдо</th>
              </tr>
            </thead>
            <tbody>
              {statement.events.map((ev, i) => (
                <tr key={`${ev.date}-${i}`}>
                  <td>{ev.date.slice(0, 10)}</td>
                  <td>
                    <code>{ev.kind}</code>
                  </td>
                  <td>{ev.description}</td>
                  <td className="num">{money(ev.debit)}</td>
                  <td className="num">{money(ev.credit)}</td>
                  <td className="num">{money(ev.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form className="card form-grid" onSubmit={createWriteOff}>
        <h3>Списання боргу (write-off)</h3>
        <label className="field">
          <span>Apartment ID</span>
          <input
            value={woForm.apartmentId}
            onChange={(e) => setWoForm({ ...woForm, apartmentId: e.target.value })}
            required
          />
        </label>
        <label className="field">
          <span>Сума</span>
          <input
            type="number"
            step="0.01"
            value={woForm.amount}
            onChange={(e) => setWoForm({ ...woForm, amount: e.target.value })}
            required
          />
        </label>
        <label className="field">
          <span>Причина</span>
          <input
            value={woForm.reason}
            onChange={(e) => setWoForm({ ...woForm, reason: e.target.value })}
            required
          />
        </label>
        <button type="submit" className="btn btn-primary">
          Створити pending
        </button>
      </form>

      <div className="card">
        <h3>Списання</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Кв.</th>
              <th>Сума</th>
              <th>Причина</th>
              <th>Статус</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {writeOffs.map((w) => (
              <tr key={w.id}>
                <td>{w.apartment?.number}</td>
                <td className="num">{money(w.amount)}</td>
                <td>{w.reason}</td>
                <td>
                  <code>{w.status}</code>
                </td>
                <td>
                  {w.status === 'pending' && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => approveWo(w.id)}
                    >
                      Approve
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card row-wrap gap-2 items-end">
        <h3 style={{ width: '100%', margin: 0 }}>Масове нарахування з тарифів</h3>
        <label className="field">
          <span>Період</span>
          <input
            type="month"
            value={runPeriod}
            onChange={(e) => setRunPeriod(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            const token = getToken();
            if (!token || !buildingId) return;
            try {
              const res = await apiFetch<{
                previews: Array<{ name: string; total: number; lines: number }>;
              }>('/accounting/tariffs/run', {
                token,
                method: 'POST',
                body: JSON.stringify({
                  buildingId,
                  period: runPeriod,
                  dryRun: true,
                }),
              });
              setMessage(
                `Preview: ${(res.previews ?? [])
                  .map((p) => `${p.name}=${p.total} (${p.lines} кв.)`)
                  .join('; ') || 'порожньо'}`,
              );
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Preview failed');
            }
          }}
        >
          Preview
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={async () => {
            const token = getToken();
            if (!token || !buildingId) return;
            if (!window.confirm(`Створити нарахування за ${runPeriod}?`)) return;
            try {
              const res = await apiFetch<{
                created: Array<{ tariffId: string; accrualId?: string; error?: string }>;
              }>('/accounting/tariffs/run', {
                token,
                method: 'POST',
                body: JSON.stringify({
                  buildingId,
                  period: runPeriod,
                  dryRun: false,
                }),
              });
              const ok = (res.created ?? []).filter((c) => c.accrualId).length;
              const bad = (res.created ?? []).filter((c) => c.error).length;
              setMessage(`Створено: ${ok}, помилок: ${bad}`);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Run failed');
            }
          }}
        >
          Створити нарахування
        </button>
      </div>

      <form className="card form-grid" onSubmit={createTariff}>
        <h3>Тариф / послуга</h3>
        <label className="field">
          <span>Фонд</span>
          <select
            value={tariffForm.fundId}
            onChange={(e) =>
              setTariffForm({ ...tariffForm, fundId: e.target.value })
            }
            required
          >
            {funds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Назва</span>
          <input
            value={tariffForm.name}
            onChange={(e) =>
              setTariffForm({ ...tariffForm, name: e.target.value })
            }
            required
          />
        </label>
        <label className="field">
          <span>Ставка / м²</span>
          <input
            type="number"
            step="0.0001"
            value={tariffForm.rate}
            onChange={(e) =>
              setTariffForm({ ...tariffForm, rate: e.target.value })
            }
          />
        </label>
        <label className="field">
          <span>Фікс на квартиру</span>
          <input
            type="number"
            step="0.01"
            value={tariffForm.fixedAmount}
            onChange={(e) =>
              setTariffForm({ ...tariffForm, fixedAmount: e.target.value })
            }
          />
        </label>
        <label className="field">
          <span>З</span>
          <input
            type="date"
            value={tariffForm.effectiveFrom}
            onChange={(e) =>
              setTariffForm({ ...tariffForm, effectiveFrom: e.target.value })
            }
          />
        </label>
        <button type="submit" className="btn btn-primary">
          Додати тариф
        </button>
      </form>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Назва</th>
              <th>Фонд</th>
              <th>Rate</th>
              <th>Fix</th>
              <th>Активний</th>
            </tr>
          </thead>
          <tbody>
            {tariffs.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>{t.fund?.name}</td>
                <td className="num">{t.rate ?? '—'}</td>
                <td className="num">{t.fixedAmount ?? '—'}</td>
                <td>{t.isActive ? 'так' : 'ні'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
