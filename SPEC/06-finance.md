# 06. Фінансовий модуль

## Фонди

Кожен фонд має `openingBalance` — початковий залишок. Баланс розраховується:

```
баланс = openingBalance + надходження (платежі) − витрати
```

Фонд може бути прив'язаний до банківського рахунку (`BankAccount`).

## Витрати

### Створення
1. Обрати фонд, категорію, постачальника (опційно)
2. Завантажити документ через `/files/upload` → `documentKey`
3. POST `/finance/expenses`

### Анулювання
Soft-delete: `isVoided = true`, причина в `voidReason`. Запис залишається в БД та аудиті.

## Нарахування

### Типи розподілу (`AccrualDistribution`)

| Тип | Формула |
|-----|---------|
| `by_area` | `площа × rate` |
| `fixed_per_apartment` | `fixedAmount` на кожну квартиру |
| `manual` | Сума з `manualLines[]` per apartment |

### Workflow
1. (Опційно) Створити шаблон `AccrualTemplate`
2. POST `/accruals/preview` — перевірити суми
3. POST `/accruals` — створити `Accrual` + `AccrualLine` для кожної квартири
4. `dueDate` — за замовчуванням 14-е число наступного місяця після `period`

### PDF-квитанція
GET `/accruals/lines/:lineId/receipt` — PDFKit, доступ:
- Мешканець — лише свої лінії
- Admin — будь-яка лінія

## Платежі та FIFO

### Принцип розноски
Платіж розподіляється на відкриті `AccrualLine` **в порядку FIFO**:
1. Найстаріший `dueDate`
2. При рівних датах — найстаріший `createdAt`

Реалізація: `planFifoAllocation()` в `common/utils/fifo-allocation.ts`.

### Приклад

| Лінія | Борг | Платіж 200 ₴ |
|-------|------|--------------|
| Січень (100 ₴) | 100 | → 100 ₴ |
| Лютий (40 ₴ борг) | 40 | → 40 ₴ |
| — | — | аванс 60 ₴ |

### Preview
GET `/payments/preview/allocation?apartmentId=&amount=` — без збереження в БД.

### Анулювання платежу
Відкочує `paidAmount` на лініях, змінює статуси, `isVoided = true`.

## Звіти

### Cash flow (`/finance/reports/cash-flow`)
- `totalIncome` — сума платежів
- `totalExpenses` — сума витрат (не voided)
- `fundBalances[]` — по кожному фонду

### Боржники (`/payments/reports/debtors`)
Агрегація по квартирах: сума боргу, `isOverdue` за найстарішим `dueDate`.

## Аудит

Фінансові операції логуються в `AuditLog`:
- `expense.created`, `expense.voided`
- `accrual.created`
- `payment.created`, `payment.voided`