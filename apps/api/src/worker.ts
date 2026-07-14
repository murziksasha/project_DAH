import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { Worker, Queue } from 'bullmq';
import { AppModule } from './app.module';
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

  // Run once on start
  await queue.add('reminders.scan', { boot: true }, { removeOnComplete: true });

  const worker = new Worker(
    'dah-jobs',
    async (job) => {
      if (job.name === 'reminders.scan') {
        const result = await reminders.processDue();
        logger.log(`reminders.scan: custom=${result.customSent} debt=${result.debtSent}`);
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

  logger.log('DAH worker started (email reminders + job queue)');

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
