# Тестування «Мій дім»

## Структура

| Рівень | Інструмент | Що покриває |
|--------|------------|-------------|
| Unit | Jest | FIFO-розноска, нарахування, сервіси з mock Prisma |
| API e2e | Jest + Supertest | auth, payments, communications |
| Web e2e | Playwright | логін, кабінет мешканця |

## Перед push (рекомендовано)

```bash
npm run prepush
# alias: npm run check
# = typecheck (packages + Prisma generate + api/web tsc) + unit tests (money, api, web)
```

Окремі кроки:

| Команда | Що робить | БД |
|---------|-----------|----|
| `npm run typecheck` | build packages → `db:generate` → `tsc --noEmit` api + web | ні |
| `npm run test:unit` | unit: `@dah/shared`, `@dah/money`, `@dah/api`, `@dah/web` | ні |
| `npm run check` / `prepush` | typecheck + test:unit | ні |
| `npm run test` | лише API unit (Jest) | ні |
| `npm run test:e2e` | API e2e | так (`dah_test`) |
| `npm run test:e2e:web` | Playwright | так + running app |
| `npm run lint` | ESLint / next lint (може бути не сконфігуровано локально) | ні |

## Швидкий старт

```bash
npm install
npm run db:generate -w @dah/api   # required before unit/e2e (Prisma Client)

# Перед push (typecheck + unit, без БД)
npm run prepush

# Unit-тести (без БД)
npm run test:unit
# або лише API:
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
- `typecheck` — `npm run typecheck` + lint (lint still non-blocking)

API/web e2e run locally only (`npm run test:e2e`, `npm run test:e2e:web`) — not in CI.

## Критична логіка (пріоритет покриття)

- `src/common/utils/fifo-allocation.ts` — FIFO платежів
- `src/common/utils/accrual-distribution.ts` — розрахунок нарахувань
- `PaymentsService.previewAllocation`
- Голосування в опитуваннях (1 голос / користувач)