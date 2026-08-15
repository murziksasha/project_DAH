'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, getToken } from '@/lib/api';
import { getSelectedBuildingId } from '@/lib/building-context';

interface Invoice {
  id: string;
  number?: string | null;
  amount: string | number;
  paidAmount: string | number;
  status: string;
  date: string;
  description?: string | null;
  supplier: { id: string; name: string };
  fund: { id: string; name: string };
}

interface Supplier {
  id: string;
  name: string;
}

interface Fund {
  id: string;
  name: string;
}

function money(n: number | string) {
  const v = typeof n === 'string' ? Number(n) : n;
  return v.toLocaleString('uk-UA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function ApPage() {
  const [buildingId, setBuildingId] = useState('');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [aging, setAging] = useState<{
    total: number;
    buckets: Record<string, number>;
  } | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    supplierId: '',
    fundId: '',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    number: '',
    description: '',
    approve: true,
  });

  const load = useCallback(async (bid: string) => {
    const token = getToken();
    if (!token || !bid) return;
    setError('');
    try {
      const [inv, sup, f, ag] = await Promise.all([
        apiFetch<Invoice[]>(
          `/accounting/supplier-invoices?buildingId=${encodeURIComponent(bid)}`,
          { token },
        ),
        apiFetch<Supplier[]>(
          `/finance/suppliers?buildingId=${encodeURIComponent(bid)}`,
          { token },
        ),
        apiFetch<Fund[]>(
          `/finance/funds?buildingId=${encodeURIComponent(bid)}`,
          { token },
        ),
        apiFetch<{ total: number; buckets: Record<string, number> }>(
          `/accounting/ap-aging?buildingId=${encodeURIComponent(bid)}`,
          { token },
        ),
      ]);
      setInvoices(Array.isArray(inv) ? inv : []);
      setSuppliers(Array.isArray(sup) ? sup : []);
      setFunds(Array.isArray(f) ? f : []);
      setAging(ag);
      if (!form.supplierId && sup?.[0]) {
        setForm((s) => ({ ...s, supplierId: sup[0].id, fundId: f?.[0]?.id ?? '' }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }, [form.supplierId]);

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

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token || !buildingId) return;
    setError('');
    setMessage('');
    try {
      await apiFetch('/accounting/supplier-invoices', {
        token,
        method: 'POST',
        body: JSON.stringify({
          buildingId,
          supplierId: form.supplierId,
          fundId: form.fundId,
          amount: Number(form.amount),
          date: form.date,
          number: form.number || undefined,
          description: form.description || undefined,
          approve: form.approve,
        }),
      });
      setMessage('Рахунок створено');
      setForm((s) => ({ ...s, amount: '', number: '', description: '' }));
      await load(buildingId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка створення');
    }
  }

  async function approve(id: string) {
    const token = getToken();
    if (!token) return;
    try {
      await apiFetch(`/accounting/supplier-invoices/${id}/approve`, {
        token,
        method: 'POST',
        body: '{}',
      });
      await load(buildingId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка approve');
    }
  }

  async function pay(id: string, open: number) {
    const token = getToken();
    if (!token) return;
    const amount = window.prompt('Сума оплати', String(open));
    if (!amount) return;
    try {
      await apiFetch('/accounting/supplier-invoices/pay', {
        token,
        method: 'POST',
        body: JSON.stringify({
          invoiceId: id,
          amount: Number(amount),
          date: new Date().toISOString().slice(0, 10),
        }),
      });
      await load(buildingId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка оплати');
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Кредиторка (AP)"
        description="Рахунки постачальників, оплата, aging"
      />
      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-ok">{message}</div>}

      {aging && (
        <div className="card grid-stats">
          <div>
            <div className="muted">Відкрито</div>
            <strong>{money(aging.total)}</strong>
          </div>
          <div>
            <div className="muted">0 / 1–30 / 31–60</div>
            <strong>
              {money(aging.buckets.current ?? 0)} / {money(aging.buckets.d1_30 ?? 0)} /{' '}
              {money(aging.buckets.d31_60 ?? 0)}
            </strong>
          </div>
        </div>
      )}

      <form className="card form-grid" onSubmit={onCreate}>
        <h3>Новий рахунок</h3>
        <label className="field">
          <span>Постачальник</span>
          <select
            value={form.supplierId}
            onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
            required
          >
            <option value="">—</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Фонд</span>
          <select
            value={form.fundId}
            onChange={(e) => setForm({ ...form, fundId: e.target.value })}
            required
          >
            <option value="">—</option>
            {funds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Сума</span>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            required
          />
        </label>
        <label className="field">
          <span>Дата</span>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            required
          />
        </label>
        <label className="field">
          <span>Номер</span>
          <input
            value={form.number}
            onChange={(e) => setForm({ ...form, number: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Опис</span>
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        <label className="field checkbox">
          <input
            type="checkbox"
            checked={form.approve}
            onChange={(e) => setForm({ ...form, approve: e.target.checked })}
          />
          <span>Одразу провести (approve)</span>
        </label>
        <button type="submit" className="btn btn-primary">
          Створити
        </button>
      </form>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>№</th>
              <th>Постачальник</th>
              <th>Сума</th>
              <th>Сплачено</th>
              <th>Статус</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const open = Number(inv.amount) - Number(inv.paidAmount);
              return (
                <tr key={inv.id}>
                  <td>{String(inv.date).slice(0, 10)}</td>
                  <td>{inv.number ?? '—'}</td>
                  <td>{inv.supplier?.name}</td>
                  <td className="num">{money(inv.amount)}</td>
                  <td className="num">{money(inv.paidAmount)}</td>
                  <td>
                    <code>{inv.status}</code>
                  </td>
                  <td className="row-wrap gap-1">
                    {inv.status === 'draft' && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => approve(inv.id)}
                      >
                        Approve
                      </button>
                    )}
                    {(inv.status === 'approved' ||
                      inv.status === 'partially_paid') &&
                      open > 0 && (
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={() => pay(inv.id, open)}
                        >
                          Оплатити
                        </button>
                      )}
                  </td>
                </tr>
              );
            })}
            {!invoices.length && (
              <tr>
                <td colSpan={7}>Немає рахунків</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
