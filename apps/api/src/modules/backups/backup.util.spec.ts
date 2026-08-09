import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import {
  downloadFileName,
  isBackupKind,
  isGzipBuffer,
  isSafeBackupId,
  isoWeekKey,
  parseDatabaseUrl,
  stampFolder,
} from './backup.util';
import { BackupsService } from './backups.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('backup.util', () => {
  it('formats ISO week key', () => {
    // 2026-08-01 is Saturday → ISO week 31 of 2026
    expect(isoWeekKey(new Date('2026-08-01T12:00:00Z'))).toBe('2026-W31');
  });

  it('parses DATABASE_URL', () => {
    const p = parseDatabaseUrl('postgresql://dah:s3cret@postgres:5432/dah_db');
    expect(p.host).toBe('postgres');
    expect(p.port).toBe('5432');
    expect(p.user).toBe('dah');
    expect(p.password).toBe('s3cret');
    expect(p.database).toBe('dah_db');
  });

  it('stampFolder is sortable', () => {
    const s = stampFolder(new Date('2026-08-01T15:30:45Z'));
    expect(s).toBe('20260801_153045');
  });

  it('validates kind and id', () => {
    expect(isBackupKind('weekly')).toBe(true);
    expect(isBackupKind('manual')).toBe(true);
    expect(isBackupKind('other')).toBe(false);
    expect(isSafeBackupId('2026-W31')).toBe(true);
    expect(isSafeBackupId('20260802_083334')).toBe(true);
    expect(isSafeBackupId('../etc')).toBe(false);
    expect(isSafeBackupId('a/b')).toBe(false);
    expect(isSafeBackupId('')).toBe(false);
  });

  it('gzip magic and download name', () => {
    expect(isGzipBuffer(Buffer.from([0x1f, 0x8b, 0x08]))).toBe(true);
    expect(isGzipBuffer(Buffer.from([0x00, 0x00]))).toBe(false);
    expect(downloadFileName('manual', '20260802_083334')).toBe(
      'dah-backup-manual-20260802_083334.sql.gz',
    );
  });
});

describe('BackupsService.weeklyExists', () => {
  const tmpRoot = join(process.cwd(), '.tmp-backup-test');

  afterEach(() => {
    if (existsSync(tmpRoot)) {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  function serviceWithRoot(extraConfig?: Record<string, string>) {
    const config = {
      get: (key: string) => {
        if (key === 'BACKUP_DIR') return tmpRoot;
        if (key === 'BACKUP_STATUS_PATH') return join(tmpRoot, 'last-backup.json');
        if (extraConfig && key in extraConfig) return extraConfig[key];
        return undefined;
      },
    } as unknown as ConfigService;
    const audit = { log: jest.fn().mockResolvedValue({}) };
    const prisma = {} as never;
    return new BackupsService(config, audit as never, prisma);
  }

  function gzipFile(buffer: Buffer, originalname = 'incoming.sql.gz') {
    return {
      buffer,
      originalname,
      fieldname: 'file',
      encoding: '7bit',
      mimetype: 'application/gzip',
      size: buffer.length,
    } as Express.Multer.File;
  }

  it('returns false when no weekly folder', async () => {
    const svc = serviceWithRoot();
    await expect(svc.weeklyExists('2026-W31')).resolves.toBe(false);
  });

  it('returns true when ok manifest and dump exist', async () => {
    const week = '2026-W31';
    const dir = join(tmpRoot, 'weekly', week);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({ status: 'ok', kind: 'weekly', weekKey: week, finishedAt: new Date().toISOString() }),
    );
    writeFileSync(join(dir, 'database.sql.gz'), Buffer.from([0x1f, 0x8b, 0x08, 0x00]));
    const svc = serviceWithRoot();
    await expect(svc.weeklyExists(week)).resolves.toBe(true);
  });

  it('ensureWeeklyBackup skips when already present', async () => {
    const week = isoWeekKey(new Date());
    const dir = join(tmpRoot, 'weekly', week);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({
        status: 'ok',
        kind: 'weekly',
        weekKey: week,
        finishedAt: new Date().toISOString(),
        relativePath: `weekly/${week}`,
      }),
    );
    writeFileSync(join(dir, 'database.sql.gz'), Buffer.from([0x1f, 0x8b, 0x08, 0x00]));
    const svc = serviceWithRoot();
    const result = await svc.ensureWeeklyBackup({ source: 'test' });
    expect(result.skipped).toBe(true);
    expect(result.weekKey).toBe(week);
  });

  it('resolveDumpPath rejects traversal and bad kind', () => {
    const svc = serviceWithRoot();
    expect(() => svc.resolveDumpPath('nope', 'x')).toThrow(BadRequestException);
    expect(() => svc.resolveDumpPath('manual', '../x')).toThrow(BadRequestException);
    expect(() => svc.resolveDumpPath('manual', 'ok_id')).not.toThrow();
  });

  it('openDownload returns path for existing dump', async () => {
    const id = '20260802_083334';
    const dir = join(tmpRoot, 'manual', id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'database.sql.gz'), Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x00]));
    const svc = serviceWithRoot();
    const dl = await svc.openDownload('manual', id);
    expect(dl.filename).toBe('dah-backup-manual-20260802_083334.sql.gz');
    expect(dl.dumpPath).toContain(join('manual', id, 'database.sql.gz'));
    expect(dl.relativePath).toBe(`manual/${id}`);
  });

  it('openDownload 404 when missing', async () => {
    const svc = serviceWithRoot();
    await expect(svc.openDownload('manual', 'missing')).rejects.toThrow(NotFoundException);
  });

  it('uploadFromPc stores under manual/', async () => {
    mkdirSync(tmpRoot, { recursive: true });
    const svc = serviceWithRoot();
    const res = await svc.uploadFromPc(
      gzipFile(Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x11, 0x22])),
      'user-1',
    );
    expect(res.kind).toBe('manual');
    expect(res.status).toBe('ok');
    expect(res.relativePath).toMatch(/^manual\//);
    expect(existsSync(join(tmpRoot, res.relativePath, 'database.sql.gz'))).toBe(true);
    expect(existsSync(join(tmpRoot, res.relativePath, 'manifest.json'))).toBe(true);
    const list = await svc.list();
    const item = list.find((i) => i.relativePath === res.relativePath);
    expect(item).toBeDefined();
    expect(item?.source).toBe('upload');
  });

  it('uploadFromPc rejects non-gzip', async () => {
    mkdirSync(tmpRoot, { recursive: true });
    const svc = serviceWithRoot();
    await expect(
      svc.uploadFromPc(gzipFile(Buffer.from([0x00, 0x01, 0x02]), 'bad.bin'), null),
    ).rejects.toThrow(BadRequestException);
  });

  it('uploadFromPc enforces optional size cap', async () => {
    mkdirSync(tmpRoot, { recursive: true });
    const unlimited = serviceWithRoot();
    await expect(
      unlimited.uploadFromPc(gzipFile(Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x01])), null),
    ).resolves.toMatchObject({ status: 'ok' });

    const capped = serviceWithRoot({ BACKUP_UPLOAD_MAX_MB: '0.000001' }); // ~1 byte
    await expect(
      capped.uploadFromPc(
        gzipFile(Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x01, 0x02, 0x03, 0x04])),
        null,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
