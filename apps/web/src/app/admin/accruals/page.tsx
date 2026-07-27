'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, getToken } from '@/lib/api';
import { downloadAuthFile } from '@/lib/download';
import { formatMoney } from '@/lib/money';

interface Fund {
  id: string;
  name: string;
}
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
  meterConsumption?: number;
}

type Distribution = 'by_area' | 'fixed_per_apartment' | 'manual' | 'by_meter';
type Step = 1 | 2 | 3 | 4;

const STEPS: { id: Step; label: string }[] = [
  { id: 1, label: 'Параметри' },
  { id: 2, label: 'Перегляд' },
  { id: 3, label: 'Підтвердження' },
  { id: 4, label: 'Готово' },
];

export default function AccrualsPage() {
  const [step, setStep] = useState<Step>(1);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [fundId, setFundId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [title, setTitle] = useState('Внесок на утримання');
  const [distribution, setDistribution] = useState<Distribution>('by_area');
  const [rate, setRate] = useState('8.5');
  const [fixedAmount, setFixedAmount] = useState('450');
  const [meterType, setMeterType] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [preview, setPreview] = useState<ApartmentPreview[]>([]);
  const [manualAmounts, setManualAmounts] = useState<Record<string, string>>({});
  const [createdId, setCreatedId] = useState<string | null>(null);
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

  function buildPayload() {
    const payload: Record<string, unknown> = {
      fundId,
      period,
      title,
      distribution,
      dueDate: dueDate || undefined,
      templateId: templateId || undefined,
    };
    if (distribution === 'by_area' || distribution === 'by_meter') payload.rate = Number(rate);
    if (distribution === 'fixed_per_apartment') payload.fixedAmount = Number(fixedAmount);
    if (distribution === 'by_meter' && meterType) payload.meterType = meterType;
    if (distribution === 'manual') {
      payload.manualLines = Object.entries(manualAmounts)
        .filter(([, v]) => v && Number(v) > 0)
        .map(([apartmentId, v]) => ({ apartmentId, amount: Number(v) }));
    }
    return payload;
  }

  async function loadPreview() {
    const token = getToken();
    if (!token) return;
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch<ApartmentPreview[]>('/accruals/preview', {
        method: 'POST',
        token,
        body: JSON.stringify(buildPayload()),
      });
      setPreview(data);
      if (distribution === 'manual') {
        const amounts: Record<string, string> = {};
        data.forEach((row) => {
          amounts[row.apartmentId] = manualAmounts[row.apartmentId] ?? String(row.amount || '');
        });
        setManualAmounts(amounts);
      }
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setLoading(false);
    }
  }

  async function saveAsTemplate() {
    const token = getToken();
    if (!token) return;
    if (distribution === 'manual') {
      setError('Шаблон не підтримує ручний розподіл');
      return;
    }
    setError('');
    try {
      await apiFetch('/accruals/templates', {
        method: 'POST',
        token,
        body: JSON.stringify({
          fundId,
          name: title,
          distribution,
          rate: distribution === 'by_area' ? Number(rate) : undefined,
          fixedAmount: distribution === 'fixed_per_apartment' ? Number(fixedAmount) : undefined,
        }),
      });
      setMessage('Шаблон збережено');
      const t = await apiFetch<Template[]>('/accruals/templates', { token });
      setTemplates(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка шаблону');
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
      const created = await apiFetch<{ id: string }>('/accruals', {
        method: 'POST',
        token,
        body: JSON.stringify(buildPayload()),
      });
      setCreatedId(created.id);
      setMessage('Нарахування проведено');
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setLoading(false);
    }
  }

  function resetWizard() {
    setStep(1);
    setPreview([]);
    setCreatedId(null);
    setMessage('');
    setError('');
  }

  const previewTotal = preview.reduce((s, r) => {
    if (distribution === 'manual') {
      return s + Number(manualAmounts[r.apartmentId] || 0);
    }
    return s + r.amount;
  }, 0);

  const fundName = funds.find((f) => f.id === fundId)?.name ?? '';

  return (
    <main>
      <PageHeader
        title="Нарахування внесків"
        description="Майстер: параметри → перегляд → підтвердження → квитанції"
        actions={
          <Link href="/admin/accruals/list" className="btn btn-sm btn-ghost">
            Історія
          </Link>
        }
      />

      <div className="setup-steps" style={{ marginBottom: '1.25rem' }}>
        {STEPS.map((s) => (
          <span
            key={s.id}
            className={`setup-step-pill${step === s.id ? ' active' : ''}${step > s.id ? ' done' : ''}`}
          >
            {s.id}. {s.label}
          </span>
        ))}
      </div>

      {error && <p className="error" style={{ marginBottom: '0.75rem' }}>{error}</p>}
      {message && step !== 4 && <p className="success-banner">{message}</p>}

      {step === 1 && (
        <section className="card" style={{ display: 'grid', gap: '1rem' }}>
          <div>
            <label>Шаблон</label>
            <select value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
              <option value="">— без шаблону —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.distribution})
                </option>
              ))}
            </select>
          </div>
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
              <label>Період</label>
              <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} required />
            </div>
          </div>
          <div>
            <label>Назва нарахування</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <label>Тип розподілу</label>
            <select
              value={distribution}
              onChange={(e) => {
                setDistribution(e.target.value as Distribution);
                setPreview([]);
              }}
            >
              <option value="by_area">По площі (грн/м²)</option>
              <option value="fixed_per_apartment">Фіксована сума на квартиру</option>
              <option value="by_meter">За лічильниками (грн/од.)</option>
              <option value="manual">Вручну по квартирах</option>
            </select>
          </div>
          {(distribution === 'by_area' || distribution === 'by_meter') && (
            <div>
              <label>{distribution === 'by_meter' ? 'Тариф (грн/од.)' : 'Тариф (грн/м²)'}</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                required
              />
            </div>
          )}
          {distribution === 'by_meter' && (
            <div>
              <label>Тип лічильника (опційно)</label>
              <select value={meterType} onChange={(e) => setMeterType(e.target.value)}>
                <option value="">Усі типи</option>
                <option value="cold_water">Холодна вода</option>
                <option value="hot_water">Гаряча вода</option>
                <option value="heating">Опалення</option>
                <option value="electricity">Електроенергія</option>
                <option value="other">Інше</option>
              </select>
              <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: 4 }}>
                Споживання береться з показників за обраний період (див. «Лічильники»).
              </p>
            </div>
          )}
          {distribution === 'fixed_per_apartment' && (
            <div>
              <label>Сума на квартиру (₴)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={fixedAmount}
                onChange={(e) => setFixedAmount(e.target.value)}
                required
              />
            </div>
          )}
          <div>
            <label>Термін оплати</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button type="button" onClick={loadPreview} disabled={loading || !fundId || !title}>
              {loading ? 'Розрахунок…' : 'Далі: попередній перегляд'}
            </button>
            {distribution !== 'manual' && (
              <button type="button" className="btn btn-ghost" onClick={saveAsTemplate}>
                Зберегти як шаблон
              </button>
            )}
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="card">
          <h2 style={{ marginBottom: '0.75rem', fontSize: '1.1rem' }}>
            Перегляд · {preview.length} кв. · {formatMoney(previewTotal)}
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
            {title} · {period} · {fundName}
          </p>
          <div style={{ maxHeight: 360, overflowY: 'auto', marginBottom: '1rem' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Кв.</th>
                  <th>Під&apos;їзд</th>
                  <th>м²</th>
                  <th>Сума</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row) => (
                  <tr key={row.apartmentId}>
                    <td>{row.number}</td>
                    <td>{row.entrance}</td>
                    <td>{row.area}</td>
                    <td>
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
                        formatMoney(row.amount)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>
              Назад
            </button>
            <button type="button" onClick={() => setStep(3)} disabled={preview.length === 0 || previewTotal <= 0}>
              Далі: підтвердження
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <form onSubmit={handleSubmit} className="card" style={{ display: 'grid', gap: '1rem' }}>
          <h2 style={{ fontSize: '1.1rem' }}>Підтвердження</h2>
          <ul style={{ listStyle: 'none', display: 'grid', gap: '0.35rem', color: 'var(--muted)' }}>
            <li>
              <strong style={{ color: 'var(--text)' }}>{title}</strong>
            </li>
            <li>Період: {period}</li>
            <li>Фонд: {fundName}</li>
            <li>Квартир: {preview.length}</li>
            <li>
              Разом: <strong style={{ color: 'var(--text)' }}>{formatMoney(previewTotal)}</strong>
            </li>
            {dueDate && <li>Термін: {dueDate}</li>}
          </ul>
          <p style={{ fontSize: '0.9rem' }}>
            Після підтвердження мешканцям піде email (якщо увімкнено сповіщення), зʼявляться рядки
            особових рахунків.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setStep(2)}>
              Назад
            </button>
            <button type="submit" disabled={loading}>
              {loading ? 'Проведення…' : 'Провести нарахування'}
            </button>
          </div>
        </form>
      )}

      {step === 4 && (
        <section className="card" style={{ display: 'grid', gap: '1rem' }}>
          <h2 style={{ fontSize: '1.15rem', color: 'var(--success)' }}>Готово</h2>
          <p>
            Нарахування <strong>{title}</strong> за {period} проведено
            {createdId ? ` (id …${createdId.slice(-6)})` : ''}.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {createdId && (
              <>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() =>
                    downloadAuthFile(`/accruals/${createdId}/receipts.pdf`, 'kvytantsii.pdf').catch(
                      (e) => setError(e.message),
                    )
                  }
                >
                  PDF квитанції
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() =>
                    downloadAuthFile(`/accruals/${createdId}/receipts.zip`, 'kvytantsii.zip').catch(
                      (e) => setError(e.message),
                    )
                  }
                >
                  ZIP
                </button>
              </>
            )}
            <Link href="/admin/accruals/list" className="btn btn-sm btn-ghost">
              Історія нарахувань
            </Link>
            <button type="button" className="btn btn-sm btn-ghost" onClick={resetWizard}>
              Нове нарахування
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
