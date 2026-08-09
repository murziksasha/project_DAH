# 03. Ролі та доступ (RBAC)

## Ролі

Коди RBAC **спільні** для ОСББ і УК. Відрізняються лише **відображувані назви** (див. [12-organization-types.md](./12-organization-types.md)).

| Код | ОСББ (label) | УК (label) | Опис доступу |
|-----|--------------|------------|--------------|
| `super_admin` | Системний адміністратор | те саме | Bootstrap, tenants, користувачі, квартири (без фін. операцій) |
| `chairman` | Голова правління | Керівник | Повний адмін-доступ у межах tenant |
| `accountant` | Бухгалтер | Бухгалтер | Фінанси, без видалення оголошень |
| `board` | Член правління | Працівник УК | Фінанси + комунікації + заявки |
| `dispatcher` | Диспетчер | Диспетчер | Черга заявок / SLA (`MANAGE_REQUESTS`), **без фінансів** |
| `resident` | Мешканець | Мешканець | Особовий рахунок, прозорість, заявки |
| `auditor` | Ревізійна комісія | Контроль | Читання звітів + аудит |

## Статуси користувача

| Статус | Опис |
|--------|------|
| `pending` | Зареєстрований, очікує підтвердження |
| `active` | Може входити в систему |
| `blocked` | Доступ заборонено |

## Матриця доступу API

Легенда: ✅ дозволено · 🔒 обмежено · ❌ заборонено

### Auth

| Ендпоінт | resident | board | accountant | chairman | auditor |
|----------|----------|-------|------------|----------|---------|
| POST /auth/register | ✅ | — | — | — | — |
| POST /auth/login | ✅* | ✅ | ✅ | ✅ | ✅ |
| GET /auth/me | ✅ | ✅ | ✅ | ✅ | ✅ |
| GET /auth/pending | ❌ | ✅ | ❌ | ✅ | ❌ |
| PATCH /auth/approve/:id | ❌ | ✅ | ❌ | ✅ | ❌ |

\* `pending` / `blocked` — login відхиляється  
\* Користувачі з `tenantId`, де `Tenant.isActive = false` — **login / 2FA complete / SMS / refresh / JWT** відхиляються (`401`, повідомлення про деактивацію). Super-admin не прив’язаний до tenant і лишається з доступом; він головніший за голову ОСББ/керівника УК.

### Users & Organization

| Ендпоінт | super_admin | chairman | інші |
|----------|-------------|----------|------|
| GET /users | ✅* | ✅† | ❌ |
| POST /users | ✅* | ❌ | ❌ |
| PATCH /users/:id | ✅* | ❌ | ❌ |
| PATCH /users/:id/block | ✅* | ✅† | ❌ |
| POST/DELETE /users/:id/apartments/:apartmentId | ✅ | ❌ | ❌ |
| POST/PATCH/DELETE /building/apartments | ✅ | ✅ | ❌ |

\* Super-admin: обовʼязковий `X-Tenant-Id` (контекст org); інакше `400 tenant_required`.  
† Chairman: лише свій `JWT.tenantId`.  
Список/роль/статус — з `TenantMembership` у межах org.  
Один identity може мати **кілька memberships**: різні tenants і/або **кілька roles в одному tenant** (типово `board`/`chairman` + `resident`). JWT завжди з **однією** активною role; перемикач persona у web.

Web UI `/admin/organization` — `super_admin` (з вибором org) / chairman у своєму tenant.  
Додати другу роль: `POST /users` з існуючим email і іншою `role` (напр. `resident` + квартири).

## Кілька ролей однієї особи

| Сценарій | Як |
|----------|-----|
| Різні ОСББ/УК | Окремі `TenantMembership` на різні `tenantId` |
| Правління + мешканець **в одному** ОСББ | Два рядки: `(user, tenant, board)` + `(user, tenant, resident)` |
| Login / шапка | Список memberships `org · role`; `POST /auth/select-tenant` `{ tenantId, role }` |
| Список users | Flatten: один рядок на membership (одна людина може 2+ рази) |
| Голоси / poll | 1 `userId` = 1 голос (не 2 при dual role) |

## Каталог ролей організації (`TenantRole`)

Системні коди RBAC не змінюються (permissions у `@dah/shared`).  
Per-tenant каталог керує **чи можна призначати** роль новим memberships і **як вона називається** в UI.

| Дія | Хто | Правило |
|-----|-----|---------|
| GET `/roles` | super_admin, chairman | tenant scope; `?activeOnly=1` для dropdown |
| POST / PATCH / DELETE `/roles` | **лише super_admin** | |
| Додати / увімкнути | POST `{ code }` | upsert + `isActive=true` |
| Редагувати | PATCH labels, sortOrder | |
| Деактивувати | PATCH `isActive=false` | існуючі users зберігають role; dropdown нових — без цієї ролі |
| Видалити | DELETE | лише `memberCount=0`; `chairman`/`resident` — protected (не DELETE) |

`POST/PATCH /users` з inactive role → `400`.  
Фільтр users може показувати всі коди з каталогу (включно з inactive).

### Finance

| Операція | resident | board | accountant | chairman | auditor |
|----------|----------|-------|------------|----------|---------|
| Читання (funds, expenses, reports) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Створення витрат / постачальників | ❌ | ✅ | ✅ | ✅ | ❌ |
| Анулювання витрат | ❌ | ❌ | ✅ | ✅ | ❌ |

### Accruals & Payments

| Операція | resident | board | accountant | chairman | auditor |
|----------|----------|-------|------------|----------|---------|
| GET /accruals/my-account | ✅† | ❌ | ❌ | ❌ | ❌ |
| Створення нарахувань | ❌ | ✅ | ✅ | ✅ | ❌ |
| Рахунок будь-якої квартири | ❌ | ✅ | ✅ | ✅ | ✅ |
| Створення платежів | ❌ | ✅ | ✅ | ✅ | ❌ |
| Анулювання платежів | ❌ | ❌ | ✅ | ✅ | ❌ |
| Звіт боржників | ❌ | ✅ | ✅ | ✅ | ✅ |

† Потрібен `apartmentId` у профілі

### Backups (копії даних)

| Операція | resident | board | accountant | chairman | auditor | super_admin |
|----------|----------|-------|------------|----------|---------|-------------|
| GET /backups, /backups/status | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| GET /backups/:kind/:id/download (на ПК) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| POST /backups (manual dump) | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| POST /backups/weekly | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| POST /backups/upload (з ПК у каталог) | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| UI `/admin/ops` (секція копій) | ❌ | ✅ | ✅ | ✅ | ❌† | ✅ |

† Auditor: list + download через API; пункт меню ops — переважно правління/бухгалтер (auditor не upload / не create).  
Upload **не** = restore live БД.  
UI: бейдж «З компʼютера» для `source=upload`; кнопка «На компʼютер» (export) vs «З компʼютера…» (import у каталог).

Worker (без UI): щоденна перевірка тижневої копії; повторно за той самий ISO-тиждень не створює.

### Communications

| Операція | resident | board | accountant | chairman | auditor |
|----------|----------|-------|------------|----------|---------|
| Читання оголошень / опитувань | ✅ | ✅ | ✅ | ✅ | ✅ |
| Створення оголошень | ❌ | ✅ | ✅ | ✅ | ❌ |
| Видалення оголошень | ❌ | ✅ | ❌ | ✅ | ❌ |
| Створення заявки | ✅ | ✅ | ✅ | ✅ | ❌ |
| Оновлення статусу заявки | ❌ | ✅ | ✅ | ✅ | ❌ |
| Створення / закриття опитувань | ❌ | ✅ | ❌ | ✅ | ❌ |
| Голосування | ✅ | ✅ | ✅ | ✅ | ❌ |

### Transparency & Audit

| Операція | resident | board | accountant | chairman | auditor |
|----------|----------|-------|------------|----------|---------|
| GET /transparency/dashboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| Список боржників (resident) | 🔒‡ | ✅ | ✅ | ✅ | ✅ |
| GET /audit/logs | ❌ | ❌ | ❌ | ✅ | ✅ |

‡ Залежить від `Building.showDebtorsToResidents`

## Web UI (маршрути)

| Маршрут | Доступ |
|---------|--------|
| `/login` | Публічний |
| `/resident` | `resident` (та admin roles для перегляду) |
| `/admin/setup` | `super_admin` (майстер; див. нижче) |
| `/admin/tenants` | `super_admin` |
| `/admin/organization` | `super_admin` (потрібен контекст org) |
| `/admin/*` (фінанси) | `chairman`, `accountant`, `board`, `auditor` |

Після login admin-ролі перенаправляються на `/admin`, мешканець — на `/resident`, `super_admin` — на `/admin/setup` або `/admin/organization` залежно від `Building.isInitialized` **у вибраному tenant** (`X-Tenant-Id` / `dah_tenant_id`).

### Глобальна навігація (AppShell)

Усі авторизовані сторінки `/admin/*` та `/resident` обгорнуті в `AppShell`:

- Sticky header: меню (☰), назва кабінету, кнопка **Вихід**
- Drawer-меню з пунктами за роллю + **Домівка** (role home, не публічний `/`)
- **Вихід:** `POST /auth/logout` (best-effort) → очистка `localStorage` + cookie → `/login`

| Роль | Домівка | Пункти drawer |
|------|---------|---------------|
| `super_admin` | `/admin/setup` (якщо org ще не ініціалізована) або `/admin/organization` | **Майстер** (лише якщо `!isInitialized` для **вибраного** tenant), Організації, Організація, Інструкція |
| `chairman`, `accountant`, `board`, `auditor` | `/admin` | Дашборд, фінанси, комунікації, налаштування, аудит |
| `resident` | `/resident` | Кабінет мешканця |

**Видимість «Майстер налаштування» (super_admin):**

1. Статус береться з `GET /setup/status` **у контексті** `X-Tenant-Id` (localStorage `dah_tenant_id`).
2. Якщо tenant **не вибрано**, але вже є записи в `GET /tenants` — пункт **ховається** (спочатку «Обрати» org на `/admin/tenants`).
3. Якщо tenant вибрано і `isInitialized = true` — пункт **ховається**.
4. Якщо tenant вибрано і `isInitialized = false` (нова org з `/admin/tenants` створює building з `isInitialized: false`) — пункт **показується**.
5. Greenfield (немає tenants) — майстер доступний без попереднього вибору org.
6. Після SPA-навігації / зміни tenant AppShell перечитує status (без full reload).

### Майстер налаштування (`/admin/setup`)

- **Tenant scope:** усі `/setup/*` операції привʼязані до `X-Tenant-Id` (див. SPEC/05). Без header — legacy «перший» building (bootstrap / e2e).
- Resume: `GET /setup/status` → `nextStep`, `stepDone`, prefill building/bank, `isInitialized`.
- Якщо `isInitialized = true` — UI робить **soft** `router.replace('/admin/organization')` (не `window.location`, щоб не миготів увесь shell).
- Після `POST /setup/complete` — теж soft redirect на `/admin/organization`.
- Завершені кроки пропускають POST — кнопка **Продовжити**.
- Повторний `POST /setup/bank` при наявних фондах — `200` з `{ skipped: true }` (не помилка).
- Крок **Користувачі**: голова правління обов'язкова; для бухгалтера та ревізії — чекбокс **Створити пізніше**.
- Відкладені ролі (`deferredSetupRoles`) створюються в `/admin/organization` (банер + форма `POST /users`).

**Типовий multi-tenant сценарій**

1. Seed / перша org: майстер → `isInitialized = true` → пункт зникає.
2. `POST /tenants` (нова ОСББ/УК) → building з `isInitialized: false`.
3. На `/admin/tenants` → **Обрати** нову org → у drawer зʼявляється **Майстер** → пройти кроки → complete.
4. Інша org, уже ініціалізована → **Обрати** її → майстер знову сховано.

## Реалізація

- `@UseGuards(AuthGuard('jwt'))` — автентифікація
- `@Roles(...)` + `RolesGuard` — авторизація за роллю
- Декоратор `@CurrentUser()` — поточний користувач з JWT