import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

const APP_VERSION = process.env.npm_package_version ?? process.env.DAH_VERSION ?? '1.5.1';

export type ComponentStatus = 'up' | 'down' | 'skipped';

@Injectable()
export class HealthService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async check() {
    const [db, redis, storage, backup] = await Promise.all([
      this.checkDb(),
      this.checkRedis(),
      this.checkStorage(),
      Promise.resolve(this.checkBackupHint()),
    ]);

    const criticalDown = db === 'down';
    // redis is optional (inline worker cron); only "down" when configured but unreachable
    const degraded = redis === 'down' || storage === 'down';
    const worker = this.checkWorkerMarker();

    return {
      status: criticalDown ? 'down' : degraded ? 'degraded' : 'ok',
      service: 'dah-api',
      version: APP_VERSION,
      db,
      redis,
      storage,
      backup,
      worker,
      timestamp: new Date().toISOString(),
    };
  }

  /** Last job markers written by worker process (`backups/worker-last.json`). */
  private checkWorkerMarker(): {
    path: string | null;
    updatedAt: string | null;
    jobs: Record<string, unknown> | null;
    status: 'ok' | 'stale' | 'missing';
  } {
    const backupDir =
      this.config.get<string>('BACKUP_DIR')?.trim() ||
      path.resolve(process.cwd(), '../../backups');
    const statusPath = path.join(backupDir, 'worker-last.json');
    if (!fs.existsSync(statusPath)) {
      return { path: statusPath, updatedAt: null, jobs: null, status: 'missing' };
    }
    try {
      const raw = fs.readFileSync(statusPath, 'utf8');
      const data = JSON.parse(raw) as Record<string, unknown>;
      const updatedAt =
        typeof data.updatedAt === 'string' ? data.updatedAt : null;
      const ageH = updatedAt
        ? (Date.now() - Date.parse(updatedAt)) / 3600000
        : null;
      const jobs = { ...data };
      delete jobs.updatedAt;
      return {
        path: statusPath,
        updatedAt,
        jobs,
        status: ageH != null && ageH > 24 ? 'stale' : 'ok',
      };
    } catch {
      return { path: statusPath, updatedAt: null, jobs: null, status: 'missing' };
    }
  }

  private async checkDb(): Promise<ComponentStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      return 'down';
    }
  }

  private async checkRedis(): Promise<ComponentStatus> {
    // Optional: worker uses inline cron by default (no BullMQ). Empty / none / disabled → skip.
    const url = (this.config.get<string>('REDIS_URL') ?? '').trim();
    if (!url || url === 'none' || url === 'disabled' || url === 'skip') {
      return 'skipped';
    }
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 1500,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    try {
      await client.connect();
      const pong = await client.ping();
      return pong === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    } finally {
      client.disconnect();
    }
  }

  private async checkStorage(): Promise<ComponentStatus> {
    try {
      const endpoint = this.config.get<string>('S3_ENDPOINT', 'http://localhost:9000');
      const bucket = this.config.get<string>('S3_BUCKET', 'dah-files');
      const client = new S3Client({
        endpoint,
        region: this.config.get<string>('S3_REGION', 'us-east-1'),
        credentials: {
          accessKeyId: this.config.get<string>('S3_ACCESS_KEY', 'dah_minio'),
          secretAccessKey: this.config.get<string>('S3_SECRET_KEY', 'dah_minio_secret_change_me'),
        },
        forcePathStyle: true,
      });
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      client.destroy();
      return 'up';
    } catch {
      return 'down';
    }
  }

  /** Reads optional marker file written by backup scripts (BACKUP_STATUS_PATH). */
  private checkBackupHint(): {
    path: string | null;
    lastBackupAt: string | null;
    ageHours: number | null;
    status: 'ok' | 'stale' | 'missing' | 'skipped';
  } {
    const statusPath =
      this.config.get<string>('BACKUP_STATUS_PATH') ||
      path.resolve(process.cwd(), '../../backups/last-backup.json');

    if (!fs.existsSync(statusPath)) {
      return { path: statusPath, lastBackupAt: null, ageHours: null, status: 'missing' };
    }

    try {
      const raw = fs.readFileSync(statusPath, 'utf8');
      const data = JSON.parse(raw) as { finishedAt?: string; createdAt?: string };
      const iso = data.finishedAt ?? data.createdAt;
      if (!iso) {
        return { path: statusPath, lastBackupAt: null, ageHours: null, status: 'missing' };
      }
      const ts = new Date(iso).getTime();
      const ageHours = (Date.now() - ts) / (1000 * 60 * 60);
      const maxAge = Number(this.config.get('BACKUP_MAX_AGE_HOURS') ?? 48);
      return {
        path: statusPath,
        lastBackupAt: new Date(ts).toISOString(),
        ageHours: Math.round(ageHours * 10) / 10,
        status: ageHours > maxAge ? 'stale' : 'ok',
      };
    } catch {
      return { path: statusPath, lastBackupAt: null, ageHours: null, status: 'missing' };
    }
  }
}
