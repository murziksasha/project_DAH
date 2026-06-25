'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { apiFetch, getToken } from '@/lib/api';

interface Apartment {
  id: string;
  number: string;
  entrance: number;
}

interface AllocationPreview {
  apartment: { id: string; number: string };
  amount: number;
  allocations: Array<{
    accrualLineId: string;
    amount: number;
    period: string;
    title: string;
    lineBalance: number;
  }>;
  advance: number;
  totalAllocated: number;
}

export default function PaymentsPage() {
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [apartmentId, setApartmentId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState<'bank' | 'cash' | 'transfer'>('bank');
  const [reference, setReference] = useState('');
  const [preview, setPreview] = useState<AllocationPreview | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    apiFetch<Apartment[]>('/building/apartments', { token }).then((data) => {
      setApartments(data);
      if (data[0]) setApartmentId(data[0].id);
    });
  }, []);

  async function loadPreview() {
    const token = getToken();
    if (!token || !apartmentId || !amount) return;
    setError('');
    try {
      const data = await apiFetch<AllocationPreview>(
        `/payments/preview/allocation?apartmentId=${apartmentId}&amount=${amount}`,
        { token },
      );
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
      setPreview(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await apiFetch('/payments', {
        method: 'POST',
        token,
        body: JSON.stringify({
          apartmentId,
          amount: Number(amount),
          date,
          source,
          reference: reference || undefined,
        }),
      });
      setMessage('Платіж зафіксовано та рознесено');
      setAmount('');
      setReference('');
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '1rem' }}>
      <Link href="/admin" style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>← Дашборд</Link>
      <h1 style={{ margin: '1rem 0 0.5rem' }}>Платіж від мешканця</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>
        Реєстрація надходження з автоматичною розноскою FIFO
      </p>

      <form onSubmit={handleSubmit} className="card" style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <label>Квартира</label>
          <select value={apartmentId} onChange={(e) => setApartmentId(e.target.value)} required>
            {apartments.map((a) => (
              <option key={a.id} value={a.id}>
                кв. {a.number} (під&apos;їзд {a.entrance})
              </option>
            ))}
          </select>
        </div>
        <div className="grid-2">
          <div>
            <label>Сума (₴)</label>
            <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div>
            <label>Дата</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
        </div>
        <div>
          <label>Джерело</label>
          <select value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
            <option value="bank">Банк</option>
            <option value="cash">Готівка</option>
            <option value="transfer">Переказ</option>
          </select>
        </div>
        <div>
          <label>Коментар / референс</label>
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="№ платіжки, призначення..." />
        </div>
        <button type="button" onClick={loadPreview} style={{ background: 'var(--surface-2)' }}>
          Попередній перегляд розноски
        </button>
        {error && <p className="error">{error}</p>}
        {message && <p style={{ color: 'var(--success)' }}>{message}</p>}
        <button type="submit" disabled={loading || !preview}>
          {loading ? 'Збереження...' : 'Зафіксувати платіж'}
        </button>
      </form>

      {preview && (
        <section className="card">
          <h2 style={{ marginBottom: '1rem' }}>Розноска (FIFO)</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
            Кв. {preview.apartment.number} · Рознесено: {preview.totalAllocated.toLocaleString('uk-UA')} ₴
            {preview.advance > 0 && ` · Аванс: ${preview.advance.toLocaleString('uk-UA')} ₴`}
          </p>
          {preview.allocations.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>Немає відкритих нарахувань — вся сума буде авансом</p>
          ) : (
            <ul style={{ listStyle: 'none', display: 'grid', gap: '0.5rem' }}>
              {preview.allocations.map((a) => (
                <li key={a.accrualLineId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span>{a.period} — {a.title}</span>
                  <span style={{ fontWeight: 600 }}>{a.amount.toLocaleString('uk-UA')} ₴</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}