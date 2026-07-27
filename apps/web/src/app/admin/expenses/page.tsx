'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, getToken, uploadFile } from '@/lib/api';

interface Fund {
  id: string;
  name: string;
}
interface Category {
  id: string;
  name: string;
}
interface Supplier {
  id: string;
  name: string;
}

export default function ExpensesPage() {
  const [funds, setFunds] = useState<Fund[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [fundId, setFundId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [documentKey, setDocumentKey] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    Promise.all([
      apiFetch<Fund[]>('/finance/funds', { token }),
      apiFetch<Category[]>('/finance/categories', { token }),
      apiFetch<Supplier[]>('/finance/suppliers', { token }),
    ]).then(([f, c, s]) => {
      setFunds(f);
      setCategories(c);
      setSuppliers(s);
      if (f[0]) setFundId(f[0].id);
      if (c[0]) setCategoryId(c[0].id);
    });
  }, []);

  async function handleFileChange(file: File | undefined) {
    if (!file) return;
    const token = getToken();
    if (!token) return;
    setError('');
    try {
      const uploaded = await uploadFile('/files/upload', file, token);
      setDocumentKey(uploaded.key);
      setFileName(file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка файлу');
      setDocumentKey(null);
      setFileName('');
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setError('');
    setMessage('');
    setLoading(true);
    try {
      await apiFetch('/finance/expenses', {
        method: 'POST',
        token,
        body: JSON.stringify({
          fundId,
          categoryId,
          supplierId: supplierId || undefined,
          amount: Number(amount),
          date,
          description: description || undefined,
          documentKey: documentKey || undefined,
        }),
      });
      setMessage('Витрату зафіксовано');
      setCreated(true);
      setAmount('');
      setDescription('');
      setDocumentKey(null);
      setFileName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <PageHeader
        title="Нова витрата"
        description="Оплата підрядників, комунальних, зарплат — з документом"
        actions={
          <Link href="/admin/expenses/list" className="btn btn-sm btn-ghost">
            Список витрат
          </Link>
        }
      />

      {created && (
        <p className="success-banner">
          Збережено.{' '}
          <Link href="/admin/expenses/list">Відкрити список</Link>
          {' · '}
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => setCreated(false)}
            style={{ display: 'inline' }}
          >
            Додати ще
          </button>
        </p>
      )}

      <form onSubmit={handleSubmit} className="card" style={{ display: 'grid', gap: '1rem' }}>
        <div className="grid-2">
          <div>
            <label>Фонд</label>
            <select value={fundId} onChange={(e) => setFundId(e.target.value)} required>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Категорія</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
              {categories.length === 0 && <option value="">Немає категорій</option>}
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {categories.length === 0 && (
              <p style={{ fontSize: '0.8rem', marginTop: '0.35rem' }}>
                <Link href="/admin/suppliers">Додайте категорію в Довідниках</Link>
              </p>
            )}
          </div>
        </div>
        <div>
          <label>Постачальник</label>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">— не вказано —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid-2">
          <div>
            <label>Сума (₴)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div>
            <label>Дата</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
        </div>
        <div>
          <label>Опис</label>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label>Платіжка / документ (PDF, JPEG, PNG)</label>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={(e) => handleFileChange(e.target.files?.[0])}
          />
          {fileName && (
            <p style={{ color: 'var(--success)', fontSize: '0.85rem', marginTop: '0.35rem' }}>
              Завантажено: {fileName}
            </p>
          )}
        </div>
        {error && <p className="error">{error}</p>}
        {message && !created && <p className="success-banner">{message}</p>}
        <button type="submit" disabled={loading || !categoryId}>
          {loading ? 'Збереження…' : 'Зберегти витрату'}
        </button>
      </form>
    </main>
  );
}
