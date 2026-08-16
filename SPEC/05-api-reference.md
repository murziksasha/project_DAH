# 05. API Reference

**Base URL:** `http://localhost:3001/api` (dev) або `https://<domain>/api` (prod)

**Auth:** `Authorization: Bearer <accessToken>`

**Swagger:** `/api/docs` — **Мій дім API**

**Tenancy headers:** super_admin може передати `X-Tenant-Id` для контексту організації.

---

## Tenants (super_admin)

| Method | Path | Опис |
|--------|------|------|
| GET | `/tenants` | Список організацій (`orgType`, counts) |
| GET | `/tenants/:id` | Деталі + buildings |
| POST | `/tenants` | Створити: `name`, `slug`, **`orgType`** (`osbb` \| `management_company`), optional chairman email/password |
| PATCH | `/tenants/:id` | `name`, `isActive`, **`orgType`** |

Login / refresh: `user.tenant = { id, name, slug, orgType }`.  
`GET /auth/me` також повертає `tenant`.

**Деактивація (`isActive: false`):**
- Одного разу при переході active → inactive API **відкликає** refresh-сесії всіх users організації.
- Подальші `POST /auth/login`, `POST /auth/refresh`, `POST /auth/2fa/verify` і будь-який Bearer JWT для users цього tenant → `401`  
  (`Організацію (tenant) деактивовано…`).
- Web: редірект на `/login?reason=tenant_inactive` без циклу «кабінет → login → кабінет».
- `isActive: true` знову дозволяє login; старі токени не воскресають.

---

## Setup (super_admin)

| Method | Path | Auth | Опис |
|--------|------|------|------|
| GET | `/setup/status` | super_admin | Стан майстра + resume **для tenant** |
| POST | `/setup/building` | super_admin | Створити/оновити будинок організації (upsert) |
| POST | `/setup/bank` | super_admin | Банк + фонди (ідемпотентно) |
| POST | `/setup/apartments` | super_admin | Масове додавання квартир |
| POST | `/setup/users` | super_admin | Ключові ролі (ідемпотентно) |
| POST | `/setup/complete` | super_admin | `Building.isInitialized = true` |

### Tenant scope

- Усі `/setup/*` приймають **`X-Tenant-Id`** (або `?tenantId=`): building, users і complete застосовуються **лише** до цієї організації.
- Web (`apiFetch`) автоматично додає header з `localStorage.dah_tenant_id` (кнопка **Обрати** на `/admin/tenants`).
- **Без** `X-Tenant-Id`: legacy bootstrap — перший building за `createdAt` (greenfield / e2e без multi-tenant контексту).
- `POST /tenants` створює building з **`isInitialized: false`** — для нової org потрібен майстер (або ручне доналаштування), поки `POST /setup/complete` не виставить `true`.
- «Організації вже є» ≠ setup завершено: пункт меню «Майстер» залежить від **`isInitialized` вибраного** tenant, не від кількості rows у `/tenants`.

`GET /setup/status` відповідь (додаткові поля для resume):

```json
{
  "hasBuilding": true,
  "isInitialized": false,
  "apartmentCount": 0,
  "fundCount": 2,
  "hasChairman": false,
  "hasAccountant": false,
  "hasAuditor": false,
  "canComplete": false,
  "nextStep": 2,
  "stepDone": { "building": true, "bank": true, "apartments": false, "users": false },
  "deferredSetupRoles": ["accountant"],
  "pendingDeferredRoles": ["accountant"],
  "building": { "name": "...", "address": "...", "edrpou": null },
  "bankAccount": { "bankName": "...", "iban": "...", "description": "..." }
}
```

- Ключові users у status / setup рахуються **в межах tenant** (primary `user.tenantId` або active `TenantMembership`).

`POST /setup/users` body (додатково):

```json
{
  "users": [{ "email": "...", "password": "...", "firstName": "...", "lastName": "...", "role": "chairman" }],
  "deferRoles": ["accountant", "auditor"]
}
```

- **Голова правління** — обов'язкова для завершення майстра
- **Бухгалтер / ревізія** — можна відкласти (`deferRoles`); зберігається в `Building.settings.deferredSetupRoles`
- Після `POST /users` з роллю `accountant` або `auditor` відкладена роль знімається з `deferredSetupRoles`
- UI «Організація» показує банер `pendingDeferredRoles` з кнопкою швидкого створення

Ідемпотентність:

- `POST /setup/bank` — якщо фонди вже є → `200`, `{ skipped: true, bankAccount, funds }`
- `POST /setup/users` — якщо всі потрібні ролі активні або відкладені → `200`, `{ skipped: true, users }`; інакше створює лише відсутні ролі (існуючі пропускаються)
- `POST /setup/apartments` — якщо квартири вже є → `400` «Квартири вже додано» (UI пропускає крок)

### Web UX (майстер)

- Якщо status `isInitialized: true` — клієнт **не** робить hard reload (`window.location`); лише `router.replace('/admin/organization')`, щоб не миготів AppShell.
- Пункт drawer «Майстер налаштування» ховається, коли для вибраного tenant setup уже complete (див. SPEC/03).

---

## Health

| Method | Path | Auth | Опис |
|--------|------|------|------|
| GET | `/health` | — | `{ status: "ok" }` (+ db/redis/storage/backup markers) |

### Backups (копії даних)

| Method | Path | Auth | Опис |
|--------|------|------|------|
| GET | `/backups/status` | admin* | Поточний ISO-тиждень, `weeklyExists`, `lastBackupAt`, `backupDir` |
| GET | `/backups` | admin* | Список weekly/manual копій (з `source`) |
| POST | `/backups` | write** | Ручна копія PostgreSQL (`manual/{stamp}`, `source: api`) |
| POST | `/backups/weekly` | write** | Ensure тижнева; **skip** якщо вже є (`source: api` \| schedule у worker) |
| GET | `/backups/:kind/:id/download` | admin* | Stream `database.sql.gz` на ПК |
| POST | `/backups/upload` | write** | multipart `file` (.sql.gz) → `manual/…`, `source: upload` (**без** restore БД) |

\* `super_admin`, `chairman`, `board`, `accountant`, `auditor`  
\*\* без `auditor` і без `resident`

#### Каталог і файли

- Корінь: `BACKUP_DIR` (default monorepo `./backups`, Docker `/backups`)
- `weekly/{YYYY-Www}/database.sql.gz` + `manifest.json`
- `manual/{stamp}/database.sql.gz` + `manifest.json`
- Marker здоровʼя: `BACKUP_STATUS_PATH` / `last-backup.json` — оновлюється лише після **успішного live dump** (weekly/manual create), **не** після upload

#### `GET /backups` — елемент списку

```ts
{
  kind: 'weekly' | 'manual';
  id: string;              // folder name
  weekKey?: string;
  finishedAt: string | null;
  sizeBytes: number | null;
  status: string;          // ok | failed | unknown | corrupt
  relativePath: string;    // e.g. manual/20260802_083334
  source: string | null;   // schedule | api | manual | upload | …
}
```

| `source` | Значення |
|----------|----------|
| `schedule` | Worker / auto weekly |
| `api` | POST `/backups` або POST `/backups/weekly` з UI/API |
| `upload` | POST `/backups/upload` — файл з ПК у каталог |
| `null` | Старий/пошкоджений manifest без поля |

#### Download

- `kind`: `weekly` \| `manual`; `id` — лише `[A-Za-z0-9][A-Za-z0-9._-]*` (без path traversal)
- Відповідь: `Content-Type: application/gzip`,  
  `Content-Disposition: attachment; filename="dah-backup-{kind}-{id}.sql.gz"`
- 404 якщо dump відсутній

#### Upload

- `multipart/form-data`, поле `file`; розширення `.sql.gz` / `.gz`
- Перевірка gzip magic (`1f 8b`)
- Розмір: **без ліміту** за замовчуванням; опційно `BACKUP_UPLOAD_MAX_MB=<MB>` (позитивне число). `0` / порожнє / відсутнє = unlimited
- Створює нову теку `manual/{stamp}/`, audit action `backup.upload`
- **Не** викликає `psql` / restore і **не** оновлює health marker
- Відповідь: `{ relativePath, finishedAt, sizeBytes, id, kind: 'manual', status: 'ok' }`

## Auth

| Method | Path | Auth | Опис |
|--------|------|------|------|
| POST | `/auth/register` | — | Реєстрація мешканця |
| POST | `/auth/login` | — | Login → tokens + user |
| GET | `/auth/me` | JWT | Поточний користувач |
| GET | `/auth/pending` | chairman, board | Очікують підтвердження |
| PATCH | `/auth/approve/:id` | chairman, board | Активувати користувача |

## Users

| Method | Path | Auth | Опис |
|--------|------|------|------|
| GET | `/users` | super_admin, chairman | Список користувачів (пагінація) |
| POST | `/users` | super_admin | Створити admin-користувача |
| PATCH | `/users/:id` | super_admin | Оновити профіль, роль, статус, квартири |
| PATCH | `/users/:id/block` | super_admin, chairman | Заблокувати |
| POST | `/users/:id/apartments/:apartmentId` | super_admin | Прив'язати квартиру (many-to-many) |
| DELETE | `/users/:id/apartments/:apartmentId` | super_admin | Відв'язати квартиру |

Query для `GET /users`:  
`?search=&page=1&limit=20&role=&status=&sortBy=name|email|role|status|createdAt&sortDir=asc|desc`

**Scope:** список завжди в межах однієї організації (`tenantId` з JWT для chairman, або **обовʼязковий** `X-Tenant-Id` / `?tenantId=` для super_admin). Без tenant → `400` `{ code: "tenant_required" }`.  
Дані з `TenantMembership` (роль/статус **у цій** org); platform `super_admin` у список org не потрапляє.

Відповідь `GET /users`:
```json
{ "items": [...], "total": 42, "page": 1, "limit": 20, "sortBy": "name", "sortDir": "asc" }
```

Кожен item: `apartments[]` (квартири **цієї** org), `apartment` (основна), `tenant: { id, name, slug }`, `role`/`status` з membership.

`POST /users` (super_admin + `X-Tenant-Id`):  
- новий email → створює identity + membership (password обовʼязковий);  
- існуючий email → додає membership у поточну org (password опційний), якщо ще не член.

`PATCH /users/:id` body (усі поля опційні):  
`firstName`, `lastName`, `phone`, `email`, `password`, `role`, `status`, `apartmentIds[]`, `primaryApartmentId`  
— `role`/`status` оновлюють **membership** поточної org; профіль (імʼя, email, пароль) — identity.

Auth (multi-membership / dual persona):
| Method | Path | Опис |
|--------|------|------|
| POST | `/auth/login` | optional `tenantId`, `role`; відповідь містить `memberships[]` (кожна = org+role) |
| POST | `/auth/select-tenant` | JWT; body `{ tenantId, role? }` — активна org **і** роль (board↔resident); re-issue tokens |
| GET | `/auth/memberships` | JWT; список memberships (у т.ч. кілька ролей на один tenant) |

`TenantMembership` unique: `(userId, tenantId, role)`.  
Один email: напр. `board` + `resident` у тому ж ОСББ — два рядки membership, перемикач у login/header.

## Roles catalog (per tenant)

| Method | Path | Auth | Опис |
|--------|------|------|------|
| GET | `/roles` | super_admin, chairman | Каталог + `memberCount`; `?activeOnly=1` |
| POST | `/roles` | super_admin | Увімкнути / додати code у каталог |
| PATCH | `/roles/:code` | super_admin | `isActive`, `labelUk`, `labelRu`, `sortOrder` |
| DELETE | `/roles/:code` | super_admin | Лише якщо 0 members; protected: chairman, resident |

Tenant scope: `X-Tenant-Id` (super_admin) / JWT tenant.  
Призначення users: role має бути active у каталозі.

## Building

| Method | Path | Auth | Опис |
|--------|------|------|------|
| GET | `/building` | JWT | Дані будинку + фонди |
| GET | `/building/apartments` | JWT | Список квартир (+ `users` через зв'язки) |
| GET | `/building/apartments/:id` | JWT | Квартира з деталями |
| POST | `/building/apartments` | super_admin, chairman | Створити квартиру |
| PATCH | `/building/apartments/:id` | super_admin, chairman | Оновити |
| DELETE | `/building/apartments/:id` | super_admin, chairman | Видалити (без пов'язаних даних) |
| GET | `/building/settings` | JWT | Налаштування |
| PATCH | `/building/settings` | chairman, board | `showDebtorsToResidents` |
| GET | `/building/document-templates` | JWT | Конструктор: PDF-шаблони + Excel-профілі |
| PATCH | `/building/document-templates` | chairman, board, accountant | Зберегти `{ forms, exports }` у `Building.settings.documentTemplates` |

## Finance

| Method | Path | Auth | Опис |
|--------|------|------|------|
| GET | `/finance/funds` | JWT | Фонди |
| GET | `/finance/categories` | JWT | Категорії витрат |
| GET | `/finance/suppliers` | JWT | Постачальники |
| POST | `/finance/suppliers` | write | Створити постачальника |
| PATCH | `/finance/suppliers/:id` | write | Оновити |
| GET | `/finance/expenses` | JWT | Список витрат |
| GET | `/finance/expenses/:id` | JWT | Деталі витрати |
| POST | `/finance/expenses` | write | Нова витрата |
| PATCH | `/finance/expenses/:id/void` | chairman, accountant | Анулювати |
| GET | `/finance/reports/cash-flow` | JWT | Рух коштів |
| GET | `/finance/reports/expenses-summary` | JWT | Витрати по категоріях |
| GET | `/finance/reports/board.pdf` | JWT | PDF для зборів |
| GET | `/finance/reports/export-pack.zip` | JWT | ZIP з Excel (`.xlsx`) звітами |

`write` = chairman, accountant, board

## Accruals

| Method | Path | Auth | Опис |
|--------|------|------|------|
| GET | `/accruals/templates` | JWT | Шаблони |
| POST | `/accruals/templates` | write | Новий шаблон |
| GET | `/accruals` | JWT | Список нарахувань |
| GET | `/accruals/:id` | JWT | Деталі |
| GET | `/accruals/my-account` | JWT | Особовий рахунок (resident) |

### Accounting (глибока бухгалтерія)

| Method | Path | Auth | Опис |
|--------|------|------|------|
| GET | `/journal` | finance read | Список проводок |
| GET | `/journal/reconcile` | finance read | Dual-run + TB reconcile |
| GET | `/journal/trial-balance` | finance read | ОСВ / trial balance |
| GET | `/journal/account-card` | finance read | Картка рахунку |
| GET | `/journal/coa` | finance read | План рахунків |
| GET | `/accounting/ar-aging` | finance read | AR aging |
| GET | `/accounting/ap-aging` | finance read | AP aging |
| GET | `/accounting/apartments/:id/statement` | finance read | Виписка квартири |
| POST | `/accounting/write-offs` | manage finance | Списання боргу (pending) |
| POST | `/accounting/write-offs/:id/approve` | manage finance | Approve write-off |
| GET/POST | `/accounting/tariffs` | finance | Service tariffs |
| GET/POST | `/accounting/supplier-invoices` | finance | Рахунки постачальників |
| POST | `/accounting/supplier-invoices/:id/approve` | manage finance | Approve invoice |
| POST | `/accounting/supplier-invoices/pay` | manage finance | Оплата рахунку |
| GET/POST | `/accounting/bank-reconciliations` | finance | Звірка банку |
| POST | `/accounting/bank-reconciliations/:id/close` | manage finance | Закрити звірку |
| GET | `/accounting/cash-book` | finance read | Касова книга |
| POST | `/accounting/periods/close-snapshot` | manage finance | Close pack JSON |
| GET | `/accounting/budget/plan-fact-encumbrance` | finance read | Бюджет + AP commitments |
| GET | `/accounting/coa-export-map` | finance read | CoA → external/1C codes |
| GET | `/accruals/apartments/:id/account` | admin | Рахунок квартири |
| GET | `/accruals/apartments/:id/statement.xlsx` | admin / own resident | Excel-виписка |
| POST | `/accruals/preview` | write | Попередній розрахунок сум |
| POST | `/accruals` | write | Створити нарахування |
| GET | `/accruals/lines/:lineId/receipt` | JWT | PDF-квитанція |

`admin` = chairman, accountant, board, auditor

## Payments

| Method | Path | Auth | Опис |
|--------|------|------|------|
| GET | `/payments` | JWT | Список платежів |
| GET | `/payments/:id` | JWT | Деталі |
| GET | `/payments/preview/allocation` | write | FIFO preview |
| GET | `/payments/reports/debtors` | report | Звіт боржників |
| POST | `/payments` | write | Новий платіж |
| POST | `/payments/import/preview` | write | Парсинг виписки (`csv`, `format?`, `buildingId?`) → rows + summary + detectedFormat |
| POST | `/payments/import` | write | Зафіксувати matched rows як платежі |
| PATCH | `/payments/:id/void` | chairman, accountant | Анулювати |

Query для preview: `?apartmentId=&amount=`

`report` = write + auditor

## Documents

| Method | Path | Auth | Опис |
|--------|------|------|------|
| GET | `/documents/public` | — | Публічні документи |
| GET | `/documents` | write | Усі документи |
| POST | `/documents` | write | Додати документ |
| DELETE | `/documents/:id` | chairman, accountant | Видалити |

## Transparency

| Method | Path | Auth | Опис |
|--------|------|------|------|
| GET | `/transparency/dashboard` | JWT | Дашборд прозорості |
| GET | `/transparency/debtors` | JWT | Боржники (з урахуванням ролі) |

## Communications

| Method | Path | Auth | Опис |
|--------|------|------|------|
| GET | `/communications/announcements` | JWT | Оголошення |
| POST | `/communications/announcements` | write | Створити (+ push) |
| DELETE | `/communications/announcements/:id` | chairman, board | Видалити |
| GET | `/kep/status` | public | Статус КЕП / Diia (provider, productionReady) |
| POST | `/kep/meetings/:meetingId/sign` | JWT | Старт SignSession для протоколу зборів |
| GET | `/kep/sessions/:id` | JWT | Статус сесії підпису |
| POST | `/kep/sessions/:id/complete` | public (mock) | Завершення mock IdP |
| POST | `/kep/sessions/:id/complete-auth` | JWT | CAdES / code complete |
| POST | `/kep/webhook` | secret | Webhook Diia / cloud KEP |
| POST | `/meetings/:id/sign` | JWT | Те саме через meetings (session + authorizeUrl) |

| GET | `/communications/requests` | JWT | Заявки (+ `slaStatus`, `isOverdue`) |
| GET | `/communications/requests/queue` | chairman/board/dispatcher/accountant | SLA-черга (фільтри: status, overdueOnly, unassignedOnly, mineOnly, priority) |
| POST | `/communications/requests` | JWT | Нова заявка (`priority`, auto-`dueAt` з SLA) |
| PATCH | `/communications/requests/:id` | request-manage | Статус / priority / assignee / dueAt |
| GET | `/communications/polls` | JWT | Опитування |
| GET | `/communications/polls/:id` | JWT | Деталі + userVote |
| POST | `/communications/polls` | chairman, board | Створити |
| POST | `/communications/polls/:id/vote` | JWT | Проголосувати |
| PATCH | `/communications/polls/:id/close` | chairman, board | Закрити |

## Notifications

| Method | Path | Auth | Опис |
|--------|------|------|------|
| GET | `/notifications/vapid-public-key` | — | Публічний VAPID key |
| POST | `/notifications/subscribe` | JWT | Підписка на push |
| DELETE | `/notifications/subscribe` | JWT | Відписка |

## Files

| Method | Path | Auth | Опис |
|--------|------|------|------|
| POST | `/files/upload` | JWT | Завантажити файл (multipart); відповідь `url` = same-origin download |
| GET | `/files/download` | HMAC query | Stream з MinIO (`key`, `exp`, `sig`) — для `<img>` без Bearer |

Upload query: `?folder=expenses|documents|requests`  
Download: short-lived HMAC (`FILE_DOWNLOAD_SECRET` або `JWT_SECRET`); браузер **не** ходить на MinIO `:9000`.

## Audit

| Method | Path | Auth | Опис |
|--------|------|------|------|
| GET | `/audit/logs` | chairman, auditor | Журнал (пагінація cursor) |

Query: `?limit=&cursor=&entityType=&action=`