# 05. API Reference

**Base URL:** `http://localhost:3001/api` (dev) або `https://<domain>/api` (prod)

**Auth:** `Authorization: Bearer <accessToken>`

**Swagger:** `/api/docs` (інтерактивна документація)

---

## Health

| Method | Path | Auth | Опис |
|--------|------|------|------|
| GET | `/health` | — | `{ status: "ok" }` |

## Auth

| Method | Path | Auth | Опис |
|--------|------|------|------|
| POST | `/auth/register` | — | Реєстрація мешканця |
| POST | `/auth/login` | — | Login → tokens + user |
| GET | `/auth/me` | JWT | Поточний користувач |
| GET | `/auth/pending` | chairman, board | Очікують підтвердження |
| PATCH | `/auth/approve/:id` | chairman, board | Активувати користувача |

## Building

| Method | Path | Auth | Опис |
|--------|------|------|------|
| GET | `/building` | JWT | Дані будинку + фонди |
| GET | `/building/apartments` | JWT | Список квартир |
| GET | `/building/apartments/:id` | JWT | Квартира з деталями |
| GET | `/building/settings` | JWT | Налаштування |
| PATCH | `/building/settings` | chairman, board | `showDebtorsToResidents` |

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