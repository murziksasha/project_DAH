# 08. Кабінет мешканця та PWA

## Маршрути Web

| URL | Опис |
|-----|------|
| `/` | Головна (логін / реєстрація) |
| `/login` | Форма входу |
| `/resident` | Кабінет мешканця |
| `/admin` | Дашборд правління |
| `/admin/*` | Адмін-розділи |

## Вкладки кабінету мешканця (`/resident`)

| Вкладка | Дані |
|---------|------|
| **Рахунок** | `GET /accruals/my-account` — борг, нарахування, платежі, PDF |
| **Новини** | Оголошення, опитування, форма заявки |
| **Витрати дому** | `GET /transparency/dashboard` — expenseSummary, fundBalances |
| **Документи** | Публічні документи з fileUrl |
| **Боржники** | Якщо `showDebtorsToResidents = true` |

Deep link з push: `/resident?tab=communications`

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