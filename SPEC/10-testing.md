# 10. Тестування

Детальний гайд: [docs/TESTING.md](../docs/TESTING.md)

## Піраміда тестів

```
        ┌─────────────┐
        │  Playwright │  Web e2e (smoke)
        ├─────────────┤
        │  Supertest  │  API e2e (integration)
        ├─────────────┤
        │    Jest     │  Unit (utils + services)
        └─────────────┘
```

## Команди

```bash
npm run test              # unit (API)
npm run test:cov          # coverage
npm run test:e2e          # API integration
npm run test:e2e:web      # Playwright
npm run test:all          # unit + API e2e
```

## Unit-тести

| Файл | Що перевіряє |
|------|--------------|
| `fifo-allocation.spec.ts` | FIFO, advance, статуси ліній |
| `accrual-distribution.spec.ts` | Розрахунок сум, валідація |
| `payments.service.spec.ts` | previewAllocation з mock Prisma |

## API e2e

База: **`dah_test`** (окрема від dev/prod!)

```bash
./infra/scripts/setup-test-db.sh
npm run test:e2e -w @dah/api
```

| Suite | Сценарії |
|-------|----------|
| `auth.e2e-spec.ts` | health, login, 401 |
| `payments.e2e-spec.ts` | FIFO preview, create payment |
| `communications.e2e-spec.ts` | vote, duplicate → 403 |

## Web e2e (Playwright)

```bash
npx playwright install chromium
npm run db:seed -w @dah/api
npm run dev:api & npm run dev:web &
npm run test:e2e -w @dah/web
```

| Spec | Сценарії |
|------|----------|
| `login.spec.ts` | форма, redirect resident/admin |
| `resident.spec.ts` | рахунок, вкладка новин |

## CI

`.github/workflows/test.yml`:
- `api-unit` — Jest + coverage
- `api-e2e` — PostgreSQL service + dah_test
- `web-e2e` — build + Playwright smoke

## Покриття (орієнтир)

| Область | Ціль |
|---------|------|
| FIFO, accrual utils | 80%+ |
| API e2e critical paths | 8+ сценаріїв |
| Web smoke | 5+ сценаріїв |
| Загальне API coverage | 40–60% (поступове зростання) |