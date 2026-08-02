# Тестування «Мій дім»

## Структура

| Рівень | Інструмент | Що покриває |
|--------|------------|-------------|
| Unit | Jest | FIFO-розноска, нарахування, сервіси з mock Prisma |
| API e2e | Jest + Supertest | auth, payments, communications |
| Web e2e | Playwright | логін, кабінет мешканця |

## Швидкий старт

```bash
npm install
npm run db:generate -w @dah/api   # required before unit/e2e (Prisma Client)

# Unit-тести (без БД)
npm run test -w @dah/api

# Покриття
npm run test:cov -w @dah/api

# API e2e (потрібен PostgreSQL)
docker compose up -d postgres
chmod +x infra/scripts/setup-test-db.sh
./infra/scripts/setup-test-db.sh   # creates dah_test + migrate (sets DATABASE_URL)
export DATABASE_URL=postgresql://dah:dah_secret_change_me@localhost:5432/dah_test
npm run test:e2e -w @dah/api

# Web e2e (API + web + seed) — uses main DB `dah` (or DATABASE_URL from .env)
docker compose up -d postgres redis minio minio-init
npm run db:migrate -w @dah/api
npm run db:seed -w @dah/api       # loads ../../.env if present; needs DATABASE_URL
npm run dev:api   # термінал 1
npm run dev:web   # термінал 2
npx playwright install chromium
npm run test:e2e -w @dah/web
```

## Змінні для e2e

API e2e використовує окрему БД `dah_test` (див. `apps/api/test/setup-env.ts`):

```
DATABASE_URL=postgresql://dah:dah_secret_change_me@localhost:5432/dah_test
JWT_SECRET=test-jwt-secret-for-e2e-only
```

`test:e2e:setup` runs `prisma migrate deploy` against the current `DATABASE_URL` (CI sets this per job).

**Не запускайте e2e на production БД** — тести очищають дані.

## CI

GitHub Actions (`.github/workflows/test.yml`):
- `api-unit` — `prisma generate` + unit + coverage
- `api-e2e` — create `dah_test`, migrate, Jest e2e
- `web-e2e` — migrate + seed on `dah`, Playwright smoke
- `lint-typecheck` — web `tsc` + lint (non-blocking)

## Критична логіка (пріоритет покриття)

- `src/common/utils/fifo-allocation.ts` — FIFO платежів
- `src/common/utils/accrual-distribution.ts` — розрахунок нарахувань
- `PaymentsService.previewAllocation`
- Голосування в опитуваннях (1 голос / користувач)