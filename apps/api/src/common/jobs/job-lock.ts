import { hostname } from 'os';

/**
 * M9: cross-process job lease + "last run" marker (table "WorkerJob").
 * - Two workers (or a worker and a manual `POST /reminders/process`) never run the same job at once.
 * - Daily jobs catch up after a restart (slot missed while the worker was down).
 */
export interface JobLockClient {
  $queryRaw?: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
  $executeRaw?: (query: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
}

export const JOB_OWNER = `${hostname()}:${process.pid}`;

export async function tryAcquireJob(
  db: JobLockClient,
  name: string,
  ttlMs: number,
  owner = JOB_OWNER,
): Promise<boolean> {
  if (typeof db.$queryRaw !== 'function') return true; // unit-test mocks
  const ttlSec = Math.max(1, Math.round(ttlMs / 1000));
  const rows = await db.$queryRaw<Array<{ name: string }>>`
    INSERT INTO "WorkerJob" ("name", "lockedUntil", "lockedBy", "updatedAt")
    VALUES (${name}, (NOW() AT TIME ZONE 'UTC') + make_interval(secs => ${ttlSec}::double precision), ${owner}, (NOW() AT TIME ZONE 'UTC'))
    ON CONFLICT ("name") DO UPDATE
      SET "lockedUntil" = EXCLUDED."lockedUntil", "lockedBy" = EXCLUDED."lockedBy", "updatedAt" = (NOW() AT TIME ZONE 'UTC')
      WHERE "WorkerJob"."lockedUntil" IS NULL OR "WorkerJob"."lockedUntil" < (NOW() AT TIME ZONE 'UTC')
    RETURNING "name"
  `;
  return Array.isArray(rows) && rows.length > 0;
}

export async function releaseJob(
  db: JobLockClient,
  name: string,
  status: 'ok' | 'failed',
  error?: string,
): Promise<void> {
  if (typeof db.$executeRaw !== 'function') return;
  const err = error ? error.slice(0, 2000) : null;
  if (status === 'ok') {
    await db.$executeRaw`
      UPDATE "WorkerJob" SET "lockedUntil" = NULL, "lockedBy" = NULL, "lastRunAt" = (NOW() AT TIME ZONE 'UTC'),
        "lastStatus" = 'ok', "lastError" = NULL, "updatedAt" = (NOW() AT TIME ZONE 'UTC')
      WHERE "name" = ${name}
    `;
  } else {
    await db.$executeRaw`
      UPDATE "WorkerJob" SET "lockedUntil" = NULL, "lockedBy" = NULL,
        "lastStatus" = 'failed', "lastError" = ${err}, "updatedAt" = (NOW() AT TIME ZONE 'UTC')
      WHERE "name" = ${name}
    `;
  }
}

export async function lastJobRun(db: JobLockClient, name: string): Promise<Date | null> {
  if (typeof db.$queryRaw !== 'function') return null;
  const rows = await db.$queryRaw<Array<{ lastRunAt: Date | null }>>`
    SELECT "lastRunAt" FROM "WorkerJob" WHERE "name" = ${name}
  `;
  return rows?.[0]?.lastRunAt ?? null;
}

export type ExclusiveResult<T> = { skipped: true } | { skipped: false; result: T };

/** Run `fn` only if no other process holds the lease; records success/failure. */
export async function runExclusive<T>(
  db: JobLockClient,
  name: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<ExclusiveResult<T>> {
  if (!(await tryAcquireJob(db, name, ttlMs))) return { skipped: true };
  try {
    const result = await fn();
    await releaseJob(db, name, 'ok');
    return { skipped: false, result };
  } catch (e) {
    await releaseJob(db, name, 'failed', e instanceof Error ? e.message : String(e)).catch(
      () => undefined,
    );
    throw e;
  }
}

/**
 * Daily slot at `hourUtc`:00 is due when the slot of today has passed and the job
 * has not succeeded since that slot (catch-up after downtime). Never runs twice per slot.
 */
export function dailySlotDue(now: Date, hourUtc: number, lastRunAt: Date | null): boolean {
  const slot = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc, 0, 0, 0),
  );
  if (now < slot) return false;
  return !lastRunAt || lastRunAt < slot;
}
