import { parseDatabaseUrl } from './prisma-adapter';

describe('parseDatabaseUrl (Prisma 7 adapter-pg, Prisma 6 pool parity)', () => {
  it('defaults: num_cpus*2+1 connections, 5s connect timeout, public schema', () => {
    const r = parseDatabaseUrl('postgresql://u:p@h:5432/db', 4);
    expect(r.connectionString).toBe('postgresql://u:p@h:5432/db');
    expect(r.pool.max).toBe(9);
    expect(r.pool.connectionTimeoutMillis).toBe(5000);
    expect(r.schema).toBeUndefined();
  });
  it('honours and strips Prisma-only params', () => {
    const r = parseDatabaseUrl('postgresql://u:p@h/db?connection_limit=3&connect_timeout=10&schema=app&sslmode=require', 4);
    expect(r.pool.max).toBe(3);
    expect(r.pool.connectionTimeoutMillis).toBe(10000);
    expect(r.schema).toBe('app');
    expect(r.connectionString).toBe('postgresql://u:p@h/db?sslmode=require');
  });
});
