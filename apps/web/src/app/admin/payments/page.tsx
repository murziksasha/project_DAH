'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, getToken } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { formatDateUk, formatMoney } from '@/lib/money';
import { useApartmentsQuery } from '@/lib/queries';

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

interface ImportRow {
  line: number;
  date: string | null;
  amount: number | null;
  reference: string;
  extractedApartment: string | null;
  apartmentId: string | null;
  apartmentNumber: string | null;
  status: 'matched' | 'unmatched' | 'skipped' | 'invalid';
  message?: string;
}

interface ImportPreview {
  rows: ImportRow[];
  summary: {
    total: number;
    matched: number;
    unmatched: number;
    skipped: number;
    invalid: number;
    totalAmount: number;
  };
}

type Tab = 'manual' | 'import' | 'history';

interface PaymentRow {
  id: string;
  amount: string | number;
  date: string;
  source: string;
  reference: string | null;
  apartment: { id: string; number: string };
  allocations: Array<{ amount: string | number }>;
}

const SAMPLE_CSV = `Дата;Сума;Призначення
01.03.2026;450,00;Оплата внесків, кв. 101
02.03.2026;500,00;Квартплата квартира 102
`;

export default function PaymentsPage() {
  const [tab, setTab] = useState<Tab>('manual');
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [apartmentQuery, setApartmentQuery] = useState('');
  const [apartmentId, setApartmentId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState<'bank' | 'cash' | 'transfer'>('bank');
  const [reference, setReference] = useState('');
  const [preview, setPreview] = useState<AllocationPreview | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [csvText, setCsvText] = useState('');
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importLoading, setImportLoading] = useState(false);

  const [history, setHistory] = useState<PaymentRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [histFrom, setHistFrom] = useState('');
  const [histTo, setHistTo] = useState('');

  const loadHistory = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setHistoryLoading(true);
    try {
      const qs = new URLSearchParams();
      if (histFrom) qs.set('from', histFrom);
      if (histTo) qs.set('to', histTo);
      const q = qs.toString();
      const data = await apiFetch<{ items: PaymentRow[] } | PaymentRow[]>(
        `/payments${q ? `?${q}` : ''}`,
        { token },
      );
      setHistory(Array.isArray(data) ? data : data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка історії');
    } finally {
      setHistoryLoading(false);
    }
  }, [histFrom, histTo]);

  const apartmentsQuery = useApartmentsQuery(Boolean(getToken()));

  useEffect(() => {
    if (!getToken()) {
      window.location.href = '/login';
      return;
    }
  }, []);

  useEffect(() => {
    const data = (apartmentsQuery.data ?? []) as Apartment[];
    setApartments(data);
    if (data[0] && !apartmentId) setApartmentId(data[0].id);
  }, [apartmentsQuery.data, apartmentId]);

  useEffect(() => {
    if (tab === 'history') {
      loadHistory().catch(() => undefined);
    }
  }, [tab, loadHistory]);

  const filteredApartments = useMemo(() => {
    const q = apartmentQuery.trim().toLowerCase();
    if (!q) return apartments;
    return apartments.filter(
      (a) =>
        a.number.toLowerCase().includes(q) ||
        String(a.entrance).includes(q) ||
        `кв. ${a.number}`.includes(q),
    );
  }, [apartments, apartmentQuery]);

  useEffect(() => {
    if (!filteredApartments.length) return;
    if (!filteredApartments.some((a) => a.id === apartmentId)) {
      setApartmentId(filteredApartments[0].id);
      setPreview(null);
    }
  }, [filteredApartments, apartmentId]);

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
      setMessage('Платіж зафіксовано та рознесено. Можна ввести наступний.');
      setAmount('');
      setReference('');
      setPreview(null);
      if (tab === 'history') await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setLoading(false);
    }
  }

  async function voidPayment(id: string) {
    const reason = window.prompt('Причина анулювання платежу?');
    if (!reason?.trim()) return;
    const token = getToken();
    if (!token) return;
    setVoidingId(id);
    setError('');
    try {
      await apiFetch(`/payments/${id}/void`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ reason: reason.trim() }),
      });
      setMessage('Платіж анульовано');
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка анулювання');
    } finally {
      setVoidingId(null);
    }
  }

  function exportHistoryCsv() {
    const rows: Array<Array<string | number>> = [
      ['Дата', 'Квартира', 'Сума', 'Джерело', 'Референс'],
      ...history.map((p) => [
        formatDateUk(p.date),
        p.apartment.number,
        Number(p.amount),
        p.source,
        p.reference ?? '',
      ]),
    ];
    downloadCsv(`platezhi-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  async function runImportPreview() {
    const token = getToken();
    if (!token || !csvText.trim()) {
      setError('Вставте або завантажте CSV');
      return;
    }
    setImportLoading(true);
    setError('');
    setMessage('');
    try {
      const data = await apiFetch<ImportPreview>('/payments/import/preview', {
        method: 'POST',
        token,
        body: JSON.stringify({ csv: csvText }),
      });
      setImportPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка розбору CSV');
      setImportPreview(null);
    } finally {
      setImportLoading(false);
    }
  }

  async function commitImport() {
    const token = getToken();
    if (!token || !importPreview) return;
    const rows = importPreview.rows
      .filter((r) => r.status === 'matched' && r.apartmentId && r.amount && r.date)
      .map((r) => ({
        apartmentId: r.apartmentId as string,
        amount: r.amount as number,
        date: r.date as string,
        reference: r.reference || undefined,
      }));
    if (!rows.length) {
      setError('Немає зіставлених рядків для імпорту');
      return;
    }
    setImportLoading(true);
    setError('');
    setMessage('');
    try {
      const result = await apiFetch<{
        created: number;
        failed: number;
        errors: Array<{ index: number; message: string }>;
      }>('/payments/import', {
        method: 'POST',
        token,
        body: JSON.stringify({ rows, source: 'bank' }),
      });
      setMessage(
        `Імпортовано: ${result.created}` +
          (result.failed ? `, помилок: ${result.failed}` : ''),
      );
      if (result.errors?.length) {
        setError(result.errors.map((e) => e.message).join('; '));
      }
      setImportPreview(null);
      setCsvText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка імпорту');
    } finally {
      setImportLoading(false);
    }
  }

  function onFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(String(reader.result ?? ''));
      setImportPreview(null);
    };
    reader.readAsText(file, 'UTF-8');
  }

  return (
    <main>
      <PageHeader
        title="Платежі"
        description="Реєстрація надходжень з розноскою FIFO або імпорт банківської виписки"
      />

      <nav className="nav-scroll" aria-label="Режим платежів">
        <button
          type="button"
          className={`tab-btn${tab === 'manual' ? ' active' : ''}`}
          onClick={() => setTab('manual')}
        >
          Один платіж
        </button>
        <button
          type="button"
          className={`tab-btn${tab === 'import' ? ' active' : ''}`}
          onClick={() => setTab('import')}
        >
          Імпорт CSV
        </button>
        <button
          type="button"
          className={`tab-btn${tab === 'history' ? ' active' : ''}`}
          onClick={() => setTab('history')}
        >
          Історія
        </button>
      </nav>

      {error && <p className="error" style={{ marginBottom: '0.75rem' }}>{error}</p>}
      {message && <p className="success-banner">{message}</p>}

      {tab === 'manual' && (
        <>
          <form onSubmit={handleSubmit} className="card" style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
            <div>
              <label htmlFor="apt-search">Пошук квартири</label>
              <input
                id="apt-search"
                value={apartmentQuery}
                onChange={(e) => setApartmentQuery(e.target.value)}
                placeholder="Номер квартири або під'їзд"
              />
            </div>
            <div>
              <label htmlFor="apt">Квартира</label>
              <select
                id="apt"
                value={apartmentId}
                onChange={(e) => {
                  setApartmentId(e.target.value);
                  setPreview(null);
                }}
                required
              >
                {filteredApartments.length === 0 && <option value="">Нічого не знайдено</option>}
                {filteredApartments.map((a) => (
                  <option key={a.id} value={a.id}>
                    кв. {a.number} (під&apos;їзд {a.entrance})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid-2">
              <div>
                <label htmlFor="amount">Сума (₴)</label>
                <input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setPreview(null);
                  }}
                  required
                />
              </div>
              <div>
                <label htmlFor="date">Дата</label>
                <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
            </div>
            <div>
              <label htmlFor="source">Джерело</label>
              <select id="source" value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
                <option value="bank">Банк</option>
                <option value="cash">Готівка</option>
                <option value="transfer">Переказ</option>
              </select>
            </div>
            <div>
              <label htmlFor="ref">Коментар / референс</label>
              <input
                id="ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="№ платіжки, призначення..."
              />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <button type="button" className="btn btn-ghost" onClick={loadPreview}>
                Попередній перегляд розноски
              </button>
              <button type="submit" disabled={loading || !preview}>
                {loading ? 'Збереження…' : 'Зафіксувати платіж'}
              </button>
            </div>
            {!preview && (
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                Спочатку натисніть «Попередній перегляд», потім зафіксуйте платіж.
              </p>
            )}
          </form>

          {preview && (
            <section className="card">
              <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Розноска (FIFO)</h2>
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                Кв. {preview.apartment.number} · Рознесено: {formatMoney(preview.totalAllocated)}
                {preview.advance > 0 && ` · Аванс: ${formatMoney(preview.advance)}`}
              </p>
              {preview.allocations.length === 0 ? (
                <p style={{ color: 'var(--muted)' }}>Немає відкритих нарахувань — вся сума буде авансом</p>
              ) : (
                <ul style={{ listStyle: 'none', display: 'grid', gap: '0.5rem' }}>
                  {preview.allocations.map((a) => (
                    <li
                      key={a.accrualLineId}
                      style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}
                    >
                      <span>
                        {a.period} — {a.title}
                      </span>
                      <span style={{ fontWeight: 600 }}>{formatMoney(a.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      {tab === 'import' && (
        <section className="card" style={{ display: 'grid', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Банківська виписка (CSV)</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
              Колонки: <strong>дата</strong>, <strong>сума</strong>, <strong>призначення</strong> (кома або
              крапка з комою). У призначенні має бути номер квартири: «кв. 101», «квартира 12».
              Від&apos;ємні суми пропускаються.
            </p>
          </div>

          <div>
            <label htmlFor="csv-file">Файл CSV</label>
            <input
              id="csv-file"
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <div>
            <label htmlFor="csv-text">Або вставте текст</label>
            <textarea
              id="csv-text"
              rows={8}
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value);
                setImportPreview(null);
              }}
              placeholder={SAMPLE_CSV}
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.85rem' }}
            />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setCsvText(SAMPLE_CSV)}>
              Приклад
            </button>
            <button type="button" onClick={runImportPreview} disabled={importLoading || !csvText.trim()}>
              {importLoading ? 'Обробка…' : 'Розібрати CSV'}
            </button>
            <button
              type="button"
              onClick={commitImport}
              disabled={importLoading || !importPreview || importPreview.summary.matched === 0}
            >
              Імпортувати зіставлені ({importPreview?.summary.matched ?? 0})
            </button>
          </div>

          {importPreview && (
            <>
              <div className="grid-2">
                <div className="card" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
                  <div className="stat-label">Зіставлено</div>
                  <div className="stat-value" style={{ fontSize: '1.25rem' }}>
                    {importPreview.summary.matched} / {importPreview.summary.total}
                  </div>
                </div>
                <div className="card" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
                  <div className="stat-label">Сума до імпорту</div>
                  <div className="stat-value" style={{ fontSize: '1.25rem', color: 'var(--success)' }}>
                    {formatMoney(importPreview.summary.totalAmount)}
                  </div>
                </div>
              </div>

              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Дата</th>
                      <th>Сума</th>
                      <th>Кв.</th>
                      <th>Статус</th>
                      <th>Призначення</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.rows.map((r) => (
                      <tr key={r.line}>
                        <td>{r.line}</td>
                        <td>{r.date ?? '—'}</td>
                        <td>{r.amount != null ? formatMoney(r.amount) : '—'}</td>
                        <td>{r.apartmentNumber ?? r.extractedApartment ?? '—'}</td>
                        <td>
                          <span
                            className={`badge badge-${
                              r.status === 'matched'
                                ? 'success'
                                : r.status === 'unmatched'
                                  ? 'warning'
                                  : r.status === 'invalid'
                                    ? 'danger'
                                    : 'muted'
                            }`}
                          >
                            {r.status === 'matched'
                              ? 'OK'
                              : r.status === 'unmatched'
                                ? 'Без кв.'
                                : r.status === 'skipped'
                                  ? 'Пропуск'
                                  : 'Помилка'}
                          </span>
                          {r.message && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
                              {r.message}
                            </div>
                          )}
                        </td>
                        <td style={{ maxWidth: 220, fontSize: '0.85rem' }}>{r.reference}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {tab === 'history' && (
        <section className="card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '0.75rem',
              flexWrap: 'wrap',
              marginBottom: '1rem',
            }}
          >
            <h2 style={{ fontSize: '1.1rem' }}>Останні платежі</h2>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => loadHistory()}>
                Оновити
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={exportHistoryCsv}
                disabled={!history.length}
              >
                CSV
              </button>
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '0.75rem',
              marginBottom: '1rem',
              alignItems: 'end',
            }}
          >
            <div>
              <label htmlFor="hf">Від</label>
              <input id="hf" type="date" value={histFrom} onChange={(e) => setHistFrom(e.target.value)} />
            </div>
            <div>
              <label htmlFor="ht">До</label>
              <input id="ht" type="date" value={histTo} onChange={(e) => setHistTo(e.target.value)} />
            </div>
            <button type="button" className="btn btn-sm" onClick={() => loadHistory()}>
              Застосувати
            </button>
          </div>
          {historyLoading ? (
            <p style={{ color: 'var(--muted)' }}>Завантаження…</p>
          ) : history.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>Платіжів ще немає</p>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Кв.</th>
                    <th>Сума</th>
                    <th>Джерело</th>
                    <th>Референс</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {history.map((p) => (
                    <tr key={p.id}>
                      <td>{formatDateUk(p.date)}</td>
                      <td>{p.apartment.number}</td>
                      <td style={{ fontWeight: 600 }}>{formatMoney(p.amount)}</td>
                      <td>{p.source}</td>
                      <td style={{ maxWidth: 160, fontSize: '0.85rem' }}>{p.reference ?? '—'}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          disabled={voidingId === p.id}
                          onClick={() => voidPayment(p.id)}
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
      )}
    </main>
  );
}
