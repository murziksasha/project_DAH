'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { apiFetch, getApiBaseUrl, getToken } from '@/lib/api';

interface MailStatus {
  smtpConfigured: boolean;
  appUrl: string;
  mode: string;
}

interface EmailLog {
  id: string;
  to: string;
  subject: string;
  template: string;
  status: string;
  createdAt: string;
}

interface HealthStatus {
  status: string;
  service: string;
  version?: string;
  db?: string;
  redis?: string;
  storage?: string;
  backup?: {
    status: string;
    lastBackupAt: string | null;
    ageHours: number | null;
  };
  timestamp: string;
}

interface BackupStatus {
  backupDir: string;
  weekKey: string;
  weeklyExists: boolean;
  lastBackupAt: string | null;
  autoSchedule: string;
}

interface BackupListItem {
  kind: 'weekly' | 'manual';
  id: string;
  weekKey?: string;
  finishedAt: string | null;
  sizeBytes: number | null;
  status: string;
  relativePath: string;
}

function formatBytes(n: number | null) {
  if (n == null || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function OpsPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [mail, setMail] = useState<MailStatus | null>(null);
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [backupList, setBackupList] = useState<BackupListItem[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyBackup, setBusyBackup] = useState(false);

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    setError('');
    try {
      const [hRes, m, l, bStatus, bList] = await Promise.all([
        fetch(`${getApiBaseUrl()}/health`, { cache: 'no-store' }).then(
          (r) => r.json() as Promise<HealthStatus>,
        ),
        apiFetch<MailStatus>('/mail/status', { token }),
        apiFetch<EmailLog[]>('/mail/logs?limit=15', { token }).catch(() => [] as EmailLog[]),
        apiFetch<BackupStatus>('/backups/status', { token }).catch(() => null),
        apiFetch<BackupListItem[]>('/backups', { token }).catch(() => [] as BackupListItem[]),
      ]);
      setHealth(hRes);
      setMail(m);
      setLogs(l);
      setBackupStatus(bStatus);
      setBackupList(bList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
      setHealth(null);
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  async function processReminders() {
    const token = getToken();
    if (!token) return;
    setBusy(true);
    try {
      const res = await apiFetch<{
        customSent: number;
        debtSent: number;
        markedOverdue?: number;
      }>('/reminders/process', {
        method: 'POST',
        token,
      });
      setMessage(
        `Нагадування: custom=${res.customSent}, debt=${res.debtSent}` +
          (res.markedOverdue != null ? `, overdue=${res.markedOverdue}` : ''),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setBusy(false);
    }
  }

  async function testMail() {
    const token = getToken();
    if (!token) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ ok: boolean; skipped?: boolean; to: string }>('/mail/test', {
        method: 'POST',
        token,
      });
      setMessage(
        res.skipped
          ? `Тест у лог (без SMTP), to=${res.to}`
          : `Лист надіслано: ${res.to}`,
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setBusy(false);
    }
  }

  async function testSms() {
    const token = getToken();
    if (!token) return;
    const to = window.prompt('Телефон для тест-SMS (напр. +380501112233)?');
    if (!to?.trim()) return;
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch<{ ok: boolean; logged?: boolean; providerId?: string }>(
        '/sms/test',
        {
          method: 'POST',
          token,
          body: JSON.stringify({ to: to.trim(), text: 'Мій дім test SMS' }),
        },
      );
      setMessage(
        res.logged
          ? `SMS у лог (без gateway), id=${res.providerId}`
          : `SMS надіслано: ${res.providerId}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка SMS');
    } finally {
      setBusy(false);
    }
  }

  async function runJournalReconcile() {
    const token = getToken();
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch<{
        ok: boolean;
        mismatchCount: number;
        mismatches: Array<{ kind: string; label: string; diff: number }>;
      }>('/journal/reconcile', { token });
      setMessage(
        res.ok
          ? 'Journal reconcile: OK (розбіжностей немає)'
          : `Journal reconcile: ${res.mismatchCount} розбіжностей (див. консоль)`,
      );
      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.info('journal mismatches', res.mismatches);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setBusy(false);
    }
  }

  async function createManualBackup() {
    const token = getToken();
    if (!token) return;
    setBusyBackup(true);
    setError('');
    setMessage('');
    try {
      const res = await apiFetch<{ relativePath: string; finishedAt: string; sizeBytes: number }>(
        '/backups',
        { method: 'POST', token },
      );
      setMessage(
        `Копію створено: ${res.relativePath} (${formatBytes(res.sizeBytes)}) · ${new Date(res.finishedAt).toLocaleString('uk-UA')}`,
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка копії');
    } finally {
      setBusyBackup(false);
    }
  }

  async function ensureWeeklyBackup() {
    const token = getToken();
    if (!token) return;
    setBusyBackup(true);
    setError('');
    setMessage('');
    try {
      const res = await apiFetch<{
        skipped: boolean;
        weekKey: string;
        relativePath?: string;
        reason?: string;
      }>('/backups/weekly', { method: 'POST', token });
      setMessage(
        res.skipped
          ? `Тижнева копія ${res.weekKey} уже є — нову автоматично не створено`
          : `Тижневу копію створено: ${res.relativePath ?? res.weekKey}`,
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка тижневої копії');
    } finally {
      setBusyBackup(false);
    }
  }

  const apiOk = health?.status === 'ok';
  const dbOk = health?.db === 'up';
  const redisOk = health?.redis === 'up';
  const storageOk = health?.storage === 'up';
  const backupOk = health?.backup?.status === 'ok';

  return (
    <main>
      <PageHeader
        title="Операції / здоровʼя"
        description="API, БД, Redis, MinIO, email, backup — контроль self-host"
        actions={
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => refresh()}>
            Оновити
          </button>
        }
      />

      {error && <p className="error">{error}</p>}
      {message && <p className="success-banner">{message}</p>}

      <div className="grid-2" style={{ marginBottom: '1.25rem' }}>
        <StatCard
          label="API"
          value={health ? health.status.toUpperCase() : '…'}
          tone={apiOk ? 'success' : health?.status === 'degraded' ? 'muted' : health ? 'danger' : 'muted'}
          hint={health?.version ? `версія ${health.version}` : undefined}
        />
        <StatCard
          label="PostgreSQL"
          value={health?.db ? health.db.toUpperCase() : '…'}
          tone={dbOk ? 'success' : health ? 'danger' : 'muted'}
        />
        <StatCard
          label="Redis"
          value={health?.redis ? health.redis.toUpperCase() : '…'}
          tone={redisOk ? 'success' : health ? 'danger' : 'muted'}
        />
        <StatCard
          label="MinIO"
          value={health?.storage ? health.storage.toUpperCase() : '…'}
          tone={storageOk ? 'success' : health ? 'danger' : 'muted'}
        />
        <StatCard
          label="Backup"
          value={health?.backup?.status ? health.backup.status.toUpperCase() : '…'}
          tone={backupOk ? 'success' : health?.backup?.status === 'stale' ? 'danger' : 'muted'}
          hint={
            health?.backup?.lastBackupAt
              ? `останній: ${new Date(health.backup.lastBackupAt).toLocaleString('uk-UA')}`
              : 'немає markers (BACKUP_STATUS_PATH)'
          }
        />
        <StatCard
          label="Email"
          value={mail ? mail.mode.toUpperCase() : '…'}
          hint={mail?.smtpConfigured ? 'SMTP налаштовано' : 'Без SMTP — лише лог'}
          tone={mail?.smtpConfigured ? 'success' : 'muted'}
        />
      </div>

      {mail && (
        <section className="card" style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.05rem', marginBottom: '0.5rem' }}>Посилання застосунку</h2>
          <p className="invite-url">{mail.appUrl}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button type="button" className="btn btn-sm" onClick={testMail} disabled={busy}>
              Тестовий email
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={processReminders} disabled={busy}>
              Обробити нагадування + overdue
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={runJournalReconcile} disabled={busy}>
              Journal reconcile
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => void testSms()} disabled={busy}>
              Тест SMS
            </button>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
            SMS: увімкніть SMS_ENABLED=true (provider=log пише в API log). Online pay: ONLINE_PAYMENTS_*.
          </p>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.75rem' }}>
            Worker: reminders кожні 15 хв; тижнева копія БД (щодня ~03:00 UTC, skip якщо вже є).
            Повний dump + MinIO: <code>npm run backup</code> / <code>infra/scripts</code>.
          </p>
          {health?.timestamp && (
            <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.35rem' }}>
              Health: {new Date(health.timestamp).toLocaleString('uk-UA')}
            </p>
          )}
        </section>
      )}

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.05rem', marginBottom: '0.5rem' }}>Копії даних (PostgreSQL)</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
          Автоматично раз на тиждень (ISO). Якщо копія за поточний тиждень уже є — повторно не
          створюється. Ручна копія — завжди нова. Мешканцям недоступно.
        </p>
        {backupStatus && (
          <div
            style={{
              display: 'grid',
              gap: '0.5rem',
              marginBottom: '0.75rem',
              fontSize: '0.9rem',
            }}
          >
            <div>
              Поточний тиждень: <strong>{backupStatus.weekKey}</strong>{' '}
              {backupStatus.weeklyExists ? (
                <span className="badge badge-success">тижнева є</span>
              ) : (
                <span className="badge badge-danger">тижневої немає</span>
              )}
            </div>
            <div style={{ color: 'var(--muted)' }}>
              Остання:{' '}
              {backupStatus.lastBackupAt
                ? new Date(backupStatus.lastBackupAt).toLocaleString('uk-UA')
                : 'немає marker'}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void createManualBackup()}
            disabled={busyBackup}
          >
            {busyBackup ? 'Копіювання…' : 'Створити копію зараз'}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => void ensureWeeklyBackup()}
            disabled={busyBackup}
          >
            Перевірити / створити тижневу
          </button>
        </div>
        {backupList.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            Список порожній — зробіть ручну копію або дочекайтесь worker.
          </p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Тип</th>
                  <th>Ід / тиждень</th>
                  <th>Час</th>
                  <th>Розмір</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {backupList.map((b) => (
                  <tr key={`${b.kind}-${b.id}`}>
                    <td>{b.kind === 'weekly' ? 'Тижнева' : 'Ручна'}</td>
                    <td>
                      <code style={{ fontSize: '0.8rem' }}>{b.weekKey ?? b.id}</code>
                    </td>
                    <td>
                      {b.finishedAt
                        ? new Date(b.finishedAt).toLocaleString('uk-UA')
                        : '—'}
                    </td>
                    <td>{formatBytes(b.sizeBytes)}</td>
                    <td>{b.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2 style={{ fontSize: '1.05rem', marginBottom: '0.75rem' }}>Останні email-логи</h2>
        {logs.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Порожньо</p>
        ) : (
          <ul style={{ listStyle: 'none', display: 'grid', gap: '0.5rem' }}>
            {logs.map((l) => (
              <li
                key={l.id}
                style={{
                  fontSize: '0.85rem',
                  borderBottom: '1px solid var(--border)',
                  paddingBottom: '0.5rem',
                }}
              >
                <span
                  className={`badge badge-${l.status === 'sent' || l.status === 'logged' ? 'success' : 'danger'}`}
                >
                  {l.status}
                </span>{' '}
                <strong>{l.template}</strong> → {l.to}
                <div style={{ color: 'var(--muted)' }}>
                  {l.subject} · {new Date(l.createdAt).toLocaleString('uk-UA')}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
