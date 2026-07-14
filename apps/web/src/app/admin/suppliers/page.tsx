'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, getToken } from '@/lib/api';

interface Supplier {
  id: string;
  name: string;
  edrpou: string | null;
  iban: string | null;
  phone: string | null;
  serviceType: string | null;
}

interface Category {
  id: string;
  name: string;
  code: string;
}

type Tab = 'suppliers' | 'categories';

const emptyForm = {
  name: '',
  edrpou: '',
  iban: '',
  phone: '',
  serviceType: '',
};

export default function SuppliersPage() {
  const [tab, setTab] = useState<Tab>('suppliers');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [catName, setCatName] = useState('');
  const [catCode, setCatCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadSuppliers = useCallback(async () => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    setSuppliers(await apiFetch<Supplier[]>('/finance/suppliers', { token }));
  }, []);

  const loadCategories = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setCategories(await apiFetch<Category[]>('/finance/categories', { token }));
  }, []);

  useEffect(() => {
    loadSuppliers().catch((err) => setError(err.message));
    loadCategories().catch((err) => setError(err.message));
  }, [loadSuppliers, loadCategories]);

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

  async function handleSupplierSubmit(e: FormEvent) {
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

  async function handleCategorySubmit(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setError('');
    try {
      await apiFetch('/finance/categories', {
        method: 'POST',
        token,
        body: JSON.stringify({ name: catName, code: catCode || undefined }),
      });
      setCatName('');
      setCatCode('');
      setMessage('Категорію додано');
      await loadCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  async function deleteCategory(id: string) {
    if (!window.confirm('Видалити категорію?')) return;
    const token = getToken();
    if (!token) return;
    try {
      await apiFetch(`/finance/categories/${id}`, { method: 'DELETE', token });
      setMessage('Категорію видалено');
      await loadCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  return (
    <main>
      <PageHeader
        title="Довідники"
        description="Постачальники та категорії витрат"
        actions={
          <Link href="/admin/expenses" className="btn btn-sm btn-ghost">
            Нова витрата
          </Link>
        }
      />

      <nav className="nav-scroll">
        <button
          type="button"
          className={`tab-btn${tab === 'suppliers' ? ' active' : ''}`}
          onClick={() => setTab('suppliers')}
        >
          Постачальники
        </button>
        <button
          type="button"
          className={`tab-btn${tab === 'categories' ? ' active' : ''}`}
          onClick={() => setTab('categories')}
        >
          Категорії
        </button>
      </nav>

      {error && <p className="error">{error}</p>}
      {message && <p className="success-banner">{message}</p>}

      {tab === 'suppliers' && (
        <>
          <form
            onSubmit={handleSupplierSubmit}
            className="card"
            style={{ display: 'grid', gap: '0.75rem', marginBottom: '1.25rem' }}
          >
            <h2 style={{ fontSize: '1.05rem' }}>
              {editingId ? 'Редагувати постачальника' : 'Новий постачальник'}
            </h2>
            <div>
              <label>Назва</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="grid-2">
              <div>
                <label>ЄДРПОУ</label>
                <input value={form.edrpou} onChange={(e) => setForm({ ...form, edrpou: e.target.value })} />
              </div>
              <div>
                <label>IBAN</label>
                <input value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} />
              </div>
            </div>
            <div className="grid-2">
              <div>
                <label>Телефон</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label>Тип послуг</label>
                <input
                  value={form.serviceType}
                  onChange={(e) => setForm({ ...form, serviceType: e.target.value })}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit">{editingId ? 'Зберегти' : 'Додати'}</button>
              {editingId && (
                <button type="button" className="btn btn-ghost" onClick={cancelEdit}>
                  Скасувати
                </button>
              )}
            </div>
          </form>

          <section className="card">
            {suppliers.length === 0 ? (
              <EmptyState title="Постачальників немає" />
            ) : (
              <ul style={{ listStyle: 'none', display: 'grid', gap: '0.75rem' }}>
                {suppliers.map((s) => (
                  <li
                    key={s.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '1rem',
                      flexWrap: 'wrap',
                      borderBottom: '1px solid var(--border)',
                      paddingBottom: '0.75rem',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{s.name}</div>
                      <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                        {[s.serviceType, s.edrpou, s.phone].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </div>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => startEdit(s)}>
                      Редагувати
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {tab === 'categories' && (
        <>
          <form
            onSubmit={handleCategorySubmit}
            className="card"
            style={{ display: 'grid', gap: '0.75rem', marginBottom: '1.25rem' }}
          >
            <h2 style={{ fontSize: '1.05rem' }}>Нова категорія витрат</h2>
            <div className="grid-2">
              <div>
                <label>Назва</label>
                <input value={catName} onChange={(e) => setCatName(e.target.value)} required />
              </div>
              <div>
                <label>Код (опційно)</label>
                <input
                  value={catCode}
                  onChange={(e) => setCatCode(e.target.value)}
                  placeholder="utilities"
                />
              </div>
            </div>
            <button type="submit">Додати</button>
          </form>
          <section className="card">
            {categories.length === 0 ? (
              <EmptyState title="Категорій немає" />
            ) : (
              <ul style={{ listStyle: 'none', display: 'grid', gap: '0.5rem' }}>
                {categories.map((c) => (
                  <li
                    key={c.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '1rem',
                      borderBottom: '1px solid var(--border)',
                      paddingBottom: '0.5rem',
                    }}
                  >
                    <span>
                      <strong>{c.name}</strong>{' '}
                      <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>({c.code})</span>
                    </span>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => deleteCategory(c.id)}>
                      Видалити
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
