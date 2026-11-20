import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 CLI config (migrate / generate / studio). Env is NOT auto-loaded by Prisma 7:
 * the npm scripts keep using `dotenv -e ../../.env -- prisma …`, Docker/CI pass DATABASE_URL.
 * `prisma generate` does not connect, so a placeholder keeps image builds working without a DB.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://placeholder:placeholder@localhost:5432/placeholder',
  },
});
