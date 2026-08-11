# Мій дім — платформа для ОСББ та УК

Self-hosted кабінет для **ОСББ** і **управляючих компаній (УК)**: фінанси, внески, прозорість, PWA, multi-building.

> Технічний каталог/пакети можуть називатися `project_DAH` / `@dah/*` — **продуктова назва**: **Мій дім**.

## Швидкий старт (Docker)

```bash
cp .env.example .env
docker compose up -d
```

- **PWA / Web**: http://localhost:8080
- **API**: http://localhost:3001/api
- **Swagger**: http://localhost:3001/api/docs (**Мій дім API**)
- **MinIO Console**: http://localhost:9001

Після першого запуску API застосує міграції. Заповніть демо-дані:

```bash
docker compose exec api npx ts-node prisma/seed.ts
```

## Демо-облікові записи

| Email | Пароль | Роль |
|-------|--------|------|
| chairman@osbb.local | password123 | Голова / керівник |
| accountant@osbb.local | password123 | Бухгалтер |
| auditor@osbb.local | password123 | Ревізійна комісія |
| resident@osbb.local | password123 | Мешканець |

Демо-організація: `orgType = osbb`. Super-admin може створити **УК** на `/admin/tenants`.  
**Вимкнення організації** (`isActive`) одразу блокує вхід і сесії голови/правління/мешканців — super-admin головніший за ролі tenant.

## Локальна розробка

```bash
npm install
docker compose up -d postgres minio minio-init
cp .env.example .env
```

Redis **не потрібен** за замовчуванням (worker — inline cron). Опційно: `npm run docker:infra:redis`.

Далі: `npm run dev` (або окремо `dev:api` / `dev:web`). Документація: [SPEC/](./SPEC/).

## Native (без Docker) — ноутбук як хост

| ОС хоста | Інструкція |
|----------|------------|
| **Linux** (Ubuntu/Lubuntu) | [docs/NATIVE-HOST.md](./docs/NATIVE-HOST.md) — systemd: `npx dah-native install` |
| **Windows** | [docs/NATIVE-HOST-WINDOWS.md](./docs/NATIVE-HOST-WINDOWS.md) — **без** install-скрипта (немає systemd) |

**Linux** (коротко):

```bash
# .env: 127.0.0.1, REDIS_URL=none
npm install && npm run build && npm run db:migrate
npx dah-native install    # служби; Linux + sudo
npm run update:native
```

**Windows без Docker** (коротко):

```powershell
# .env: 127.0.0.1, REDIS_URL=none; PostgreSQL уже встановлений і запущений
npm run install:native:win
# = install-native-windows.ps1 → build, migrate, MinIO, API, worker, Scheduled Task
# npx dah-native install   # на Windows теж викликає цей скрипт

npm run start:native:win     # ручний старт стеку
npm run update:native:win    # pull → build → migrate → restart
npm run status:native:win    # порти / health / Task
npm run backup:native        # pg_dump без Docker
npm run smoke:native:win

# docs/NATIVE-HOST-WINDOWS.md
# KeenDNS (напр. dim.properservice.keenetic.pro): docs/KEENDNS-WINDOWS.md
```

Також: [docs/DEPLOY.md](./docs/DEPLOY.md).

## Організації

| Тип | Код | Призначення |
|-----|-----|-------------|
| ОСББ | `osbb` | Самоуправління співвласників |
| УК | `management_company` | Управляюча компанія, портфель будинків |

Деталі: [SPEC/12-organization-types.md](./SPEC/12-organization-types.md).

Поточна версія: **1.14.0** — [CHANGELOG.md](./CHANGELOG.md), [SPEC/](./SPEC/).  
Prod security: [docs/SECURITY-CHECKLIST.md](./docs/SECURITY-CHECKLIST.md).  
Конструктор квитанцій / звітів: `/admin/document-templates`.  
Диспетчерська SLA: `/admin/dispatch`. Імпорт виписки: `/admin/payments` → «Імпорт».  
Збори: `/admin/meetings` · Месенджер: `/admin/messenger` · `/resident/messenger`.  
Скидання пароля: login → «Забули пароль?» (потрібен SMTP / `APP_URL`).
