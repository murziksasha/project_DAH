import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export type BackupKind = 'weekly' | 'manual';
export type BackupSource = 'schedule' | 'api' | 'upload' | 'manual' | string;

export interface BackupManifest {
  kind: BackupKind;
  status: 'ok' | 'failed';
  finishedAt: string | null;
  sizeBytes: number | null;
  source: BackupSource | null;
  triggeredBy: string | null;
  relativePath: string;
  weekKey?: string;
  error?: string;
  /** Manifest schema for unified pack */
  schemaVersion?: number;
  components?: {
    database: boolean;
    files: boolean;
    filesBytes?: number | null;
  };
  appVersion?: string | null;
}

export interface BackupListItem {
  kind: BackupKind;
  id: string;
  weekKey?: string;
  finishedAt: string | null;
  sizeBytes: number | null;
  status: string;
  relativePath: string;
  source: string | null;
}

export interface EnsureWeeklyResult {
  skipped: boolean;
  weekKey: string;
  relativePath?: string;
  finishedAt?: string;
  sizeBytes?: number;
  reason?: string;
  status?: string;
}

export interface CreateBackupResult {
  kind: BackupKind;
  id: string;
  relativePath: string;
  finishedAt: string;
  sizeBytes: number;
  status: 'ok';
  source: BackupSource;
  weekKey?: string;
}

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DUMP_NAME = 'database.sql.gz';
const MANIFEST_NAME = 'manifest.json';

@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);

  constructor(
    private config: ConfigService,
    private audit: AuditService,
    private prisma: PrismaService,
  ) {}

  /** Finance/privileged users must enable 2FA before downloading full DB dump. */
  async assertCanDownload(userId: string) {
    if (this.config.get('REQUIRE_FINANCE_2FA') === 'false') return;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, totpEnabled: true },
    });
    if (!user) throw new BadRequestException('Користувача не знайдено');
    const privileged = new Set(['super_admin', 'chairman', 'board', 'accountant', 'auditor']);
    if (privileged.has(user.role) && !user.totpEnabled) {
      throw new BadRequestException(
        'Увімкніть 2FA у «Безпека» перед завантаженням резервної копії',
      );
    }
  }

  getBackupDir(): string {
    const configured = this.config.get<string>('BACKUP_DIR')?.trim();
    if (configured) return path.resolve(configured);
    // monorepo local default: <repo>/backups
    return path.resolve(process.cwd(), '../../backups');
  }

  getStatusPath(): string {
    const configured = this.config.get<string>('BACKUP_STATUS_PATH')?.trim();
    if (configured) return path.resolve(configured);
    return path.join(this.getBackupDir(), 'last-backup.json');
  }

  /** ISO week key e.g. 2026-W31 (UTC). */
  currentWeekKey(date = new Date()): string {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    // Thursday in current week decides the year
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    const year = d.getUTCFullYear();
    return `${year}-W${String(weekNo).padStart(2, '0')}`;
  }

  private stamp(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return (
      `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}_` +
      `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
    );
  }

  private async ensureDir(dir: string) {
    await fsp.mkdir(dir, { recursive: true });
  }

  private async readManifest(dir: string): Promise<BackupManifest | null> {
    const file = path.join(dir, MANIFEST_NAME);
    try {
      const raw = await fsp.readFile(file, 'utf8');
      return JSON.parse(raw) as BackupManifest;
    } catch {
      return null;
    }
  }

  private async writeManifest(dir: string, manifest: BackupManifest) {
    await fsp.writeFile(path.join(dir, MANIFEST_NAME), JSON.stringify(manifest, null, 2), 'utf8');
  }

  private async writeHealthMarker(relativePath: string, finishedAt: string, sizeBytes: number) {
    const marker = {
      finishedAt,
      relativePath,
      sizeBytes,
      timestamp: finishedAt,
    };
    const statusPath = this.getStatusPath();
    await this.ensureDir(path.dirname(statusPath));
    await fsp.writeFile(statusPath, JSON.stringify(marker, null, 2), 'utf8');
  }

  private parseDatabaseUrl(): {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  } {
    const url =
      this.config.get<string>('DATABASE_URL') ||
      process.env.DATABASE_URL ||
      '';
    if (!url) {
      throw new ServiceUnavailableException('DATABASE_URL is not configured');
    }
    try {
      const u = new URL(url);
      return {
        host: u.hostname || 'localhost',
        port: Number(u.port) || 5432,
        user: decodeURIComponent(u.username || 'postgres'),
        password: decodeURIComponent(u.password || ''),
        database: decodeURIComponent((u.pathname || '/postgres').replace(/^\//, '') || 'postgres'),
      };
    } catch {
      throw new ServiceUnavailableException('DATABASE_URL is invalid');
    }
  }

  /**
   * Best-effort MinIO/S3 mirror into backupDir/files via `mc` CLI.
   * Skips silently when S3 is not configured or mc is unavailable.
   */
  private async tryMirrorMinioFiles(
    backupDir: string,
  ): Promise<{ ok: boolean; filesBytes: number | null; error?: string }> {
    const endpoint =
      this.config.get<string>('S3_ENDPOINT') ||
      process.env.S3_ENDPOINT ||
      '';
    const access =
      this.config.get<string>('S3_ACCESS_KEY') || process.env.S3_ACCESS_KEY || '';
    const secret =
      this.config.get<string>('S3_SECRET_KEY') || process.env.S3_SECRET_KEY || '';
    const bucket =
      this.config.get<string>('S3_BUCKET') || process.env.S3_BUCKET || 'dah-files';
    if (!endpoint || !access || !secret) {
      return { ok: false, filesBytes: null, error: 'S3 not configured' };
    }

    const filesDir = path.join(backupDir, 'files');
    await this.ensureDir(filesDir);

    const alias = `dah_backup_${Date.now()}`;
    const run = (args: string[]) =>
      new Promise<{ code: number; stderr: string }>((resolve) => {
        const child = spawn('mc', args, {
          env: process.env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stderr = '';
        child.stderr?.on('data', (c: Buffer) => {
          stderr += c.toString();
        });
        child.on('error', (err) => {
          resolve({ code: 127, stderr: err.message });
        });
        child.on('close', (code) => resolve({ code: code ?? 1, stderr }));
      });

    try {
      const set = await run([
        'alias',
        'set',
        alias,
        endpoint.replace(/\/$/, ''),
        access,
        secret,
      ]);
      if (set.code !== 0) {
        this.logger.warn(`MinIO alias failed: ${set.stderr}`);
        return { ok: false, filesBytes: null, error: set.stderr };
      }
      const mirror = await run([
        'mirror',
        '--quiet',
        `${alias}/${bucket}`,
        filesDir,
      ]);
      await run(['alias', 'remove', alias]).catch(() => undefined);
      if (mirror.code !== 0) {
        this.logger.warn(`MinIO mirror failed: ${mirror.stderr}`);
        return { ok: false, filesBytes: null, error: mirror.stderr };
      }
      // Sum file sizes
      let total = 0;
      const walk = async (dir: string) => {
        const entries = await fsp.readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) await walk(p);
          else {
            const st = await fsp.stat(p);
            total += st.size;
          }
        }
      };
      try {
        await walk(filesDir);
      } catch {
        /* empty */
      }
      return { ok: true, filesBytes: total };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`MinIO pack skipped: ${message}`);
      return { ok: false, filesBytes: null, error: message };
    }
  }

  /** Live pg_dump | gzip → target file. */
  private async runPgDump(targetGz: string): Promise<number> {
    const db = this.parseDatabaseUrl();
    await this.ensureDir(path.dirname(targetGz));

    const args = [
      '-h',
      db.host,
      '-p',
      String(db.port),
      '-U',
      db.user,
      '-d',
      db.database,
      '--no-owner',
      '--no-acl',
    ];

    const child = spawn('pg_dump', args, {
      env: { ...process.env, PGPASSWORD: db.password },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const exitPromise = new Promise<number>((resolve, reject) => {
      child.on('error', (err) => {
        reject(
          new ServiceUnavailableException(
            `pg_dump failed to start: ${err.message}. Is postgresql-client installed?`,
          ),
        );
      });
      child.on('close', (code) => resolve(code ?? 1));
    });

    const gzip = createGzip();
    const out = fs.createWriteStream(targetGz);

    try {
      await pipeline(child.stdout!, gzip, out);
      const code = await exitPromise;
      if (code !== 0) {
        try {
          await fsp.unlink(targetGz);
        } catch {
          /* ignore */
        }
        throw new ServiceUnavailableException(
          `pg_dump exited ${code}: ${stderr.trim() || 'unknown error'}`,
        );
      }
      const st = await fsp.stat(targetGz);
      return st.size;
    } catch (err) {
      try {
        await fsp.unlink(targetGz);
      } catch {
        /* ignore */
      }
      if (err instanceof ServiceUnavailableException) throw err;
      throw new ServiceUnavailableException(
        `pg_dump pipeline failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private weeklyDir(weekKey: string) {
    return path.join(this.getBackupDir(), 'weekly', weekKey);
  }

  private manualDir(id: string) {
    return path.join(this.getBackupDir(), 'manual', id);
  }

  async weeklyExists(weekKey?: string): Promise<boolean> {
    const key = weekKey ?? this.currentWeekKey();
    const dir = this.weeklyDir(key);
    const manifest = await this.readManifest(dir);
    if (manifest?.status === 'ok') {
      const dump = path.join(dir, DUMP_NAME);
      try {
        await fsp.access(dump);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  async getStatus() {
    const backupDir = this.getBackupDir();
    const weekKey = this.currentWeekKey();
    const weeklyExists = await this.weeklyExists(weekKey);

    let lastBackupAt: string | null = null;
    const statusPath = this.getStatusPath();
    try {
      const raw = await fsp.readFile(statusPath, 'utf8');
      const data = JSON.parse(raw) as { finishedAt?: string; createdAt?: string };
      lastBackupAt = data.finishedAt ?? data.createdAt ?? null;
    } catch {
      lastBackupAt = null;
    }

    return {
      backupDir,
      weekKey,
      weeklyExists,
      lastBackupAt,
      autoSchedule: '0 3 * * * UTC (daily ensure weekly)',
    };
  }

  async list(): Promise<BackupListItem[]> {
    const root = this.getBackupDir();
    const items: BackupListItem[] = [];

    for (const kind of ['weekly', 'manual'] as const) {
      const base = path.join(root, kind);
      let names: string[] = [];
      try {
        names = await fsp.readdir(base);
      } catch {
        continue;
      }
      for (const id of names) {
        if (!ID_RE.test(id)) continue;
        const dir = path.join(base, id);
        let st: fs.Stats;
        try {
          st = await fsp.stat(dir);
        } catch {
          continue;
        }
        if (!st.isDirectory()) continue;

        const manifest = await this.readManifest(dir);
        const dumpPath = path.join(dir, DUMP_NAME);
        let sizeBytes: number | null = manifest?.sizeBytes ?? null;
        let status = manifest?.status ?? 'unknown';
        try {
          const dst = await fsp.stat(dumpPath);
          if (sizeBytes == null) sizeBytes = dst.size;
        } catch {
          if (status === 'ok') status = 'corrupt';
          else if (!manifest) status = 'unknown';
        }

        items.push({
          kind,
          id,
          weekKey: kind === 'weekly' ? (manifest?.weekKey ?? id) : undefined,
          finishedAt: manifest?.finishedAt ?? null,
          sizeBytes,
          status,
          relativePath: `${kind}/${id}`,
          source: manifest?.source ?? null,
        });
      }
    }

    items.sort((a, b) => {
      const ta = a.finishedAt ? Date.parse(a.finishedAt) : 0;
      const tb = b.finishedAt ? Date.parse(b.finishedAt) : 0;
      return tb - ta;
    });
    return items;
  }

  async ensureWeeklyBackup(opts: {
    source: BackupSource;
    userId?: string | null;
  }): Promise<EnsureWeeklyResult> {
    const weekKey = this.currentWeekKey();
    if (await this.weeklyExists(weekKey)) {
      return {
        skipped: true,
        weekKey,
        relativePath: `weekly/${weekKey}`,
        reason: 'exists',
      };
    }

    const created = await this.createDump({
      kind: 'weekly',
      id: weekKey,
      source: opts.source,
      userId: opts.userId ?? null,
      weekKey,
    });

    return {
      skipped: false,
      weekKey,
      relativePath: created.relativePath,
      finishedAt: created.finishedAt,
      sizeBytes: created.sizeBytes,
      status: 'ok',
    };
  }

  async createManualBackup(opts: {
    source?: BackupSource;
    userId?: string | null;
  }): Promise<CreateBackupResult> {
    const id = this.stamp();
    return this.createDump({
      kind: 'manual',
      id,
      source: opts.source ?? 'api',
      userId: opts.userId ?? null,
    });
  }

  private async createDump(params: {
    kind: BackupKind;
    id: string;
    source: BackupSource;
    userId: string | null;
    weekKey?: string;
  }): Promise<CreateBackupResult> {
    if (!ID_RE.test(params.id)) {
      throw new BadRequestException('Invalid backup id');
    }

    const relativePath = `${params.kind}/${params.id}`;
    const dir =
      params.kind === 'weekly' ? this.weeklyDir(params.id) : this.manualDir(params.id);
    const dumpPath = path.join(dir, DUMP_NAME);

    await this.ensureDir(dir);

    try {
      const sizeBytes = await this.runPgDump(dumpPath);
      const filesMeta = await this.tryMirrorMinioFiles(dir);
      const finishedAt = new Date().toISOString();
      const totalSize = sizeBytes + (filesMeta.filesBytes ?? 0);
      const manifest: BackupManifest = {
        kind: params.kind,
        status: 'ok',
        finishedAt,
        sizeBytes: totalSize,
        source: params.source,
        triggeredBy: params.userId,
        relativePath,
        schemaVersion: 2,
        components: {
          database: true,
          files: filesMeta.ok,
          filesBytes: filesMeta.filesBytes,
        },
        appVersion: process.env.npm_package_version ?? null,
        ...(params.weekKey ? { weekKey: params.weekKey } : {}),
      };
      await this.writeManifest(dir, manifest);
      await this.writeHealthMarker(relativePath, finishedAt, totalSize);

      await this.audit.log({
        userId: params.userId,
        action: params.kind === 'weekly' ? 'backup.weekly' : 'backup.create',
        entityType: 'backup',
        entityId: relativePath,
        payload: {
          source: params.source,
          sizeBytes: totalSize,
          files: filesMeta.ok,
          finishedAt,
        },
      });

      this.logger.log(
        `Backup created ${relativePath} (db=${sizeBytes} files=${filesMeta.filesBytes ?? 0}) source=${params.source}`,
      );

      return {
        kind: params.kind,
        id: params.id,
        relativePath,
        finishedAt,
        sizeBytes: totalSize,
        status: 'ok',
        source: params.source,
        weekKey: params.weekKey,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failed: BackupManifest = {
        kind: params.kind,
        status: 'failed',
        finishedAt: new Date().toISOString(),
        sizeBytes: null,
        source: params.source,
        triggeredBy: params.userId,
        relativePath,
        error: message,
        ...(params.weekKey ? { weekKey: params.weekKey } : {}),
      };
      try {
        await this.writeManifest(dir, failed);
      } catch {
        /* ignore */
      }
      this.logger.error(`Backup failed ${relativePath}: ${message}`);
      throw err;
    }
  }

  resolveDumpPath(kind: string, id: string): { dumpPath: string; relativePath: string } {
    if (kind !== 'weekly' && kind !== 'manual') {
      throw new BadRequestException('kind must be weekly or manual');
    }
    if (!ID_RE.test(id)) {
      throw new BadRequestException('Invalid backup id');
    }
    const relativePath = `${kind}/${id}`;
    const dumpPath = path.join(this.getBackupDir(), kind, id, DUMP_NAME);
    // path traversal guard: resolved path must stay under BACKUP_DIR
    const root = path.resolve(this.getBackupDir());
    const resolved = path.resolve(dumpPath);
    if (!resolved.startsWith(root + path.sep) && resolved !== root) {
      throw new BadRequestException('Invalid backup path');
    }
    return { dumpPath: resolved, relativePath };
  }

  async openDownload(kind: string, id: string, userId?: string) {
    const { dumpPath, relativePath } = this.resolveDumpPath(kind, id);
    try {
      await fsp.access(dumpPath);
    } catch {
      throw new NotFoundException(`Backup not found: ${relativePath}`);
    }
    if (userId) {
      await this.audit.log({
        userId,
        action: 'backup.downloaded',
        entityType: 'Backup',
        entityId: `${kind}/${id}`,
        payload: { relativePath },
      });
    }
    const filename = `dah-backup-${kind}-${id}.sql.gz`;
    return { dumpPath, filename, relativePath };
  }

  async uploadFromPc(
    file: Express.Multer.File | undefined,
    userId: string | null,
  ): Promise<CreateBackupResult> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Файл не передано');
    }

    const name = (file.originalname || '').toLowerCase();
    if (!name.endsWith('.sql.gz') && !name.endsWith('.gz')) {
      throw new BadRequestException('Очікується файл .sql.gz');
    }

    // gzip magic 1f 8b
    if (file.buffer[0] !== 0x1f || file.buffer[1] !== 0x8b) {
      throw new BadRequestException('Файл не є gzip-архівом');
    }

    const maxMbRaw = this.config.get<string>('BACKUP_UPLOAD_MAX_MB')?.trim();
    if (maxMbRaw && maxMbRaw !== '0') {
      const maxMb = Number(maxMbRaw);
      if (Number.isFinite(maxMb) && maxMb > 0) {
        const maxBytes = maxMb * 1024 * 1024;
        if (file.buffer.length > maxBytes) {
          throw new BadRequestException(`Файл перевищує ліміт ${maxMb} MB`);
        }
      }
    }

    const id = this.stamp();
    const relativePath = `manual/${id}`;
    const dir = this.manualDir(id);
    await this.ensureDir(dir);
    const dumpPath = path.join(dir, DUMP_NAME);
    await fsp.writeFile(dumpPath, file.buffer);
    const sizeBytes = file.buffer.length;
    const finishedAt = new Date().toISOString();

    const manifest: BackupManifest = {
      kind: 'manual',
      status: 'ok',
      finishedAt,
      sizeBytes,
      source: 'upload',
      triggeredBy: userId,
      relativePath,
    };
    await this.writeManifest(dir, manifest);

    // Do NOT update last-backup.json health marker for uploads (catalog only).

    await this.audit.log({
      userId,
      action: 'backup.upload',
      entityType: 'backup',
      entityId: relativePath,
      payload: { sizeBytes, finishedAt, originalName: file.originalname },
    });

    this.logger.log(`Backup uploaded ${relativePath} (${sizeBytes} bytes)`);

    return {
      kind: 'manual',
      id,
      relativePath,
      finishedAt,
      sizeBytes,
      status: 'ok',
      source: 'upload',
    };
  }
}
