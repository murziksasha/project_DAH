import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { Worker, Queue } from 'bullmq';
import { AppModule } from './app.module';
import { BackupsService } from './modules/backups/backups.service';
import { NotificationsService } from './modules/notifications/notifications.service';
import { RemindersService } from './modules/reminders/reminders.service';

const logger = new Logger('Worker');
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

function redisConnection() {
  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
    maxRetriesPerRequest: null as null,
  };
}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const reminders = app.get(RemindersService);
  const backups = app.get(BackupsService);
  const notifications = app.get(NotificationsService);
  const connection = redisConnection();

  const queue = new Queue('dah-jobs', { connection });

  // Ensure recurring scan every 15 minutes
  await queue.add(
    'reminders.scan',
    {},
    {
      repeat: { every: 15 * 60 * 1000 },
      removeOnComplete: 100,
      removeOnFail: 50,
      jobId: 'reminders-scan-repeat',
    },
  );

  // SLA warning / breach notifications every 15 minutes
  await queue.add(
    'sla.scan',
    {},
    {
      repeat: { every: 15 * 60 * 1000 },
      removeOnComplete: 100,
      removeOnFail: 50,
      jobId: 'sla-scan-repeat',
    },
  );

  // Daily ~03:00 UTC: ensure one weekly DB copy (skips if week already exists)
  await queue.add(
    'backups.weekly',
    {},
    {
      repeat: { pattern: '0 3 * * *' },
      removeOnComplete: 50,
      removeOnFail: 20,
      jobId: 'backups-weekly-repeat',
    },
  );

  // Daily ~02:00 UTC: manual-style daily dump (always creates a new manual slot)
  await queue.add(
    'backups.daily',
    {},
    {
      repeat: { pattern: '0 2 * * *' },
      removeOnComplete: 50,
      removeOnFail: 20,
      jobId: 'backups-daily-repeat',
    },
  );

  // Run once on start
  await queue.add('reminders.scan', { boot: true }, { removeOnComplete: true });
  await queue.add('sla.scan', { boot: true }, { removeOnComplete: true });
  await queue.add('backups.weekly', { boot: true }, { removeOnComplete: true });

  const worker = new Worker(
    'dah-jobs',
    async (job) => {
      if (job.name === 'reminders.scan') {
        const result = await reminders.processDue();
        logger.log(`reminders.scan: custom=${result.customSent} debt=${result.debtSent}`);
        return result;
      }
      if (job.name === 'sla.scan') {
        const result = await notifications.processSlaAlerts();
        logger.log(
          `sla.scan: warned=${result.warned} breached=${result.breached} scanned=${result.scanned}`,
        );
        return result;
      }
      if (job.name === 'backups.weekly') {
        const result = await backups.ensureWeeklyBackup({ source: 'schedule' });
        logger.log(
          result.skipped
            ? `backups.weekly: skipped (${result.weekKey} exists)`
            : `backups.weekly: created ${result.relativePath}`,
        );
        return result;
      }
      if (job.name === 'backups.daily') {
        const result = await backups.createManualBackup({ source: 'schedule' });
        logger.log(`backups.daily: created ${result.relativePath ?? 'ok'}`);
        return result;
      }
      logger.warn(`Unknown job ${job.name}`);
      return null;
    },
    { connection },
  );

  worker.on('failed', (job, err) => {
    logger.error(`Job ${job?.name} failed: ${err.message}`);
  });

  logger.log('Мій дім worker started (reminders + SLA + daily/weekly backups)');

  const shutdown = async () => {
    await worker.close();
    await queue.close();
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
