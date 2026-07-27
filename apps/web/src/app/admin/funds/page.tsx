'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, getToken } from '@/lib/api';
import { withBuildingBody } from '@/lib/building-context';
import { formatMoney } from '@/lib/money';
import { DataTable } from '@/components/ui/DataTable';
import { useBankAccountsQuery, useFundsQuery } from '@/lib/queries';

interface BankAccount {
  id: string;
  bankName: string;
  iban: string;
  description?: string | null;
}

interface Fund {
  id: string;
  name: string;
  type: string;
  openingBalance: string | number;
  bankAccountId: string | null;
  bankAccount: BankAccount | null;
}

type Tab = 'funds' | 'banks';

export default function FundsPage() {
  const [tab, setTab] = useState<Tab>('funds');
  const [editing, setEditing] = useState<Fund | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [fundType, setFundType] = useState('maintenance');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [bankAccountId, setBankAccountId] = useState('');
  const [bankForm, setBankForm] = useState({ bankName: '', iban: '', description: '' });
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const fundsQuery = useFundsQuery(Boolean(getToken()));
  const banksQuery = useBankAccountsQuery(Boolean(getToken()));
  const funds = (fundsQuery.data ?? []) as Fund[];
  const banks = (banksQuery.data ?? []) as BankAccount[];
  const loading = fundsQuery.isLoading || banksQuery.isLoading;

  const load = useCallback(async () => {
    if (!getToken()) {
      window.location.href = '/login';
      return;
    }
    await Promise.all([fundsQuery.refetch(), banksQuery.refetch()]);
  }, [fundsQuery, banksQuery]);

  useEffect(() => {
    if (!getToken()) window.location.href = '/login';
  }, []);

  function startEdit(f: Fund) {
    setEditing(f);
    setName(f.name);
    setOpeningBalance(String(f.openingBalance ?? 0));
    setBankAccountId(f.bankAccountId ?? '');
    setMessage('');
    setError('');
  }

  async function saveFund(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setError('');
    try {
      if (creating) {
        await apiFetch('/finance/funds', {
          method: 'POST',
          token,
          body: JSON.stringify(
            withBuildingBody({
              name,
              type: fundType,
              openingBalance: Number(openingBalance),
              bankAccountId: bankAccountId || null,
            }),
          ),
        });
        setMessage('Фонд створено');
        setCreating(false);
      } else if (editing) {
        await apiFetch(`/finance/funds/${editing.id}`, {
          method: 'PATCH',
          token,
          body: JSON.stringify({
            name,
            openingBalance: Number(openingBalance),
            bankAccountId: bankAccountId || null,
          }),
        });
        setMessage('Фонд оновлено');
        setEditing(null);
      }
      setName('');
      setOpeningBalance('0');
      setBankAccountId('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  async function saveBank(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setError('');
    try {
      if (editingBankId) {
        await apiFetch(`/finance/bank-accounts/${editingBankId}`, {
          method: 'PATCH',
          token,
          body: JSON.stringify({
            bankName: bankForm.bankName,
            iban: bankForm.iban,
            description: bankForm.description || null,
          }),
        });
        setMessage('Рахунок оновлено');
      } else {
        await apiFetch('/finance/bank-accounts', {
          method: 'POST',
          token,
          body: JSON.stringify(
            withBuildingBody({
              bankName: bankForm.bankName,
              iban: bankForm.iban,
              description: bankForm.description || undefined,
            }),
          ),
        });
        setMessage('Рахунок додано');
      }
      setBankForm({ bankName: '', iban: '', description: '' });
      setEditingBankId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  async function deleteBank(id: string) {
    if (!window.confirm('Видалити банківський рахунок?')) return;
    const token = getToken();
    if (!token) return;
    try {
      await apiFetch(`/finance/bank-accounts/${id}`, { method: 'DELETE', token });
      setMessage('Рахунок видалено');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  return (
    <main>
      <PageHeader
        title="Фонди та рахунки"
        description="Залишки фондів і банківські IBAN для квитанцій мешканців"
      />

      <nav className="nav-scroll">
        <button
          type="button"
          className={`tab-btn${tab === 'funds' ? ' active' : ''}`}
          onClick={() => setTab('funds')}
        >
          Фонди
        </button>
        <button
          type="button"
          className={`tab-btn${tab === 'banks' ? ' active' : ''}`}
          onClick={() => setTab('banks')}
        >
          Банківські рахунки
        </button>
      </nav>

      {error && <p className="error">{error}</p>}
      {message && <p className="success-banner">{message}</p>}

      {tab === 'funds' && (
        <>
          {!editing && !creating && (
            <div style={{ marginBottom: '1rem' }}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setCreating(true);
                  setEditing(null);
                  setName('');
                  setFundType('maintenance');
                  setOpeningBalance('0');
                  setBankAccountId('');
                }}
              >
                + Новий фонд
              </button>
            </div>
          )}

          {(editing || creating) && (
            <form
              onSubmit={saveFund}
              className="card"
              style={{ display: 'grid', gap: '0.75rem', marginBottom: '1.25rem' }}
            >
              <h2 style={{ fontSize: '1.05rem' }}>
                {creating ? 'Новий фонд' : `Редагувати: ${editing?.type}`}
              </h2>
              <div>
                <label>Назва</label>
                <input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              {creating && (
                <div>
                  <label>Тип</label>
                  <select value={fundType} onChange={(e) => setFundType(e.target.value)}>
                    <option value="maintenance">Утримання</option>
                    <option value="capital_repair">Капремонт</option>
                    <option value="special">Спеціальний</option>
                  </select>
                </div>
              )}
              <div>
                <label>Початковий залишок (₴)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  required
                />
              </div>
              <div>
                <label>Банківський рахунок</label>
                <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
                  <option value="">— не привʼязано —</option>
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bankName} · {b.iban}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit">Зберегти</button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setEditing(null);
                    setCreating(false);
                  }}
                >
                  Скасувати
                </button>
              </div>
            </form>
          )}

          <section className="card">
            {loading ? (
              <p style={{ color: 'var(--muted)' }}>Завантаження…</p>
            ) : funds.length === 0 ? (
              <EmptyState title="Фондів немає" description="Створіть фонд або пройдіть майстер setup." />
            ) : (
              <DataTable
                rows={funds}
                rowKey={(f) => f.id}
                columns={[
                  { key: 'name', header: 'Назва', render: (f) => <strong>{f.name}</strong> },
                  { key: 'type', header: 'Тип', render: (f) => f.type },
                  {
                    key: 'opening',
                    header: 'Початковий',
                    render: (f) => formatMoney(f.openingBalance),
                  },
                  {
                    key: 'bank',
                    header: 'IBAN',
                    render: (f) =>
                      f.bankAccount ? `${f.bankAccount.bankName} ${f.bankAccount.iban}` : '—',
                  },
                  {
                    key: 'actions',
                    header: '',
                    render: (f) => (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => {
                          setCreating(false);
                          startEdit(f);
                        }}
                      >
                        Редагувати
                      </button>
                    ),
                  },
                ]}
              />
            )}
          </section>
        </>
      )}

      {tab === 'banks' && (
        <>
          <form
            onSubmit={saveBank}
            className="card"
            style={{ display: 'grid', gap: '0.75rem', marginBottom: '1.25rem' }}
          >
            <h2 style={{ fontSize: '1.05rem' }}>
              {editingBankId ? 'Редагувати рахунок' : 'Новий рахунок'}
            </h2>
            <div>
              <label>Банк</label>
              <input
                value={bankForm.bankName}
                onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })}
                required
                placeholder="ПриватБанк"
              />
            </div>
            <div>
              <label>IBAN</label>
              <input
                value={bankForm.iban}
                onChange={(e) => setBankForm({ ...bankForm, iban: e.target.value })}
                required
                placeholder="UA…"
              />
            </div>
            <div>
              <label>Опис</label>
              <input
                value={bankForm.description}
                onChange={(e) => setBankForm({ ...bankForm, description: e.target.value })}
                placeholder="Основний рахунок"
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit">{editingBankId ? 'Зберегти' : 'Додати'}</button>
              {editingBankId && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setEditingBankId(null);
                    setBankForm({ bankName: '', iban: '', description: '' });
                  }}
                >
                  Скасувати
                </button>
              )}
            </div>
          </form>

          <section className="card">
            {banks.length === 0 ? (
              <EmptyState title="Рахунків немає" description="Додайте IBAN для оплати внесків." />
            ) : (
              <ul style={{ listStyle: 'none', display: 'grid', gap: '0.75rem' }}>
                {banks.map((b) => (
                  <li
                    key={b.id}
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
                      <div style={{ fontWeight: 600 }}>{b.bankName}</div>
                      <div
                        style={{
                          fontFamily: 'ui-monospace, monospace',
                          fontSize: '0.9rem',
                          wordBreak: 'break-all',
                        }}
                      >
                        {b.iban}
                      </div>
                      {b.description && (
                        <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{b.description}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => {
                          setEditingBankId(b.id);
                          setBankForm({
                            bankName: b.bankName,
                            iban: b.iban,
                            description: b.description ?? '',
                          });
                        }}
                      >
                        Редагувати
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => deleteBank(b.id)}
                      >
                        Видалити
                      </button>
                    </div>
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
