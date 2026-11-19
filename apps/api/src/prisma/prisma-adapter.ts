import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Prisma 7 requires a driver adapter. Pool defaults are aligned with Prisma 6 behaviour:
 * - connection_limit / pool_timeout / connect_timeout query params of DATABASE_URL are honoured
 *   (and stripped, node-postgres would forward unknown params to the server);
 * - `schema=` → search_path via adapter option;
 * - Prisma 6 used a 5 s connect timeout and num_cpus*2+1 connections.
 */
export function prismaPgAdapter(databaseUrl = process.env.DATABASE_URL): PrismaPg {
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');
  const { connectionString, pool, schema } = parseDatabaseUrl(databaseUrl);
  return new PrismaPg({ connectionString, ...pool }, schema ? { schema } : undefined);
}

export interface ParsedDatabaseUrl {
  connectionString: string;
  schema?: string;
  pool: {
    max: number;
    connectionTimeoutMillis: number;
    idleTimeoutMillis: number;
    /** idle pooled sockets must not keep CLI scripts / test runners alive (Prisma 6 parity) */
    allowExitOnIdle: boolean;
  };
}

const PRISMA_ONLY_PARAMS = [
  'connection_limit',
  'pool_timeout',
  'connect_timeout',
  'schema',
  'pgbouncer',
  'statement_cache_size',
  'socket_timeout',
];

export function parseDatabaseUrl(databaseUrl: string, cpus = defaultCpus()): ParsedDatabaseUrl {
  const url = new URL(databaseUrl);
  const p = url.searchParams;
  const num = (k: string) => {
    const v = Number(p.get(k));
    return p.has(k) && Number.isFinite(v) && v >= 0 ? v : undefined;
  };
  const max = num('connection_limit') || cpus * 2 + 1;
  const connectTimeoutSec = num('connect_timeout') ?? num('pool_timeout') ?? 5;
  const schema = p.get('schema') || undefined;
  for (const k of PRISMA_ONLY_PARAMS) p.delete(k);
  return {
    connectionString: url.toString(),
    schema: schema && schema !== 'public' ? schema : undefined,
    pool: { max, connectionTimeoutMillis: connectTimeoutSec * 1000, idleTimeoutMillis: 300_000, allowExitOnIdle: true },
  };
}

function defaultCpus(): number {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const os = require('os') as typeof import('os');
    return Math.max(1, os.availableParallelism?.() ?? os.cpus().length);
  } catch {
    return 1;
  }
}
