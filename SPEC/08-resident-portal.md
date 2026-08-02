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

## Вкладки кабінету мешканця (`/resident`)

| Вкладка | Дані |
|---------|------|
| **Рахунок** | `GET /accruals/my-account` — борг, нарахування, платежі, PDF, Excel-виписка |
| **Новини** | Оголошення, опитування, форма заявки (+ пошук) |
| **Витрати дому** / **Прозорість** | `GET /transparency/dashboard` — expenseSummary, fundBalances (+ пошук) |
| **Документи** | Публічні документи з fileUrl (+ пошук) |
| **Боржники** | Якщо `showDebtorsToResidents = true` (+ пошук кв.) |

Deep link: `/resident?tab=communications` · фільтри рахунку: `?year=2026&month=03`

### Вкладка «Рахунок» (UX)

- Підсумок: борг, аванс, нараховано, сплачено (+ підсумки **по фільтру**)
- Фільтри: **рік**, **місяць**, тип (нарахування/платіж), статус, текстовий пошук, вигляд
- **Історія за періодами** (рік → місяць, accordion) або **стрічка** з «Показати ще»
- Повний список нарахувань (без обрізання 30)
- **Excel: виписка** (клієнтський `.xlsx` з урахуванням фільтра)
- Стан фільтрів у `sessionStorage` + URL query
- Адаптив: sticky summary на mobile, grid фільтрів, touch ≥ 44px

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