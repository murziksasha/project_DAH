# 02. Архітектура

## Стек технологій

| Шар | Технологія |
|-----|------------|
| API | NestJS 11, Prisma 6, TypeScript |
| Web | Next.js 15 static export + React 19 PWA (nginx, без Node) |
| БД | PostgreSQL 16 |
| Worker jobs | Inline cron у slim worker (Redis **опційний**, profile `redis`) |
| Файли | MinIO (S3 API, internal) + same-origin `GET /api/files/download` |
| Proxy | nginx |
| Shared | `packages/shared` — enums, labels |

## Структура monorepo

```
project_DAH/   # legacy folder name; product: «Мій дім»
├── apps/
│   ├── api/          # NestJS backend
│   │   ├── prisma/   # schema, migrations, seed
│   │   └── src/
│   │       ├── modules/   # доменні модулі
│   │       ├── common/    # guards, decorators, utils
│   │       └── prisma/
│   └── web/          # Next.js PWA
│       ├── src/app/       # App Router pages
│       ├── public/        # manifest, sw.js, icons
│       └── e2e/           # Playwright
├── packages/shared/
├── infra/
│   ├── nginx/
│   ├── scripts/      # backup, restore, setup-test-db
│   └── certs/        # TLS (production)
├── SPEC/             # ця документація
├── docs/             # операційні гайди
└── docker-compose.yml
```

## Docker-сервіси

```mermaid
flowchart LR
  User[Користувач] --> Nginx
  Nginx --> Web[web static nginx :3000]
  Nginx --> API[api :3001]
  API --> PG[(postgres)]
  API --> MinIO[(minio internal)]
  Worker[worker slim] --> PG
```

| Сервіс | Порт (dev) | Призначення |
|--------|------------|-------------|
| nginx | 8080 | Reverse proxy (edge) |
| web | 3000 | Static PWA (`output: 'export'` → nginx:alpine) |
| api | 3001 | REST API |
| worker | — | Slim Nest context + inline cron (reminders, SLA, backups) |
| postgres | 5432 | PostgreSQL |
| redis | 6379 | **Optional** (`--profile redis`); not required for default jobs |
| minio | 9000 / 9001 | S3 API / Console (dev only; do not expose in prod) |

### Runtime slim (v1.14)

| Зміна | Деталі |
|-------|--------|
| Slim worker | `WorkerModule` — Prisma, Mail, Audit, Reminders, Backups, Notifications only |
| No BullMQ | Jobs: 15‑хв scan, daily/weekly backups via `setInterval` |
| File URLs | HMAC signed `/api/files/download?key&exp&sig` — browser never hits `:9000` |
| Static web | No Next.js Node process in Docker; client auth gate in `AppShell` |

## Web UI shell

| Компонент | Шлях | Призначення |
|-----------|------|-------------|
| `AppShell` | `apps/web/src/components/AppShell.tsx` | Header, drawer, logout |
| `admin/layout.tsx` | `apps/web/src/app/admin/` | Обгортка admin-сторінок |
| `resident/layout.tsx` | `apps/web/src/app/resident/` | Обгортка кабінету мешканця |
| `lib/auth.ts` | `apps/web/src/lib/` | `logout()`, `getRoleHome()` |
| `lib/nav-config.ts` | `apps/web/src/lib/` | Пункти меню за роллю |
| `globals.css` | `.app-shell`, `.app-drawer`, `.nav-scroll` | Адаптивні стилі |

Layouts: client-side auth (`getToken()` у `AppShell`). Edge middleware прибрано (static export).

## Модулі API

| Модуль | Prefix | Відповідальність |
|--------|--------|------------------|
| auth | `/api/auth` | JWT, реєстрація, login, sessions |
| building | `/api/building` | Будинки (multi), квартири, налаштування |
| finance | `/api/finance` | Фонди, витрати, постачальники, звіти |
| accruals | `/api/accruals` | Нарахування, квитанції PDF, timeline |
| payments | `/api/payments` | Платежі, FIFO, боржники, online webhook |
| journal | `/api/journal` | Immutable ledger + reconcile |
| documents | `/api/documents` | Публічні документи організації |
| transparency | `/api/transparency` | Дашборд прозорості |
| communications | `/api/communications` | Оголошення, заявки, опитування (вага/кворум) |
| notifications | `/api/notifications` | Web Push підписки |
| audit | `/api/audit` | Журнал аудиту |
| files | `/api/files` | Upload (JWT) + download stream (HMAC query, MinIO internal) |
| health | `/api/health` | Health (DB; Redis optional/skipped; MinIO; backup markers) |
| backups | `/api/backups` | Копії PostgreSQL: list/status, create, weekly, download, upload |

### Shared packages (v1.0)

| Package | Призначення |
|---------|-------------|
| `@dah/shared` | enums, permissions, labels |
| `@dah/money` | minor units arithmetic |
| `@dah/api-client` | shared TS API types |

### Multi-building

Один **tenant** (юридичне ОСББ) = **N будинків**. Клієнт передає `buildingId` (query/body); web switcher зберігає вибір у `localStorage`.

### Multi-tenant (v1.5+)

| Сутність | Поле |
|----------|------|
| `Tenant` | name, slug, isActive |
| `Building` | `tenantId` (обовʼязково) |
| `User` | identity; `tenantId` = активна org (null = platform `super_admin`) |
| `TenantMembership` | unique `(userId, tenantId, role)` — multi-org і **кілька ролей в одній org** |
| `TenantRole` | каталог assignable system-ролей на tenant (`isActive`, labels) |

JWT містить `tenantId` і role з **активного** membership (denormalized `User`).  
Не-super_admin бачить лише свої buildings/apartments. Super-admin для списку users / roles **зобовʼязаний** передати `X-Tenant-Id`.  
`GET/POST /tenants` — лише super_admin (`/admin/tenants`).  
`Tenant.isActive = false`: блокує login/refresh/JWT для users org; інші org того ж user — після `select-tenant`.  
Призначення ролі: лише якщо `TenantRole.isActive` (існуючі memberships з деактивованою роллю працюють).

## Ключові утиліти (бізнес-логіка)

Винесені в `apps/api/src/common/utils/` для unit-тестів:

- `money.ts` — округлення грошових сум
- `fifo-allocation.ts` — FIFO-розноска платежів
- `accrual-distribution.ts` — розрахунок нарахувань

## Аутентифікація

- Access token (JWT, 15 хв за замовчуванням)
- Refresh token (7 днів)
- Bearer header: `Authorization: Bearer <token>`
- Глобальний prefix API: `/api`

## Змінні середовища

Див. `.env.example`. Критичні для production:

- `JWT_SECRET`, `POSTGRES_PASSWORD`, `S3_SECRET_KEY`
- `DOMAIN`, `CORS_ORIGIN`, `NEXT_PUBLIC_API_URL`
- `VAPID_*` — для Web Push