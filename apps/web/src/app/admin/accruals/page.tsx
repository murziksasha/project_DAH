'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, getToken } from '@/lib/api';
import { downloadAuthFile } from '@/lib/download';
import { meterTypeLabel } from '@/lib/i18n';
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

export default function AccrualsPage() {
  const { t, locale } = useI18n();
  const [step, setStep] = useState<Step>(1);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [fundId, setFundId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [title, setTitle] = useState('');
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
  const [titleTouched, setTitleTouched] = useState(false);

  const steps = useMemo(
    () =>
      [
        { id: 1 as Step, label: t('accrualStepParams') },
        { id: 2 as Step, label: t('accrualStepPreview') },
        { id: 3 as Step, label: t('accrualStepConfirm') },
        { id: 4 as Step, label: t('accrualStepDone') },
      ] as const,
    [t],
  );

  useEffect(() => {
    if (!titleTouched) {
      setTitle(t('accrualDefaultTitle'));
    }
  }, [t, titleTouched]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    Promise.all([
      apiFetch<Fund[]>('/finance/funds', { token }),
      apiFetch<Template[]>('/accruals/templates', { token }),
    ]).then(([f, tpl]) => {
      setFunds(f);
      setTemplates(tpl);
      if (f[0]) setFundId(f[0].id);
    });
  }, []);

  function applyTemplate(id: string) {
    setTemplateId(id);
    if (!id) return;
    const tpl = templates.find((x) => x.id === id);
    if (!tpl) return;
    setFundId(tpl.fundId);
    setTitle(tpl.name);
    setTitleTouched(true);
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
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setLoading(false);
    }
  }

  async function saveAsTemplate() {
    const token = getToken();
    if (!token) return;
    if (distribution === 'manual') {
      setError(t('accrualTemplateManualError'));
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
      setMessage(t('accrualTemplateSaved'));
      const tpl = await apiFetch<Template[]>('/accruals/templates', { token });
      setTemplates(tpl);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('accrualTemplateError'));
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
      setMessage(t('accrualPosted'));
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
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
        title={t('accrualsWizardTitle')}
        description={t('accrualsWizardDesc')}
        actions={
          <Link href="/admin/accruals/list" className="btn btn-sm btn-ghost">
            {t('accrualHistory')}
          </Link>
        }
      />

      <div className="setup-steps" style={{ marginBottom: '1.25rem' }}>
        {steps.map((s) => (
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
            <label>{t('accrualTemplate')}</label>
            <select value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
              <option value="">{t('accrualNoTemplate')}</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name} ({tpl.distribution})
                </option>
              ))}
            </select>
          </div>
          <div className="grid-2">
            <div>
              <label>{t('expenseFund')}</label>
              <select value={fundId} onChange={(e) => setFundId(e.target.value)} required>
                {funds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>{t('accrualPeriodShort')}</label>
              <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} required />
            </div>
          </div>
          <div>
            <label>{t('accrualName')}</label>
            <input
              value={title}
              onChange={(e) => {
                setTitleTouched(true);
                setTitle(e.target.value);
              }}
              required
            />
          </div>
          <div>
            <label>{t('accrualDist')}</label>
            <select
              value={distribution}
              onChange={(e) => {
                setDistribution(e.target.value as Distribution);
                setPreview([]);
              }}
            >
              <option value="by_area">{t('accrualByArea')}</option>
              <option value="fixed_per_apartment">{t('accrualFixed')}</option>
              <option value="by_meter">{t('accrualByMeter')}</option>
              <option value="manual">{t('accrualManualApts')}</option>
            </select>
          </div>
          {(distribution === 'by_area' || distribution === 'by_meter') && (
            <div>
              <label>{distribution === 'by_meter' ? t('accrualRateUnit') : t('accrualRate')}</label>
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
              <label>{t('accrualMeterTypeOptional')}</label>
              <select value={meterType} onChange={(e) => setMeterType(e.target.value)}>
                <option value="">{t('allTypes')}</option>
                <option value="cold_water">{meterTypeLabel('cold_water', locale)}</option>
                <option value="hot_water">{meterTypeLabel('hot_water', locale)}</option>
                <option value="heating">{meterTypeLabel('heating', locale)}</option>
                <option value="electricity">{meterTypeLabel('electricity', locale)}</option>
                <option value="other">{meterTypeLabel('other', locale)}</option>
              </select>
              <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: 4 }}>
                {t('accrualMeterHint')}
              </p>
            </div>
          )}
          {distribution === 'fixed_per_apartment' && (
            <div>
              <label>{t('accrualFixedAmountUah')}</label>
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
            <label>{t('accrualDueDate')}</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button type="button" onClick={loadPreview} disabled={loading || !fundId || !title}>
              {loading ? t('calculating') : t('accrualNextPreview')}
            </button>
            {distribution !== 'manual' && (
              <button type="button" className="btn btn-ghost" onClick={saveAsTemplate}>
                {t('accrualSaveTemplate')}
              </button>
            )}
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="card">
          <h2 style={{ marginBottom: '0.75rem', fontSize: '1.1rem' }}>
            {t('accrualPreviewHead', { count: preview.length, total: formatMoney(previewTotal) })}
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
            {title} · {period} · {fundName}
          </p>
          <div style={{ maxHeight: 360, overflowY: 'auto', marginBottom: '1rem' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('metersColApt')}</th>
                  <th>{t('entrance')}</th>
                  <th>{t('sqm')}</th>
                  <th>{t('amount')}</th>
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
              {t('back')}
            </button>
            <button type="button" onClick={() => setStep(3)} disabled={preview.length === 0 || previewTotal <= 0}>
              {t('accrualNextConfirm')}
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <form onSubmit={handleSubmit} className="card" style={{ display: 'grid', gap: '1rem' }}>
          <h2 style={{ fontSize: '1.1rem' }}>{t('accrualStepConfirm')}</h2>
          <ul style={{ listStyle: 'none', display: 'grid', gap: '0.35rem', color: 'var(--muted)' }}>
            <li>
              <strong style={{ color: 'var(--text)' }}>{title}</strong>
            </li>
            <li>{t('accrualPeriodValue', { period })}</li>
            <li>{t('accrualFundValue', { name: fundName })}</li>
            <li>{t('accrualAptsCount', { count: preview.length })}</li>
            <li>
              {t('total')}: <strong style={{ color: 'var(--text)' }}>{formatMoney(previewTotal)}</strong>
            </li>
            {dueDate && <li>{t('accrualDueValue', { date: dueDate })}</li>}
          </ul>
          <p style={{ fontSize: '0.9rem' }}>{t('accrualConfirmEmail')}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setStep(2)}>
              {t('back')}
            </button>
            <button type="submit" disabled={loading}>
              {loading ? t('accrualPosting') : t('accrualPostConfirm')}
            </button>
          </div>
        </form>
      )}

      {step === 4 && (
        <section className="card" style={{ display: 'grid', gap: '1rem' }}>
          <h2 style={{ fontSize: '1.15rem', color: 'var(--success)' }}>{t('accrualStepDone')}</h2>
          <p>
            {t('accrualDoneMsg', { title, period })}
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
                  {t('accrualReceiptsPdf')}
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
                  {t('accrualDownloadZip')}
                </button>
              </>
            )}
            <Link href="/admin/accruals/list" className="btn btn-sm btn-ghost">
              {t('accrualListTitle')}
            </Link>
            <button type="button" className="btn btn-sm btn-ghost" onClick={resetWizard}>
              {t('accrualNew')}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
