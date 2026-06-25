# DAH — платформа управління ОСМД

Self-hosted аналог [ДАХ](https://dah-online.com/) для одного ОСМД/ОСББ: фінанси, внески, прозорість для мешканців, PWA замість нативного застосунку.

## Швидкий старт (Docker)

```bash
cp .env.example .env
docker compose up -d
```

- **PWA / Web**: http://localhost:8080
- **API**: http://localhost:3001/api
- **Swagger**: http://localhost:3001/api/docs
- **MinIO Console**: http://localhost:9001

Після першого запуску API застосує міграції. Заповніть демо-дані:

```bash
docker compose exec api npx ts-node prisma/seed.ts
```

## Демо-облікові записи

| Email | Пароль | Роль |
|-------|--------|------|
| chairman@osbb.local | password123 | Голова правління |
| accountant@osbb.local | password123 | Бухгалтер |
| auditor@osbb.local | password123 | Ревізійна комісія |
| resident@osbb.local | password123 | Мешканець |

## Локальна розробка

```bash
npm install
docker compose up -d postgres redis minio minio-init
cp .env.example .env

npm run db:generate -w @dah/api
npm run db:migrate:dev -w @dah/api
npm run db:seed -w @dah/api

npm run dev:api   # :3001
npm run dev:web   # :3000
```

## Структура

- `apps/api` — NestJS + Prisma + PostgreSQL
- `apps/web` — Next.js 15 PWA
- `packages/shared` — спільні типи та константи
- `SPEC/` — **специфікація проєкту** (архітектура, API, фінанси, ролі)
- `infra/nginx` — reverse proxy (+ HTTPS для production)
- `infra/scripts` — backup / restore
- `docs/DEPLOY.md` — production-гайд

Повна документація: **[SPEC/README.md](SPEC/README.md)**

## Production

```bash
# TLS-сертифікати в infra/certs/ (див. docs/DEPLOY.md)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Резервне копіювання:

```bash
npm run backup                              # швидкий dump БД
./infra/scripts/backup.sh                   # БД + файли MinIO
```

## MVP roadmap

- [x] Фаза 0: scaffold, Docker, auth, seed
- [x] Фаза 1: CRUD витрат + MinIO
- [x] Фаза 2: нарахування, лицеві рахунки, квитанції PDF
- [x] Фаза 3: платежі, розноска FIFO, звіти (боржники)
- [x] Фаза 4: прозорість жильця (дашборд, документи, боржники)
- [x] Фаза 5: комунікації + Web Push + PWA
- [x] Фаза 6: backup, аудит, HTTPS, deploy docs
- [x] Фаза 7: тестування (Jest unit/e2e, Playwright, CI)
- [x] Фаза 8: документація (SPEC/)

## Тестування

```bash
npm run test              # unit (API)
npm run test:cov          # coverage
npm run test:e2e          # API integration (потрібен dah_test)
npm run test:e2e:web      # Playwright smoke
```

Деталі: [docs/TESTING.md](docs/TESTING.md)