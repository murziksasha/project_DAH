/** ISO week key UTC, e.g. 2026-W31 */
export function isoWeekKey(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function stampFolder(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const s = String(date.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${day}_${h}${min}${s}`;
}

export interface DbConnectionParts {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

export function parseDatabaseUrl(url: string): DbConnectionParts {
  const u = new URL(url);
  const database = u.pathname.replace(/^\//, '').split('?')[0] || 'dah';
  return {
    host: u.hostname || 'localhost',
    port: u.port || '5432',
    user: decodeURIComponent(u.username || 'dah'),
    password: decodeURIComponent(u.password || ''),
    database,
  };
}

export interface BackupManifest {
  kind: 'weekly' | 'manual';
  weekKey?: string;
  status: 'ok' | 'failed';
  finishedAt: string;
  sizeBytes?: number;
  source?: string;
  triggeredBy?: string | null;
  error?: string;
  runDir: string;
  relativePath: string;
}

export type BackupKind = 'weekly' | 'manual';

/** Folder id under weekly/ or manual/ — no path separators. */
const BACKUP_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function isBackupKind(value: string): value is BackupKind {
  return value === 'weekly' || value === 'manual';
}

export function isSafeBackupId(id: string): boolean {
  return BACKUP_ID_RE.test(id) && !id.includes('..');
}

export function downloadFileName(kind: BackupKind, id: string): string {
  return `dah-backup-${kind}-${id}.sql.gz`;
}

/** Gzip magic: 1f 8b */
export function isGzipBuffer(buf: Buffer): boolean {
  return buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}
