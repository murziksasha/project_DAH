import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';
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

/** UTC day key YYYY-MM-DD for once-per-day guards. */
function utcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['error', 'warn', 'log'],
  });
  const reminders = app.get(RemindersService);
  const backups = app.get(BackupsService);
  const notifications = app.get(NotificationsService);
  const journal = app.get(JournalService);

  const timers: NodeJS.Timeout[] = [];
  let lastDailyKey = '';
  let lastWeeklyKey = '';
  let lastReconcileKey = '';
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
      const result = await notifications.processSlaAlerts();
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
      const result = await backups.ensureWeeklyBackup({ source: 'schedule' });
      logger.log(
        result.skipped
          ? `backups.weekly (${reason}): skipped (${result.weekKey} exists)`
          : `backups.weekly (${reason}): created ${result.relativePath}`,
      );
    } catch (err) {
      logger.error(
        `backups.weekly failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async function runDailyBackup(reason: string) {
    try {
      const result = await backups.createManualBackup({ source: 'schedule' });
      logger.log(`backups.daily (${reason}): created ${result.relativePath ?? 'ok'}`);
      await domainEvents.emit('backup.created', {
        relativePath: result.relativePath,
        sizeBytes: result.sizeBytes,
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
      const result = await journal.reconcile();
      if (result.ok) {
        logger.log(`journal.reconcile (${reason}): ok`);
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

  // UTC clock: daily ~02:00, weekly ensure ~03:00 (same cadence as previous BullMQ cron).
  timers.push(
    setInterval(() => {
      const now = new Date();
      const day = utcDayKey(now);
      const hour = now.getUTCHours();
      const min = now.getUTCMinutes();

      if (hour === 2 && min === 0 && lastDailyKey !== day) {
        lastDailyKey = day;
        void runDailyBackup('cron');
      }
      if (hour === 3 && min === 0 && lastWeeklyKey !== day) {
        lastWeeklyKey = day;
        void runWeeklyBackup('cron');
      }
      // Journal reconcile ~04:00 UTC
      if (hour === 4 && min === 0 && lastReconcileKey !== day) {
        lastReconcileKey = day;
        void runJournalReconcile('cron');
      }
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
