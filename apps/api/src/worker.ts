import { Worker } from 'bullmq';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const parsed = new URL(redisUrl);

const worker = new Worker(
  'dah-jobs',
  async (job) => {
    console.log(`Processing job ${job.name}`, job.data);
  },
  {
    connection: {
      host: parsed.hostname,
      port: Number(parsed.port) || 6379,
      maxRetriesPerRequest: null,
    },
  },
);

worker.on('completed', (job) => console.log(`Job ${job.id} completed`));
worker.on('failed', (job, err) => console.error(`Job ${job?.id} failed`, err));

console.log('DAH worker started');