import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';
import { createAppLogger } from './common/logging/json-logger';
import { assertProductionSecrets } from './common/config/secrets.config';
import { dailySlotDue, lastJobRun, runExclusive } from './common/jobs/job-lock';
import { PrismaService } from './prisma/prisma.service';
import { domainEvents } from './common/utils/domain-events';
import { BackupsService } from './modules/backups/backups.service';
import { JournalService } from './modules/journal/journal.service';
import { NotificationsService } from './modules/notifications/notifications.service';
import { RemindersService } from './modules/reminders/reminders.service';

const logger = new Logger('Worker');

const SCAN_MS = 15 * 60 * 1000;
const CLOCK_MS = 60 * 1000;

/** Persist last job markers for /admin/ops (file under BACKUP_DIR or cwd). */
async function writeWorkerMarker(
  job: string,
  status: 'ok' | 'failed',
  detail?: Record<string, unknown>,
) {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const dir =
      process.env.BACKUP_DIR?.trim() ||
      path.resolve(process.cwd(), '../../backups');
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, 'worker-last.json');
    let prev: Record<string, unknown> = {};
    try {
      prev = JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>;
    } catch {
      /* first run */
    }
    const next = {
      ...prev,
      [job]: {
        status,
        at: new Date().toISOString(),
        ...detail,
      },
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(file, JSON.stringify(next, null, 2), 'utf8');
  } catch {
    /* non-fatal */
  }
}

async function bootstrap() {
  assertProductionSecrets();
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: createAppLogger(),
  });
  const reminders = app.get(RemindersService);
  const backups = app.get(BackupsService);
  const notifications = app.get(NotificationsService);
  const journal = app.get(JournalService);
  const prisma = app.get(PrismaService);

  /** M9: lease so that several workers never run one job concurrently. */
  async function exclusive(job: string, ttlMs: number, fn: () => Promise<void>) {
    const r = await runExclusive(prisma, job, ttlMs, fn);
    if (r.skipped) logger.warn(`${job}: skipped (lease held by another process)`);
  }

  const timers: NodeJS.Timeout[] = [];
  let clockBusy = false;
  let scanRunning = false;
  let slaRunning = false;

  async function runRemindersScan(reason: string) {
    if (scanRunning) {
      logger.warn(`reminders.scan skipped (already running, ${reason})`);
      return;
    }
    scanRunning = true;
    try {
      const result = await reminders.processDue();
      if (result.skipped) {
        logger.warn(`reminders.scan (${reason}): skipped, another process is running it`);
        return;
      }
      logger.log(
        `reminders.scan (${reason}): custom=${result.customSent} debt=${result.debtSent} overdue=${result.markedOverdue} penalty=${result.penaltyLines}`,
      );
      await writeWorkerMarker('reminders', 'ok', {
        customSent: result.customSent,
        debtSent: result.debtSent,
        penaltyLines: result.penaltyLines,
        reason,
      });
    } catch (err) {
      logger.error(
        `reminders.scan failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      await writeWorkerMarker('reminders', 'failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      scanRunning = false;
    }
  }

  async function runSlaScan(reason: string) {
    if (slaRunning) {
      logger.warn(`sla.scan skipped (already running, ${reason})`);
      return;
    }
    slaRunning = true;
    try {
      const lease = await runExclusive(prisma, 'sla_scan', 30 * 60 * 1000, () =>
        notifications.processSlaAlerts(),
      );
      if (lease.skipped) return;
      const result = lease.result;
      logger.log(
        `sla.scan (${reason}): warned=${result.warned} breached=${result.breached} scanned=${result.scanned}`,
      );
      await writeWorkerMarker('sla', 'ok', {
        warned: result.warned,
        breached: result.breached,
        reason,
      });
    } catch (err) {
      logger.error(`sla.scan failed: ${err instanceof Error ? err.message : String(err)}`);
      await writeWorkerMarker('sla', 'failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      slaRunning = false;
    }
  }

  async function runWeeklyBackup(reason: string) {
    try {
      await exclusive('backup_weekly', 6 * 60 * 60 * 1000, async () => {
        const result = await backups.ensureWeeklyBackup({ source: 'schedule' });
        logger.log(
          result.skipped
            ? `backups.weekly (${reason}): skipped (${result.weekKey} exists)`
            : `backups.weekly (${reason}): created ${result.relativePath}`,
        );
      });
    } catch (err) {
      logger.error(
        `backups.weekly failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async function runDailyBackup(reason: string) {
    try {
      await exclusive('backup_daily', 6 * 60 * 60 * 1000, async () => {
        const result = await backups.createManualBackup({ source: 'schedule' });
        logger.log(`backups.daily (${reason}): created ${result.relativePath ?? 'ok'}`);
        await domainEvents.emit('backup.created', {
          relativePath: result.relativePath,
          sizeBytes: result.sizeBytes,
        });
      });
    } catch (err) {
      logger.error(
        `backups.daily failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Journal vs legacy fields — alert if mismatches (Package E SoT dual-run). */
  async function runJournalReconcile(reason: string) {
    try {
      const lease = await runExclusive(prisma, 'journal_reconcile', 60 * 60 * 1000, async () => {
        const reconcile = await journal.reconcile();
        // Roadmap «Journal as SoT»: per-building shadow-compare history (readiness streak).
        const shadow = await journal.recordShadowRunsForAll().catch((err: unknown) => {
          logger.warn(`journal shadow runs failed: ${err instanceof Error ? err.message : String(err)}`);
          return [];
        });
        return { ...reconcile, shadowReady: shadow.filter((r) => r.readyForSot).length, shadowTotal: shadow.length };
      });
      if (lease.skipped) return;
      const result = lease.result;
      if (result.ok) {
        logger.log(
          `journal.reconcile (${reason}): ok; shadow readyForSot ${result.shadowReady}/${result.shadowTotal}`,
        );
        await writeWorkerMarker('journal_reconcile', 'ok', { reason });
      } else {
        logger.warn(
          `journal.reconcile (${reason}): mismatches=${result.mismatchCount}`,
        );
        await writeWorkerMarker('journal_reconcile', 'failed', {
          mismatchCount: result.mismatchCount,
          reason,
        });
        await domainEvents.emit('journal.reconcile_mismatch', {
          count: result.mismatchCount,
          sample: result.mismatches.slice(0, 5).map((m) => `${m.kind}:${m.label}`),
        });
      }
    } catch (err) {
      logger.error(
        `journal.reconcile failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      await writeWorkerMarker('journal_reconcile', 'failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Boot: scan immediately; weekly once (skips if slot exists). Daily is schedule-only.
  await runRemindersScan('boot');
  await runSlaScan('boot');
  await runWeeklyBackup('boot');
  await runJournalReconcile('boot');

  timers.push(
    setInterval(() => {
      void runRemindersScan('interval');
      void runSlaScan('interval');
    }, SCAN_MS),
  );

  // UTC clock with catch-up (M9): a slot missed while the worker was down runs on the
  // next tick; the WorkerJob lease + lastRunAt make each slot run once across workers.
  const DAILY_JOBS: Array<{ job: string; hourUtc: number; run: (reason: string) => Promise<void> }> = [
    { job: 'backup_daily', hourUtc: 2, run: runDailyBackup },
    { job: 'backup_weekly', hourUtc: 3, run: runWeeklyBackup },
    { job: 'journal_reconcile', hourUtc: 4, run: runJournalReconcile },
  ];
  timers.push(
    setInterval(() => {
      if (clockBusy) return;
      clockBusy = true;
      void (async () => {
        try {
          const now = new Date();
          for (const j of DAILY_JOBS) {
            const last = await lastJobRun(prisma, j.job);
            if (dailySlotDue(now, j.hourUtc, last)) await j.run(last ? 'cron' : 'cron-first');
          }
        } catch (err) {
          logger.error(`scheduler tick failed: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          clockBusy = false;
        }
      })();
    }, CLOCK_MS),
  );

  logger.log(
    'Мій дім worker started (slim: reminders + SLA + backups + journal reconcile; no Redis/BullMQ)',
  );

  const shutdown = async () => {
    for (const t of timers) clearInterval(t);
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
