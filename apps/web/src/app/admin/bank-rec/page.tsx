'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, getToken } from '@/lib/api';
import { getSelectedBuildingId } from '@/lib/building-context';

interface BankAccount {
  id: string;
  bankName: string;
  iban: string;
}

interface RecRow {
  id: string;
  period: string;
  statementBalance: string | number;
  glBalance?: string | number | null;
  status: string;
  bankAccount: { id: string; bankName: string; iban: string };
}

function money(n: number | string | null | undefined) {
  if (n == null) return '—';
  const v = typeof n === 'string' ? Number(n) : n;
  return v.toLocaleString('uk-UA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function BankRecPage() {
  const [buildingId, setBuildingId] = useState('');
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [rows, setRows] = useState<RecRow[]>([]);
  const [glBalance, setGlBalance] = useState<number | null>(null);
  const [cashBook, setCashBook] = useState<{ totalIn: number; lines: unknown[] } | null>(
    null,
  );
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    bankAccountId: '',
    period: new Date().toISOString().slice(0, 7),
    statementBalance: '',
    notes: '',
  });

  const load = useCallback(async (bid: string) => {
    const token = getToken();
    if (!token || !bid) return;
    try {
      const [acc, rec, gl, cash] = await Promise.all([
        apiFetch<BankAccount[]>(
          `/finance/bank-accounts?buildingId=${encodeURIComponent(bid)}`,
          { token },
        ),
        apiFetch<RecRow[]>(
          `/accounting/bank-reconciliations?buildingId=${encodeURIComponent(bid)}`,
          { token },
        ),
        apiFetch<{ balance: number }>(
          `/accounting/bank-gl-balance?buildingId=${encodeURIComponent(bid)}`,
          { token },
        ),
        apiFetch<{ totalIn: number; lines: unknown[] }>(
          `/accounting/cash-book?buildingId=${encodeURIComponent(bid)}`,
          { token },
        ),
      ]);
      setAccounts(Array.isArray(acc) ? acc : []);
      setRows(Array.isArray(rec) ? rec : []);
      setGlBalance(gl?.balance ?? null);
      setCashBook(cash);
      if (!form.bankAccountId && acc?.[0]) {
        setForm((s) => ({ ...s, bankAccountId: acc[0].id }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }, [form.bankAccountId]);

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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token || !buildingId) return;
    setError('');
    setMessage('');
    try {
      const res = await apiFetch<{ status: string; difference: number }>(
        '/accounting/bank-reconciliations',
        {
          token,
          method: 'POST',
          body: JSON.stringify({
            buildingId,
            bankAccountId: form.bankAccountId,
            period: form.period,
            statementBalance: Number(form.statementBalance),
            notes: form.notes || undefined,
          }),
        },
      );
      setMessage(
        `Звірку збережено: ${res.status}${res.difference != null ? `, diff=${res.difference}` : ''}`,
      );
      await load(buildingId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  async function closeRec(id: string) {
    const token = getToken();
    if (!token) return;
    try {
      await apiFetch(`/accounting/bank-reconciliations/${id}/close`, {
        token,
        method: 'POST',
        body: '{}',
      });
      await load(buildingId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не вдалося закрити');
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Звірка банку / каса"
        description="Statement balance vs GL cash, cash book"
      />
      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-ok">{message}</div>}

      <div className="card grid-stats">
        <div>
          <div className="muted">GL cash (будинок)</div>
          <strong>{money(glBalance)}</strong>
        </div>
        <div>
          <div className="muted">Каса (надходження)</div>
          <strong>{money(cashBook?.totalIn ?? 0)}</strong>
        </div>
      </div>

      <form className="card form-grid" onSubmit={onSubmit}>
        <h3>Нова / оновити звірку</h3>
        <label className="field">
          <span>Банківський рахунок</span>
          <select
            value={form.bankAccountId}
            onChange={(e) => setForm({ ...form, bankAccountId: e.target.value })}
            required
          >
            <option value="">—</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.bankName} · {a.iban}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Період</span>
          <input
            type="month"
            value={form.period}
            onChange={(e) => setForm({ ...form, period: e.target.value })}
            required
          />
        </label>
        <label className="field">
          <span>Залишок за випискою</span>
          <input
            type="number"
            step="0.01"
            value={form.statementBalance}
            onChange={(e) =>
              setForm({ ...form, statementBalance: e.target.value })
            }
            required
          />
        </label>
        <label className="field">
          <span>Нотатки</span>
          <input
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </label>
        <button type="submit" className="btn btn-primary">
          Зберегти звірку
        </button>
      </form>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Період</th>
              <th>Рахунок</th>
              <th>Statement</th>
              <th>GL</th>
              <th>Статус</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.period}</td>
                <td>
                  {r.bankAccount?.bankName}
                  <div className="muted small">{r.bankAccount?.iban}</div>
                </td>
                <td className="num">{money(r.statementBalance)}</td>
                <td className="num">{money(r.glBalance)}</td>
                <td>
                  <code>{r.status}</code>
                </td>
                <td>
                  {r.status !== 'closed' && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => closeRec(r.id)}
                    >
                      Закрити
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6}>Немає звірок</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
