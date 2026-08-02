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

---

## Setup (super_admin)

| Method | Path | Auth | Опис |
|--------|------|------|------|
| GET | `/setup/status` | super_admin | Стан майстра + resume |
| POST | `/setup/building` | super_admin | Створити/оновити будинок організації (upsert) |
| POST | `/setup/bank` | super_admin | Банк + фонди (ідемпотентно) |
| POST | `/setup/apartments` | super_admin | Масове додавання квартир |
| POST | `/setup/users` | super_admin | Ключові ролі (ідемпотентно) |
| POST | `/setup/complete` | super_admin | `isInitialized = true` |

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

---

## Health

| Method | Path | Auth | Опис |
|--------|------|------|------|
| GET | `/health` | — | `{ status: "ok" }` (+ db/redis/storage/backup markers) |

### Backups (копії даних)

| Method | Path | Auth | Опис |
|--------|------|------|------|
| GET | `/backups/status` | admin* | Поточний ISO-тиждень, `weeklyExists`, `lastBackupAt` |
| GET | `/backups` | admin* | Список weekly/manual копій |
| POST | `/backups` | write** | Ручна копія PostgreSQL (`manual/…`) |
| POST | `/backups/weekly` | write** | Ensure тижнева; **skip** якщо вже є |

\* `super_admin`, `chairman`, `board`, `accountant`, `auditor`  
\*\* без `auditor` і без `resident`  
Файли: `BACKUP_DIR` (`weekly/{YYYY-Www}`, `manual/{stamp}`).

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

Query для `GET /users`: `?search=&page=1&limit=20`

Відповідь `GET /users`:
```json
{ "items": [...], "total": 42, "page": 1, "limit": 20 }
```

Кожен item містить `apartments[]` (усі прив'язані квартири, `isPrimary`) та `apartment` (основна).

`PATCH /users/:id` body (усі поля опційні):
`firstName`, `lastName`, `phone`, `email`, `password`, `role`, `status`, `apartmentIds[]`, `primaryApartmentId`

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
| GET | `/communications/requests` | JWT | Заявки |
| POST | `/communications/requests` | JWT | Нова заявка |
| PATCH | `/communications/requests/:id` | write | Оновити статус |
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
| POST | `/files/upload` | JWT | Завантажити файл (multipart) |

Query: `?folder=expenses|documents`

## Audit

| Method | Path | Auth | Опис |
|--------|------|------|------|
| GET | `/audit/logs` | chairman, auditor | Журнал (пагінація cursor) |

Query: `?limit=&cursor=&entityType=&action=`