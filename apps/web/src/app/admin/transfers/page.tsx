'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, getToken } from '@/lib/api';
import { formatDateUk, formatMoney } from '@/lib/money';

interface Fund {
  id: string;
  name: string;
}

interface Transfer {
  id: string;
  amount: string | number;
  date: string;
  description?: string | null;
  fromFund: { id: string; name: string };
  toFund: { id: string; name: string };
}

export default function FundTransfersPage() {
  const [funds, setFunds] = useState<Fund[]>([]);
  const [list, setList] = useState<Transfer[]>([]);
  const [fromFundId, setFromFundId] = useState('');
  const [toFundId, setToFundId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    setLoading(true);
    try {
      const [f, t] = await Promise.all([
        apiFetch<Fund[]>('/finance/funds', { token }),
        apiFetch<Transfer[]>('/finance/transfers', { token }),
      ]);
      setFunds(Array.isArray(f) ? f : []);
      setList(Array.isArray(t) ? t : []);
      if (!fromFundId && f?.[0]) setFromFundId(f[0].id);
      if (!toFundId && f?.[1]) setToFundId(f[1].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setLoading(false);
    }
  }, [fromFundId, toFundId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setError('');
    setMessage('');
    setLoading(true);
    try {
      await apiFetch('/finance/transfers', {
        method: 'POST',
        token,
        body: JSON.stringify({
          fromFundId,
          toFundId,
          amount: Number(amount.replace(',', '.')),
          date,
          description: description || undefined,
        }),
      });
      setMessage('Переказ створено');
      setAmount('');
      setDescription('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка (потрібна 2FA?)');
    } finally {
      setLoading(false);
    }
  }

  async function voidTransfer(id: string) {
    const reason = window.prompt('Причина анулювання?');
    if (!reason?.trim()) return;
    const token = getToken();
    if (!token) return;
    try {
      await apiFetch(`/finance/transfers/${id}/void`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ reason }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Перекази між фондами"
        description="Внутрішній рух коштів (journal dual-entry). Потрібна 2FA для фінансів."
      />
      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      <section className="card" style={{ marginBottom: '1rem' }}>
        <form onSubmit={onSubmit} className="form-grid">
          <label>
            З фонду
            <select
              value={fromFundId}
              onChange={(e) => setFromFundId(e.target.value)}
              required
            >
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            До фонду
            <select value={toFundId} onChange={(e) => setToFundId(e.target.value)} required>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Сума
            <input
              required
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label>
            Дата
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label>
            Опис
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <button type="submit" disabled={loading}>
            Переказати
          </button>
        </form>
      </section>

      <section className="card">
        <h2 style={{ fontSize: '1.1rem' }}>Історія</h2>
        {loading && !list.length ? (
          <p>…</p>
        ) : !list.length ? (
          <p style={{ color: 'var(--muted)' }}>Переказів ще немає</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>З</th>
                  <th>До</th>
                  <th>Сума</th>
                  <th>Опис</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((t) => (
                  <tr key={t.id}>
                    <td>{formatDateUk(t.date)}</td>
                    <td>{t.fromFund.name}</td>
                    <td>{t.toFund.name}</td>
                    <td style={{ fontWeight: 600 }}>{formatMoney(Number(t.amount))}</td>
                    <td>{t.description ?? '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => void voidTransfer(t.id)}
                      >
                        Анулювати
                      </button>
                    </td>
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
