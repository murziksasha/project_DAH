'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { apiFetch, getToken } from '@/lib/api';

interface Fund { id: string; name: string }
interface Template {
  id: string;
  name: string;
  distribution: string;
  rate: string | null;
  fixedAmount: string | null;
  fundId: string;
}
interface ApartmentPreview {
  apartmentId: string;
  number: string;
  entrance: number;
  area: number;
  amount: number;
}

type Distribution = 'by_area' | 'fixed_per_apartment' | 'manual';

export default function AccrualsPage() {
  const [funds, setFunds] = useState<Fund[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [fundId, setFundId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [title, setTitle] = useState('Внесок на утримання');
  const [distribution, setDistribution] = useState<Distribution>('by_area');
  const [rate, setRate] = useState('8.5');
  const [fixedAmount, setFixedAmount] = useState('450');
  const [dueDate, setDueDate] = useState('');
  const [preview, setPreview] = useState<ApartmentPreview[]>([]);
  const [manualAmounts, setManualAmounts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    Promise.all([
      apiFetch<Fund[]>('/finance/funds', { token }),
      apiFetch<Template[]>('/accruals/templates', { token }),
    ]).then(([f, t]) => {
      setFunds(f);
      setTemplates(t);
      if (f[0]) setFundId(f[0].id);
    });
  }, []);

  function applyTemplate(id: string) {
    setTemplateId(id);
    if (!id) return;
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setFundId(tpl.fundId);
    setTitle(tpl.name);
    setDistribution(tpl.distribution as Distribution);
    if (tpl.rate) setRate(String(tpl.rate));
    if (tpl.fixedAmount) setFixedAmount(String(tpl.fixedAmount));
  }

  async function loadPreview() {
    const token = getToken();
    if (!token) return;
    setError('');
    try {
      const body = buildPayload();
      const data = await apiFetch<ApartmentPreview[]>('/accruals/preview', {
        method: 'POST',
        token,
        body: JSON.stringify(body),
      });
      setPreview(data);
      if (distribution === 'manual') {
        const amounts: Record<string, string> = {};
        data.forEach((row) => {
          amounts[row.apartmentId] = manualAmounts[row.apartmentId] ?? String(row.amount || '');
        });
        setManualAmounts(amounts);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  function buildPayload() {
    const payload: Record<string, unknown> = {
      fundId,
      period,
      title,
      distribution,
      dueDate: dueDate || undefined,
      templateId: templateId || undefined,
    };
    if (distribution === 'by_area') payload.rate = Number(rate);
    if (distribution === 'fixed_per_apartment') payload.fixedAmount = Number(fixedAmount);
    if (distribution === 'manual') {
      payload.manualLines = Object.entries(manualAmounts)
        .filter(([, v]) => v && Number(v) > 0)
        .map(([apartmentId, v]) => ({ apartmentId, amount: Number(v) }));
    }
    return payload;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await apiFetch('/accruals', {
        method: 'POST',
        token,
        body: JSON.stringify(buildPayload()),
      });
      setMessage('Нарахування проведено для всіх квартир');
      setPreview([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setLoading(false);
    }
  }

  const previewTotal = preview.reduce((s, r) => {
    if (distribution === 'manual') {
      return s + Number(manualAmounts[r.apartmentId] || 0);
    }
    return s + r.amount;
  }, 0);

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '1rem' }}>
      <Link href="/admin" style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>← Дашборд</Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h1>Нарахування внесків</h1>
        <Link href="/admin/accruals/list" className="btn" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}>
          Історія
        </Link>
      </div>
      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>
        Масове або ручне нарахування по квартирах (як у ДАХ)
      </p>

      <form onSubmit={handleSubmit} className="card" style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <label>Шаблон</label>
          <select value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
            <option value="">— без шаблону —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name} ({t.distribution})</option>
            ))}
          </select>
        </div>
        <div className="grid-2">
          <div>
            <label>Фонд</label>
            <select value={fundId} onChange={(e) => setFundId(e.target.value)} required>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Період (YYYY-MM)</label>
            <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} required />
          </div>
        </div>
        <div>
          <label>Назва нарахування</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div>
          <label>Тип розподілу</label>
          <select value={distribution} onChange={(e) => setDistribution(e.target.value as Distribution)}>
            <option value="by_area">По площі (грн/м²)</option>
            <option value="fixed_per_apartment">Фіксована сума на квартиру</option>
            <option value="manual">Вручну по квартирах</option>
          </select>
        </div>
        {distribution === 'by_area' && (
          <div>
            <label>Тариф (грн/м²)</label>
            <input type="number" step="0.01" min="0.01" value={rate} onChange={(e) => setRate(e.target.value)} required />
          </div>
        )}
        {distribution === 'fixed_per_apartment' && (
          <div>
            <label>Сума на квартиру (₴)</label>
            <input type="number" step="0.01" min="0.01" value={fixedAmount} onChange={(e) => setFixedAmount(e.target.value)} required />
          </div>
        )}
        <div>
          <label>Термін оплати</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <button type="button" onClick={loadPreview} style={{ background: 'var(--surface-2)' }}>
          Попередній перегляд
        </button>
        {error && <p className="error">{error}</p>}
        {message && <p style={{ color: 'var(--success)' }}>{message}</p>}
        <button type="submit" disabled={loading || preview.length === 0}>
          {loading ? 'Проведення...' : 'Провести нарахування'}
        </button>
      </form>

      {preview.length > 0 && (
        <section className="card">
          <h2 style={{ marginBottom: '1rem' }}>
            Перегляд ({preview.length} кв.) · Разом: {previewTotal.toLocaleString('uk-UA')} ₴
          </h2>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem' }}>Кв.</th>
                  <th style={{ padding: '0.5rem' }}>Під&apos;їзд</th>
                  <th style={{ padding: '0.5rem' }}>м²</th>
                  <th style={{ padding: '0.5rem' }}>Сума ₴</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row) => (
                  <tr key={row.apartmentId} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.5rem' }}>{row.number}</td>
                    <td style={{ padding: '0.5rem' }}>{row.entrance}</td>
                    <td style={{ padding: '0.5rem' }}>{row.area}</td>
                    <td style={{ padding: '0.5rem' }}>
                      {distribution === 'manual' ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          style={{ width: 100, padding: '0.35rem' }}
                          value={manualAmounts[row.apartmentId] ?? ''}
                          onChange={(e) =>
                            setManualAmounts({ ...manualAmounts, [row.apartmentId]: e.target.value })
                          }
                        />
                      ) : (
                        row.amount.toLocaleString('uk-UA')
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}