# DAH — платформа управління ОСМД

**v1.0.0** — self-hosted платформа для ОСМД/ОСББ: фінанси, внески, прозорість, PWA, multi-building.

Self-hosted аналог [ДАХ](https://dah-online.com/) для одного ОСББ (один або кілька будинків).

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

## Roadmap

- [x] MVP фази 0–8 (див. SPEC/11-roadmap.md)
- [x] **v1.0–1.5.1** план глибокого поліпшення — **завершено**  
  (sessions, journal, multi-building, meters, export, SMS, Diia mock, multi-tenant + full scope)

Поточна версія: **1.5.1**. Деталі: [SPEC/11-roadmap.md](SPEC/11-roadmap.md), [CHANGELOG.md](CHANGELOG.md).  
Оновлення з 0.9: [docs/UPGRADE-0.9-to-1.0.md](docs/UPGRADE-0.9-to-1.0.md)

## Тестування

```bash
npm run test              # unit (API)
npm run test:cov          # coverage
npm run test:e2e          # API integration (потрібен dah_test)
npm run test:e2e:web      # Playwright smoke
```

Деталі: [docs/TESTING.md](docs/TESTING.md)