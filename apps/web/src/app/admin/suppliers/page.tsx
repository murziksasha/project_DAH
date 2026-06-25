'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { apiFetch, getToken } from '@/lib/api';

interface Supplier {
  id: string;
  name: string;
  edrpou: string | null;
  iban: string | null;
  phone: string | null;
  serviceType: string | null;
}

const emptyForm = {
  name: '',
  edrpou: '',
  iban: '',
  phone: '',
  serviceType: '',
};

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadSuppliers() {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    const data = await apiFetch<Supplier[]>('/finance/suppliers', { token });
    setSuppliers(data);
  }

  useEffect(() => {
    loadSuppliers().catch((err) => setError(err.message));
  }, []);

  function startEdit(s: Supplier) {
    setEditingId(s.id);
    setForm({
      name: s.name,
      edrpou: s.edrpou ?? '',
      iban: s.iban ?? '',
      phone: s.phone ?? '',
      serviceType: s.serviceType ?? '',
    });
    setMessage('');
    setError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setError('');
    setMessage('');

    const body = {
      name: form.name,
      edrpou: form.edrpou || undefined,
      iban: form.iban || undefined,
      phone: form.phone || undefined,
      serviceType: form.serviceType || undefined,
    };

    try {
      if (editingId) {
        await apiFetch(`/finance/suppliers/${editingId}`, {
          method: 'PATCH',
          token,
          body: JSON.stringify(body),
        });
        setMessage('Постачальника оновлено');
      } else {
        await apiFetch('/finance/suppliers', {
          method: 'POST',
          token,
          body: JSON.stringify(body),
        });
        setMessage('Постачальника додано');
      }
      cancelEdit();
      await loadSuppliers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '1rem' }}>
      <Link href="/admin" style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>← Дашборд</Link>
      <h1 style={{ margin: '1rem 0 0.5rem' }}>Постачальники</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>
        Облэнерго, водоканал, підрядники та інші контрагенти
      </p>

      <form onSubmit={handleSubmit} className="card" style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem' }}>{editingId ? 'Редагувати' : 'Додати постачальника'}</h2>
        <div>
          <label>Назва *</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="grid-2">
          <div>
            <label>ЄДРПОУ</label>
            <input value={form.edrpou} onChange={(e) => setForm({ ...form, edrpou: e.target.value })} />
          </div>
          <div>
            <label>Телефон</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
        </div>
        <div>
          <label>IBAN</label>
          <input value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} />
        </div>
        <div>
          <label>Тип послуги</label>
          <input
            value={form.serviceType}
            onChange={(e) => setForm({ ...form, serviceType: e.target.value })}
            placeholder="water, electricity, cleaning..."
          />
        </div>
        {error && <p className="error">{error}</p>}
        {message && <p style={{ color: 'var(--success)' }}>{message}</p>}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="submit">{editingId ? 'Зберегти' : 'Додати'}</button>
          {editingId && (
            <button type="button" onClick={cancelEdit} style={{ background: 'var(--surface-2)' }}>
              Скасувати
            </button>
          )}
        </div>
      </form>

      <section className="card">
        <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Список ({suppliers.length})</h2>
        <ul style={{ listStyle: 'none', display: 'grid', gap: '0.75rem' }}>
          {suppliers.map((s) => (
            <li key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{s.name}</div>
                <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                  {[s.serviceType, s.phone, s.edrpou].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
              <button type="button" onClick={() => startEdit(s)} style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}>
                Редагувати
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}