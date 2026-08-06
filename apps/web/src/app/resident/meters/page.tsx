'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonCards } from '@/components/ui/Skeleton';
import { apiFetch, getToken } from '@/lib/api';
import { onApartmentChange, resolveResidentApartmentId } from '@/lib/apartment-context';
import { meterTypeLabel } from '@/lib/i18n';
import {
  currentPeriodYm,
  formatPeriodLabel,
  getMetersDeadlineInfo,
} from '@/lib/meters-deadline';
import {
  countQueuedMeterReadings,
  enqueueMeterReading,
  flushMeterOfflineQueue,
  isBrowserOffline,
  listQueuedMeterReadings,
  METER_QUEUE_EVENT,
  type QueuedMeterReading,
} from '@/lib/meter-offline-queue';

interface Meter {
  id: string;
  name: string;
  type: string;
  unit: string;
  isActive: boolean;
  readings: Array<{ period: string; value: string | number; consumption: string | number }>;
}

export default function ResidentMetersPage() {
  const { t, locale } = useI18n();
  const [meters, setMeters] = useState<Meter[]>([]);
  const [apartmentId, setApartmentId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [period, setPeriod] = useState(currentPeriodYm());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [flushing, setFlushing] = useState(false);
  const [deadlineDay, setDeadlineDay] = useState(5);
  const [offline, setOffline] = useState(false);
  const [queue, setQueue] = useState<QueuedMeterReading[]>([]);

  const refreshQueue = useCallback((aptId?: string) => {
    const id = aptId ?? resolveResidentApartmentId();
    setQueue(listQueuedMeterReadings(id || undefined));
  }, []);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    const aptId = resolveResidentApartmentId();
    if (!aptId) {
      setError(t('residentMetersNoApt'));
      setApartmentId('');
      setMeters([]);
      setLoading(false);
      return;
    }
    setApartmentId(aptId);
    setLoading(true);
    try {
      const [list, settings] = await Promise.all([
        apiFetch<Meter[]>(`/meters/apartment/${aptId}`, { token }),
        apiFetch<{ metersReadingDeadlineDay?: number }>('/building/settings', { token }).catch(
          () => ({ metersReadingDeadlineDay: 5 }),
        ),
      ]);
      setDeadlineDay(settings.metersReadingDeadlineDay ?? 5);
      const active = list.filter((m) => m.isActive);
      setMeters(active);
      setValues({});
      setError('');
      refreshQueue(aptId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setLoading(false);
    }
  }, [t, refreshQueue]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return onApartmentChange(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    const syncOnline = () => setOffline(isBrowserOffline());
    syncOnline();
    window.addEventListener('online', syncOnline);
    window.addEventListener('offline', syncOnline);
    const onQueue = () => refreshQueue();
    window.addEventListener(METER_QUEUE_EVENT, onQueue);
    return () => {
      window.removeEventListener('online', syncOnline);
      window.removeEventListener('offline', syncOnline);
      window.removeEventListener(METER_QUEUE_EVENT, onQueue);
    };
  }, [refreshQueue]);

  // Auto-flush when back online
  useEffect(() => {
    async function onOnline() {
      setOffline(false);
      const token = getToken();
      const aptId = resolveResidentApartmentId();
      if (!token || !aptId || countQueuedMeterReadings(aptId) === 0) return;
      setFlushing(true);
      try {
        const result = await flushMeterOfflineQueue(
          async (meterId, body) => {
            await apiFetch(`/meters/${meterId}/readings/self`, {
              method: 'POST',
              token,
              body: JSON.stringify(body),
            });
          },
          { apartmentId: aptId },
        );
        if (result.sent > 0) {
          setMessage(t('residentMetersFlushOk', { count: result.sent }));
          await load();
        }
        if (result.failed > 0) {
          setError(result.errors.join('; ') || t('residentMetersFlushFail'));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t('error'));
      } finally {
        setFlushing(false);
        refreshQueue(aptId);
      }
    }
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [load, refreshQueue, t]);

  const deadline = useMemo(() => getMetersDeadlineInfo(deadlineDay), [deadlineDay]);
  const periodLabel = formatPeriodLabel(period);

  function prevValue(m: Meter): number | null {
    const other = m.readings.find((r) => r.period !== period) ?? m.readings[1];
    if (!other) return null;
    const n = Number(other.value);
    return Number.isFinite(n) ? n : null;
  }

  function alreadySent(m: Meter): boolean {
    if (m.readings.some((r) => r.period === period)) return true;
    return queue.some((q) => q.meterId === m.id && q.period === period);
  }

  function queuedValue(m: Meter): number | null {
    const q = queue.find((x) => x.meterId === m.id && x.period === period);
    return q ? q.value : null;
  }

  async function submitBatch(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setError('');
    setMessage('');

    const toSend = meters.filter((m) => {
      if (m.readings.some((r) => r.period === period)) return false;
      const v = values[m.id]?.trim();
      return v !== '' && v !== undefined;
    });

    if (toSend.length === 0) {
      setError(t('residentMetersBatchEmpty'));
      return;
    }

    for (const m of toSend) {
      const value = Number(values[m.id].replace(',', '.'));
      if (!Number.isFinite(value) || value < 0) {
        setError(t('residentMetersInvalidValue'));
        return;
      }
      const prev = prevValue(m);
      if (prev != null && value < prev) {
        setError(
          t('residentMetersLessThanPrevNamed', {
            name: m.name,
            prev: String(prev),
            unit: m.unit,
          }),
        );
        return;
      }
    }

    // Offline → queue
    if (isBrowserOffline()) {
      for (const m of toSend) {
        const value = Number(values[m.id].replace(',', '.'));
        enqueueMeterReading({
          meterId: m.id,
          meterName: m.name,
          apartmentId,
          period,
          value,
          unit: m.unit,
        });
      }
      setMessage(t('residentMetersQueued', { count: toSend.length }));
      setValues((prev) => {
        const next = { ...prev };
        for (const m of toSend) next[m.id] = '';
        return next;
      });
      refreshQueue(apartmentId);
      return;
    }

    setSubmitting(true);
    const results: string[] = [];
    try {
      for (const m of toSend) {
        const value = Number(values[m.id].replace(',', '.'));
        try {
          await apiFetch(`/meters/${m.id}/readings/self`, {
            method: 'POST',
            token,
            body: JSON.stringify({ period, value }),
          });
          results.push(m.name);
        } catch (err) {
          // Network-ish failure → queue remaining including this one
          const msg = err instanceof Error ? err.message : '';
          if (/мереж|network|Failed to fetch|зв.?язку|offline/i.test(msg) || isBrowserOffline()) {
            enqueueMeterReading({
              meterId: m.id,
              meterName: m.name,
              apartmentId,
              period,
              value,
              unit: m.unit,
            });
            for (const rest of toSend.slice(toSend.indexOf(m) + 1)) {
              const v = Number(values[rest.id].replace(',', '.'));
              enqueueMeterReading({
                meterId: rest.id,
                meterName: rest.name,
                apartmentId,
                period,
                value: v,
                unit: rest.unit,
              });
            }
            setMessage(
              t('residentMetersPartialQueued', {
                sent: results.length,
                queued: toSend.length - results.length,
              }),
            );
            setValues({});
            refreshQueue(apartmentId);
            await load();
            return;
          }
          throw err;
        }
      }
      setMessage(t('residentMetersBatchOk', { count: results.length }));
      setValues((prev) => {
        const next = { ...prev };
        for (const m of toSend) next[m.id] = '';
        return next;
      });
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message}${results.length ? ` (${t('residentMetersPartial', { names: results.join(', ') })})` : ''}`
          : t('error'),
      );
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  async function flushNow() {
    const token = getToken();
    if (!token || !apartmentId) return;
    setFlushing(true);
    setError('');
    try {
      const result = await flushMeterOfflineQueue(
        async (meterId, body) => {
          await apiFetch(`/meters/${meterId}/readings/self`, {
            method: 'POST',
            token,
            body: JSON.stringify(body),
          });
        },
        { apartmentId },
      );
      if (result.sent > 0) {
        setMessage(t('residentMetersFlushOk', { count: result.sent }));
        await load();
      }
      if (result.failed > 0) {
        setError(result.errors.join('; ') || t('residentMetersFlushFail'));
      }
      if (result.sent === 0 && result.failed === 0) {
        setMessage(t('residentMetersQueueEmpty'));
      }
    } finally {
      setFlushing(false);
      refreshQueue(apartmentId);
    }
  }

  const pendingCount = meters.filter((m) => !alreadySent(m)).length;
  const queueCount = queue.length;

  return (
    <main>
      <Link href="/resident" style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
        {t('residentBackCabinet')}
      </Link>
      <PageHeader
        title={t('residentMetersTitle')}
        description={
          apartmentId ? t('residentMetersDescPeriod', { period: periodLabel }) : undefined
        }
      />

      {!apartmentId && !loading && (
        <EmptyState
          title={t('residentNoApartmentTitle')}
          description={t('residentNoApartmentDesc')}
        />
      )}

      {offline && (
        <p className="card meters-offline-banner" role="status">
          {t('residentMetersOfflineBanner')}
        </p>
      )}

      {queueCount > 0 && (
        <div className="card meters-queue-banner" role="status">
          <strong>{t('residentMetersQueueCount', { count: queueCount })}</strong>
          <ul className="resident-muted resident-sm" style={{ margin: '0.35rem 0' }}>
            {queue.map((q) => (
              <li key={q.id}>
                {q.meterName}: {q.value} ({formatPeriodLabel(q.period)})
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn btn-sm"
            disabled={flushing || offline}
            onClick={() => void flushNow()}
          >
            {flushing ? t('loading') : t('residentMetersFlushNow')}
          </button>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {message && <p className="success-banner">{message}</p>}
      {loading && <SkeletonCards count={1} />}

      {apartmentId && !loading && meters.length === 0 && (
        <EmptyState
          title={t('residentMetersEmpty')}
          description={t('residentMetersEmptyDesc')}
        />
      )}

      {meters.length > 0 && (
        <>
          {(deadline.inWindow || deadline.overdue) && pendingCount > 0 && (
            <div
              className={`card meters-deadline-banner${deadline.overdue ? ' is-overdue' : ''}`}
              style={{ marginBottom: '1rem' }}
            >
              <strong>
                {deadline.overdue
                  ? t('residentMetersDeadlineOverdue', {
                      day: deadline.deadlineDay,
                      period: periodLabel,
                    })
                  : t('residentMetersDeadlineBanner', {
                      day: deadline.deadlineDay,
                      days: Math.max(0, deadline.daysLeft),
                      period: periodLabel,
                    })}
              </strong>
              <p className="resident-muted resident-sm" style={{ margin: '0.35rem 0 0' }}>
                {t('residentMetersPendingCount', { count: pendingCount })}
              </p>
            </div>
          )}

          <form onSubmit={submitBatch} className="card resident-meters-form">
            <h2 style={{ fontSize: '1.05rem', marginBottom: '0.5rem' }}>
              {t('residentMetersBatchTitle')}
            </h2>
            <div className="resident-meters-period-badge" style={{ marginBottom: '1rem' }}>
              {t('residentMetersPeriodAuto', { period: periodLabel })}
            </div>

            <ul className="resident-meters-batch-list">
              {meters.map((m) => {
                const prev = prevValue(m);
                const done = alreadySent(m);
                const current = m.readings.find((r) => r.period === period);
                const queued = queuedValue(m);
                return (
                  <li
                    key={m.id}
                    className={`resident-meter-card${done ? ' is-done' : ' needs-reading'}${queued != null ? ' is-queued' : ''}`}
                  >
                    <div className="resident-meters-batch-head">
                      <div>
                        <strong>{m.name}</strong>{' '}
                        <span className="resident-muted resident-sm">
                          {meterTypeLabel(m.type, locale)} · {m.unit}
                        </span>
                      </div>
                      {queued != null && (
                        <span className="badge badge-warning">{t('residentMetersQueuedBadge')}</span>
                      )}
                      {done && queued == null && (
                        <span className="badge badge-success">{t('residentMetersPeriodDone')}</span>
                      )}
                    </div>
                    {prev != null && (
                      <div className="resident-muted resident-sm" style={{ marginTop: 4 }}>
                        {t('residentMetersPrevLabel')}: {prev} {m.unit}
                      </div>
                    )}
                    {queued != null ? (
                      <div style={{ marginTop: 6, fontWeight: 600 }}>
                        {queued} {m.unit}{' '}
                        <span className="resident-muted resident-sm">
                          ({t('residentMetersAwaitingSync')})
                        </span>
                      </div>
                    ) : done && current ? (
                      <div style={{ marginTop: 6, fontWeight: 600 }}>
                        {current.value} {m.unit}
                        {current.consumption != null && current.consumption !== '' && (
                          <span className="resident-muted">
                            {' '}
                            · {t('residentMetersConsumption')} {current.consumption}
                          </span>
                        )}
                      </div>
                    ) : (
                      <label className="resident-meters-batch-input">
                        <span className="sr-only">{t('metersValue')}</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.001"
                          min={prev ?? 0}
                          value={values[m.id] ?? ''}
                          placeholder={prev != null ? String(prev) : t('metersValue')}
                          onChange={(e) =>
                            setValues((v) => ({ ...v, [m.id]: e.target.value }))
                          }
                          autoComplete="off"
                        />
                        <span className="resident-muted">{m.unit}</span>
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>

            <details className="resident-meters-advanced" style={{ marginTop: '0.75rem' }}>
              <summary>{t('residentMetersOtherPeriod')}</summary>
              <label htmlFor="meter-period">{t('metersPeriod')}</label>
              <input
                id="meter-period"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                pattern="\d{4}-\d{2}"
                placeholder="YYYY-MM"
              />
            </details>

            <button
              type="submit"
              className="btn"
              style={{ marginTop: '1rem', width: '100%', minHeight: 48 }}
              disabled={submitting || pendingCount === 0}
            >
              {submitting
                ? t('loading')
                : offline
                  ? t('residentMetersSaveOffline', { count: pendingCount })
                  : pendingCount === 0
                    ? t('residentMetersAllDone')
                    : t('residentMetersSendAll', { count: pendingCount })}
            </button>
          </form>
        </>
      )}
    </main>
  );
}
