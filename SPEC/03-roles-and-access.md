# 03. Ролі та доступ (RBAC)

## Ролі

| Роль | Код | Опис |
|------|-----|------|
| Системний адміністратор | `super_admin` | Bootstrap, користувачі, квартири, налаштування (без фінансових операцій) |
| Голова правління | `chairman` | Повний адмін-доступ |
| Бухгалтер | `accountant` | Фінанси, без видалення оголошень |
| Член правління | `board` | Фінанси + комунікації |
| Мешканець | `resident` | Особовий рахунок, прозорість, заявки |
| Ревізійна комісія | `auditor` | Читання звітів + аудит |

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

### Users & Organization

| Ендпоінт | super_admin | chairman | інші |
|----------|-------------|----------|------|
| GET /users | ✅ | ✅ | ❌ |
| POST /users | ✅ | ❌ | ❌ |
| PATCH /users/:id | ✅ | ❌ | ❌ |
| PATCH /users/:id/block | ✅ | ✅ | ❌ |
| POST/DELETE /users/:id/apartments/:apartmentId | ✅ | ❌ | ❌ |
| POST/PATCH/DELETE /building/apartments | ✅ | ✅ | ❌ |

Web UI `/admin/organization` — лише `super_admin`.

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
| `/admin/setup` | `super_admin` (поки `isInitialized = false`) |
| `/admin/organization` | `super_admin` |
| `/admin/*` (фінанси) | `chairman`, `accountant`, `board`, `auditor` |

Після login admin-ролі перенаправляються на `/admin`, мешканець — на `/resident`, `super_admin` — на `/admin/setup` або `/admin/organization` (якщо `isInitialized`).

### Глобальна навігація (AppShell)

Усі авторизовані сторінки `/admin/*` та `/resident` обгорнуті в `AppShell`:

- Sticky header: меню (☰), назва кабінету, кнопка **Вихід**
- Drawer-меню з пунктами за роллю + **Домівка** (role home, не публічний `/`)
- **Вихід:** `POST /auth/logout` (best-effort) → очистка `localStorage` + cookie → `/login`

| Роль | Домівка | Пункти drawer |
|------|---------|---------------|
| `super_admin` | `/admin/setup` або `/admin/organization` | Майстер, Організація |
| `chairman`, `accountant`, `board`, `auditor` | `/admin` | Дашборд, фінанси, комунікації, налаштування, аудит |
| `resident` | `/resident` | Кабінет мешканця |

### Майстер налаштування (`/admin/setup`)

- Resume: `GET /setup/status` повертає `nextStep`, `stepDone`, prefill для building/bank
- Завершені кроки пропускають POST — кнопка **Продовжити**
- Повторний `POST /setup/bank` при наявних фондах — `200` з `{ skipped: true }` (не помилка)
- Крок **Користувачі**: голова правління обов'язкова; для бухгалтера та ревізії — чекбокс **Створити пізніше**
- Відкладені ролі (`deferredSetupRoles`) створюються в `/admin/organization` (банер + форма `POST /users`)

## Реалізація

- `@UseGuards(AuthGuard('jwt'))` — автентифікація
- `@Roles(...)` + `RolesGuard` — авторизація за роллю
- Декоратор `@CurrentUser()` — поточний користувач з JWT