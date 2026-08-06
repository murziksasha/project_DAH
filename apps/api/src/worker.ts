import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';
import { BackupsService } from './modules/backups/backups.service';
import { NotificationsService } from './modules/notifications/notifications.service';
import { RemindersService } from './modules/reminders/reminders.service';

const logger = new Logger('Worker');

const SCAN_MS = 15 * 60 * 1000;
const CLOCK_MS = 60 * 1000;

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

  const timers: NodeJS.Timeout[] = [];
  let lastDailyKey = '';
  let lastWeeklyKey = '';
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
        `reminders.scan (${reason}): custom=${result.customSent} debt=${result.debtSent} overdue=${result.markedOverdue}`,
      );
    } catch (err) {
      logger.error(
        `reminders.scan failed: ${err instanceof Error ? err.message : String(err)}`,
      );
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
    } catch (err) {
      logger.error(`sla.scan failed: ${err instanceof Error ? err.message : String(err)}`);
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
    } catch (err) {
      logger.error(
        `backups.daily failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Boot: scan immediately; weekly once (skips if slot exists). Daily is schedule-only.
  await runRemindersScan('boot');
  await runSlaScan('boot');
  await runWeeklyBackup('boot');

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
    }, CLOCK_MS),
  );

  logger.log(
    'Мій дім worker started (slim module, inline cron: reminders + SLA + daily/weekly backups; no Redis/BullMQ)',
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
