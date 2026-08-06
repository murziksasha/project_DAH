# 08. Кабінет мешканця та PWA

Продукт: **«Мій дім»**. Мешканець бачить той самий кабінет для будинку під **ОСББ** або **УК** (різниця лише в назві організації на екрані).

## Маршрути Web

| URL | Опис |
|-----|------|
| `/` | Головна (логін / реєстрація) |
| `/login` | Форма входу |
| `/resident` | Кабінет мешканця |
| `/admin` | Дашборд правління |
| `/admin/*` | Адмін-розділи |

## Глобальна навігація

Усі сторінки `/resident` та `/admin/*` використовують **AppShell** (mobile-first):

- Sticky header з кнопкою меню та **Вихід**
- Drawer-навігація за роллю (див. `SPEC/03-roles-and-access.md`)
- Контент: `max-width: 960px`, safe-area insets для iPhone
- Вкладки кабінету мешканця — горизонтальний scroll (`.nav-scroll`) на вузьких екранах
- Touch targets ≥ 44px; `font-size: 16px` на input (без zoom на iOS)

## Домівка та навігація мешканця (`/resident`)

### Action Home (за замовчуванням)

`/resident` (без `tab` або `?tab=home`) — **«що зробити зараз»**:

- Hero: борг / переплата / «борг відсутній» + бейдж квартири
- Картки дій (signals): сплатити, передати покази, проголосувати, статус заявки, pinned-оголошення
- Shortcuts: рахунок, новини, заявки, лічильники, прозорість, документи, збори, месенджер

### Bottom nav (mobile, `< 1024px`)

| Tab | URL |
|-----|-----|
| Домівка | `/resident` |
| Рахунок | `/resident?tab=account` |
| Заявки | `/resident?tab=requests` |
| Лічильники | `/resident/meters` |
| Ще | `/resident?tab=more` (+ secondary routes) |

На desktop — drawer + horizontal tabs при відкритому розділі.

### Вкладки / розділи

| tab | Дані |
|-----|------|
| **account** | `GET /accruals/my-account` — борг, нарахування, платежі, PDF, Excel; CTA **Pay sheet** |
| **news** | Оголошення + опитування (+ пошук) |
| **requests** | Форма нової заявки (зверху) + список зі статус-бейджами та mini-timeline |
| **building** | `GET /transparency/dashboard` — expenseSummary, fundBalances (+ пошук) |
| **documents** | Публічні документи з fileUrl (+ пошук) |
| **debtors** | Якщо `showDebtorsToResidents = true` (+ пошук кв.) |
| **more** | Shortcuts на secondary |

Deep links:

- `/resident?tab=requests&new=1` — форма заявки + focus
- `/resident?tab=communications` — legacy → **requests**
- фільтри рахунку: `?tab=account&year=2026&month=03`

### Pay sheet

Модалка «Сплата внесків»: сума (борг або своя), онлайн-оплата (якщо enabled), IBAN + «Скопіювати все», PDF-квитанція.

### Вкладка «Рахунок» (UX)

**Спрощений режим (за замовчуванням):**

- 2 KPI: борг + аванс/сплачено; CTA «Сплатити» → Pay sheet
- Останні 5 операцій
- Відкриті нарахування (до 3) з PDF
- Компактні банківські реквізити (IBAN copy)

**Повна історія** (кнопка «Повна історія та фільтри»):

- Підсумок по фільтру, AccrualFilters, історія periods/feed, Excel-виписка, усі нарахування
- `?year=&month=` відкриває повний режим автоматично
- Стан expand + фільтрів у `sessionStorage`

### Сповіщення (deep links)

| kind / подія | URL |
|--------------|-----|
| `announcement` | `/resident?tab=news` |
| `request_status` | `/resident?tab=requests&requestId={id}` |
| legacy `tab=communications` | міграція → news або requests |
| без url | resolve з `kind` (`notification-links.ts`) |

Клік у дзвіночку: mark-one-read + навігація. Highlight заявки 4 с.

### Pending-реєстрація

- Після `/register` — `PendingApprovalCard` (кроки 1–3)
- Login з `status=pending` → той самий спокійний екран (не «Невірний email»)
- Query: `/login?pending=1&email=`

### Read-state оголошень (A)

- Модель `AnnouncementRead` (userId + announcementId)
- `GET /communications/announcements` → `isRead`
- `PATCH /communications/announcements/:id/read` · `PATCH .../read-all` · `GET .../unread-count`
- UI: badge на shortcuts/tabs, unread highlight; відкриття вкладки «Новини» → mark-all-read

### Трекінг заявок (B)

- Список: `dueAt`, `updatedAt`, `slaStatus`/`isOverdue`, `assignee`, `photoUrls` (signed)
- Створення: `photoKeys` + upload `POST /files/upload?folder=requests` (**resident** allowed)
- UI: mini-timeline + SLA copy + thumbnails

### Лічильники batch + дедлайн (C)

- `Building.settings.metersReadingDeadlineDay` (1–28, default 5) — admin settings
- Home banner + `/resident/meters` batch form (усі лічильники, одна відправка)
- Валідація «≥ попередній показ» по кожному

### First-run tour + empty apartment (D)

- `ResidentTour` (3 кроки) для `role=resident` якщо `!onboardingDone`
- `OnboardingBanner` staff-only (крім 2FA warning)
- Empty state без `apartmentId` / «Квартиру не привʼязано»

### Lazy-load (E)

1. Phase 1: account + pay status + meters + settings (first paint)
2. Phase 2: announcements, requests, polls (signals)
3. Phase 3: transparency on demand (building/docs/debtors/account/pay sheet)

### Multi-apartment (1.13.1)

- `GET /auth/profile` → `apartments[]` (id, number, buildingName, isPrimary)
- `GET /accruals/my-account?apartmentId=` — лише linked apartments
- Header switcher → `localStorage dah_apartment_id` + `dah_user.apartmentId` + reload

### Comfort mode

- `data-comfort="large"` на `<html>`, toggle A⁺ у header (resident only)

### Messenger / meetings

- Resident UI: EmptyState, skeletons, i18n, last-message preview, status badges

### Offline meter queue (1.13.2)

- `localStorage` key `dah_meter_offline_queue`
- Enqueue when `navigator.onLine === false` or network error mid-batch
- Auto-flush on `window.online`; manual flush on meters page
- Event `dah-meter-queue-change`

### Soft apartment switch (1.13.2)

- Event `dah-apartment-change` (no `location.reload`)
- Listeners: `/resident` (account+meters signals), `/resident/meters`

### Email deep-links (1.13.2)

- Template context: `actionPath` | `actionUrl` | `actionLabel`
- `MailService.sendTemplate` builds absolute CTA URL from `APP_URL`
- HTML button + plain-text link for: accrual, payment, announcement, request status, debt, register, SLA

### Nav badges + global flush (1.13.3)

- Bottom nav: news unread → «Ще»; open requests; offline queue → «Лічильники»; aggregate on «Домівка»
- Home action card for offline queue
- `MeterQueueFlusher` in AppShell (resident): online + delayed mount flush
- Network banner: `networkOfflineResident` copy

### Comfort in drawer (1.13.4)

- Resident drawer footer: toggle `data-comfort` (A⁺ / A) for desktop expanded nav
- Header A⁺ remains for mobile header actions

### E2E / unit (1.13.4–1.13.5)

- `e2e/helpers.ts` — shared resident login/tour dismiss
- `e2e/resident-offline-apt.spec.ts` — offline queue + apt switch (seed + mock)
- `e2e/resident.spec.ts` — home/account/requests/news/meters/security/comfort
- `mail.templates.spec.ts` — CTA `actionPath` / `actionUrl` in HTML + text

### Demo seed (1.13.5)

- Meters on primary resident apartment + prior-period readings
- Second `apartmentLinks` row for multi-apt switcher

### Лічильники (`/resident/meters`)

- Період **авто** (поточний `YYYY-MM`); інший період — у `<details>`
- Попередній показ + валідація «не менше попереднього»
- Картки: needs-reading / already sent за поточний період

## PWA

### manifest.json
- `display: standalone`
- Icons: 192×192, 512×512
- `theme_color: #2563eb`

### Service Worker (`/sw.js`)
- Обробка `push` → системне сповіщення
- `notificationclick` → відкриття URL з payload

### Встановлення
- Браузерний `beforeinstallprompt` → компонент `PwaPrompt`
- Apple: `apple-touch-icon`, `appleWebApp` meta

## Прозорість

`GET /transparency/dashboard` повертає:

```json
{
  "building": { "name", "showDebtorsToResidents" },
  "expenseSummary": { "total", "byCategory", "byFund" },
  "cashFlow": { "totalIncome", "totalExpenses", "netFlow", "fundBalances" },
  "documents": [{ "id", "title", "fileUrl" }],
  "debtors": [{ "number", "debt", "isOverdue" }] | null
}
```

`debtors` = `null` для мешканця, якщо налаштування вимкнено.

## Реєстрація мешканця

1. POST `/auth/register` — email, пароль, `apartmentId`
2. Статус `pending`
3. Chairman/board: `PATCH /auth/approve/:id` → `active`

> UI `/register` згадується на головній; сторінка може бути додана окремо.