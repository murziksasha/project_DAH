# Тестування DAH

## Структура

| Рівень | Інструмент | Що покриває |
|--------|------------|-------------|
| Unit | Jest | FIFO-розноска, нарахування, сервіси з mock Prisma |
| API e2e | Jest + Supertest | auth, payments, communications |
| Web e2e | Playwright | логін, кабінет мешканця |

## Швидкий старт

```bash
npm install

# Unit-тести (без БД)
npm run test -w @dah/api

# Покриття
npm run test:cov -w @dah/api

# API e2e (потрібен PostgreSQL)
docker compose up -d postgres
chmod +x infra/scripts/setup-test-db.sh
./infra/scripts/setup-test-db.sh
npm run test:e2e -w @dah/api

# Web e2e (API + web + seed)
docker compose up -d postgres redis minio minio-init
npm run db:seed -w @dah/api
npm run dev:api   # термінал 1
npm run dev:web   # термінал 2
npx playwright install chromium
npm run test:e2e -w @dah/web
```

## Змінні для e2e

API e2e використовує окрему БД `dah_test` (див. `apps/api/test/setup-env.ts`):

```
DATABASE_URL=postgresql://dah:dah_secret_change_me@localhost:5432/dah_test
```

**Не запускайте e2e на production БД** — тести очищають дані.

## CI

GitHub Actions (`.github/workflows/test.yml`):
- `api-unit` — unit + coverage
- `api-e2e` — integration на `dah_test`
- `web-e2e` — Playwright smoke

## Критична логіка (пріоритет покриття)

- `src/common/utils/fifo-allocation.ts` — FIFO платежів
- `src/common/utils/accrual-distribution.ts` — розрахунок нарахувань
- `PaymentsService.previewAllocation`
- Голосування в опитуваннях (1 голос / користувач)