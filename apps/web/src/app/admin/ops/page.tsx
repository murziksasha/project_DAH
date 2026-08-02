'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { apiFetch, getApiBaseUrl, getToken, refreshAccessToken } from '@/lib/api';
import { downloadAuthFile } from '@/lib/download';
import type { I18nKey } from '@/lib/i18n';

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
  /** schedule | api | manual | upload | … */
  source?: string | null;
}

function formatBytes(n: number | null) {
  if (n == null || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Visual origin of a backup in the catalog. */
function backupOrigin(
  b: BackupListItem,
  t: (key: I18nKey) => string,
): {
  label: string;
  badgeClass: string;
  title: string;
} {
  if (b.source === 'upload') {
    return {
      label: t('opsBackupUpload'),
      badgeClass: 'badge badge-warning',
      title: t('opsBackupUpload'),
    };
  }
  if (b.kind === 'weekly') {
    return {
      label: t('opsBackupWeekly'),
      badgeClass: 'badge badge-success',
      title: t('opsBackupWeekly'),
    };
  }
  return {
    label: t('opsBackupManual'),
    badgeClass: 'badge badge-primary',
    title: t('opsBackupManual'),
  };
}

export default function OpsPage() {
  const { t, locale } = useI18n();
  const dateLocale = locale === 'ru' ? 'ru-RU' : 'uk-UA';
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [mail, setMail] = useState<MailStatus | null>(null);
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [backupList, setBackupList] = useState<BackupListItem[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyBackup, setBusyBackup] = useState(false);
  const [busyDownloadId, setBusyDownloadId] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

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
      setError(err instanceof Error ? err.message : t('error'));
      setHealth(null);
    }
  }, [t]);

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

  async function downloadBackup(b: BackupListItem) {
    const key = `${b.kind}-${b.id}`;
    setBusyDownloadId(key);
    setError('');
    try {
      await downloadAuthFile(
        `/backups/${b.kind}/${encodeURIComponent(b.id)}/download`,
        `dah-backup-${b.kind}-${b.id}.sql.gz`,
      );
      setMessage(`Завантажено: dah-backup-${b.kind}-${b.id}.sql.gz`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка завантаження');
    } finally {
      setBusyDownloadId(null);
    }
  }

  async function uploadBackupFromPc(file: File) {
    let token = getToken();
    if (!token) return;
    setBusyBackup(true);
    setError('');
    setMessage('');
    try {
      const form = new FormData();
      form.append('file', file);
      const apiUrl = getApiBaseUrl();
      let res = await fetch(`${apiUrl}/backups/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
        credentials: 'include',
      });
      if (res.status === 401) {
        const newToken = await refreshAccessToken();
        if (!newToken) throw new Error('Сесію завершено');
        token = newToken;
        res = await fetch(`${apiUrl}/backups/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
          credentials: 'include',
        });
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(
          Array.isArray(err.message) ? err.message.join(', ') : (err.message ?? 'Помилка завантаження'),
        );
      }
      const data = (await res.json()) as {
        relativePath: string;
        sizeBytes: number;
        finishedAt: string;
      };
      setMessage(
        `Копію з компʼютера додано: ${data.relativePath} (${formatBytes(data.sizeBytes)})`,
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка завантаження копії');
    } finally {
      setBusyBackup(false);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
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
        title={t('opsPageTitle')}
        description={t('opsPageDesc')}
        actions={
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => refresh()}>
            {t('refresh')}
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
          hint={health?.version ? t('opsVersion', { v: health.version }) : undefined}
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
              ? t('opsLastBackupAt', {
                  date: new Date(health.backup.lastBackupAt).toLocaleString(dateLocale),
                })
              : t('opsNoBackupMarkers')
          }
        />
        <StatCard
          label="Email"
          value={mail ? mail.mode.toUpperCase() : '…'}
          hint={mail?.smtpConfigured ? t('opsSmtpOk') : t('opsSmtpNo')}
          tone={mail?.smtpConfigured ? 'success' : 'muted'}
        />
      </div>

      {mail && (
        <section className="card" style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.05rem', marginBottom: '0.5rem' }}>{t('opsAppLinks')}</h2>
          <p className="invite-url">{mail.appUrl}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button type="button" className="btn btn-sm" onClick={testMail} disabled={busy}>
              {t('opsTestEmail')}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={processReminders} disabled={busy}>
              {t('opsProcessReminders')}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={runJournalReconcile} disabled={busy}>
              {t('opsJournal')}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => void testSms()} disabled={busy}>
              {t('opsTestSms')}
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
              Health: {new Date(health.timestamp).toLocaleString(dateLocale)}
            </p>
          )}
        </section>
      )}

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.05rem', marginBottom: '0.5rem' }}>{t('opsBackups')}</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
          {t('opsBackupsDesc')}
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
              {t('opsCurrentWeek')}: <strong>{backupStatus.weekKey}</strong>{' '}
              {backupStatus.weeklyExists ? (
                <span className="badge badge-success">{t('opsWeeklyExists')}</span>
              ) : (
                <span className="badge badge-danger">{t('opsWeeklyMissing')}</span>
              )}
            </div>
            <div style={{ color: 'var(--muted)' }}>
              {t('opsLast')}:{' '}
              {backupStatus.lastBackupAt
                ? new Date(backupStatus.lastBackupAt).toLocaleString(dateLocale)
                : t('opsNoMarker')}
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
            {busyBackup ? t('opsBackuping') : t('opsCreateBackup')}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => void ensureWeeklyBackup()}
            disabled={busyBackup}
          >
            {t('opsWeeklyBackup')}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost btn-warning"
            onClick={() => uploadInputRef.current?.click()}
            disabled={busyBackup}
            title={t('opsFromPc')}
          >
            {t('opsFromPc')}
          </button>
          <input
            ref={uploadInputRef}
            type="file"
            accept=".gz,.sql.gz,application/gzip"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadBackupFromPc(f);
            }}
          />
        </div>
        {backupList.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{t('opsEmptyBackups')}</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('opsColType')}</th>
                  <th>{t('opsColId')}</th>
                  <th>{t('opsColTime')}</th>
                  <th>{t('opsColSize')}</th>
                  <th>{t('opsColStatus')}</th>
                  <th>{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {backupList.map((b) => {
                  const rowKey = `${b.kind}-${b.id}`;
                  const origin = backupOrigin(b, t);
                  return (
                    <tr key={rowKey}>
                      <td>
                        <span className={origin.badgeClass} title={origin.title}>
                          {origin.label}
                        </span>
                      </td>
                      <td>
                        <code style={{ fontSize: '0.8rem' }}>{b.weekKey ?? b.id}</code>
                      </td>
                      <td>
                        {b.finishedAt
                          ? new Date(b.finishedAt).toLocaleString(dateLocale)
                          : '—'}
                      </td>
                      <td>{formatBytes(b.sizeBytes)}</td>
                      <td>
                        {b.status === 'ok' ? (
                          <span className="badge badge-success">ok</span>
                        ) : (
                          <span className="badge badge-danger">{b.status}</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost btn-success"
                          disabled={busyDownloadId === rowKey || b.status !== 'ok'}
                          onClick={() => void downloadBackup(b)}
                          title={t('opsToPc')}
                        >
                          {busyDownloadId === rowKey ? '…' : t('opsToPc')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2 style={{ fontSize: '1.05rem', marginBottom: '0.75rem' }}>{t('opsEmailLogs')}</h2>
        {logs.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>{t('commsEmpty')}</p>
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
                  {l.subject} · {new Date(l.createdAt).toLocaleString(dateLocale)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
