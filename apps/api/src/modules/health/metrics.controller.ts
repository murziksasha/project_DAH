import { Controller, Get, Header, Headers, NotFoundException, Query, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';
import { APP_VERSION } from '../../common/version';
import { ExtraGauge, renderMetrics } from '../../common/metrics/metrics';
import { HealthService } from './health.service';

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Phase 2.4: Prometheus endpoint `GET /api/metrics`.
 * Auth: `Authorization: Bearer $METRICS_TOKEN` (or `?token=`). Without METRICS_TOKEN the
 * endpoint is available only outside production.
 */
@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  constructor(private health: HealthService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async metrics(@Headers('authorization') auth?: string, @Query('token') token?: string) {
    const expected = process.env.METRICS_TOKEN?.trim();
    if (!expected) {
      if (process.env.NODE_ENV === 'production') throw new NotFoundException();
    } else {
      const given = auth?.startsWith('Bearer ') ? auth.slice(7) : (token ?? '');
      if (!given || !safeEqual(given, expected)) throw new UnauthorizedException();
    }

    const extra: ExtraGauge[] = [
      { name: 'dah_build_info', help: 'Product version', value: 1, labels: { version: APP_VERSION } },
      { name: 'dah_db_up', help: 'Database reachable (1/0)', value: (await this.health.ready()) ? 1 : 0 },
    ];
    const backup = this.health.checkBackupHint();
    extra.push({
      name: 'dah_backup_age_seconds',
      help: 'Age of the last successful backup (from backup marker)',
      value: backup.ageHours == null ? null : Math.round(backup.ageHours * 3600),
    });
    extra.push({
      name: 'dah_backup_partial',
      help: '1 when the last backup skipped files (MinIO)',
      value: backup.status === 'partial' ? 1 : 0,
    });
    const now = Date.now();
    for (const j of await this.health.workerJobs()) {
      extra.push({
        name: 'dah_worker_job_last_success_age_seconds',
        help: 'Seconds since the worker job last succeeded',
        value: j.lastRunAt ? Math.round((now - new Date(j.lastRunAt).getTime()) / 1000) : null,
        labels: { job: j.name },
      });
      extra.push({
        name: 'dah_worker_job_last_failed',
        help: '1 when the last run of the job failed',
        value: j.lastStatus === 'failed' ? 1 : 0,
        labels: { job: j.name },
      });
    }
    return renderMetrics(extra);
  }
}
