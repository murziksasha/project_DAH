# 06. Фінансовий модуль

Фінансова логіка **однакова** для ОСББ і УК (`Tenant.orgType` впливає лише на labels UI, не на FIFO/фонди).  
Продукт: **«Мій дім»**.

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

Макет квитанції — **конструктор документів** (`Building.settings.documentTemplates.forms`, kind=`receipt`):
блоки (heading, paragraph, fieldGrid, signatures, …) + змінні `{{apartmentNumber}}`, `{{balance}}`, `{{bankIban}}` тощо.
Активний шаблон застосовується при генерації PDF (окремо / ZIP / multi-page).

### PDF-звіт для зборів
GET `/finance/reports/board.pdf` — макет kind=`board_report` (таблиці фондів / витрат / боржників як `dataTable`).

### Excel / export pack
Колонки та склад ZIP налаштовуються в `documentTemplates.exports` (профілі `debtors`, `cash_flow`, `expenses`, `statement`, `export_pack`).
UI: `/admin/document-templates`.

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
- `accrual.created`, `accrual.reversed`
- `payment.created`, `payment.voided`
- `accounting_period.status`, `bank_statement.line_assign`, `bank_statement.line_ignore`

## Облікові періоди (Package A+)

| Status | Платежі | Нарахування / витрати / void |
|--------|---------|------------------------------|
| `open` (або немає рядка) | ✅ | ✅ |
| `soft_closed` | ✅ | ❌ |
| `locked` | ❌ | ❌ |

API: `GET|PATCH /finance/periods`, `GET /finance/periods/checklist?buildingId&period`.

## Пеня

`Building.settings.penalty`: `{ enabled, annualRatePercent, graceDays, dailyCap?, fundId? }`.  
Worker (разом із reminders) створює нарахування `Пеня YYYY-MM-DD` раз на добу.  
Рахунок мешканця: `summary.debtPrincipal` + `summary.debtPenalty`.

## Сторно нарахування

`POST /accruals/:id/reverse` `{ reason? }` — обнуляє відкритий залишок ліній, journal reverse, audit `accrual.reversed`.

## Імпорт виписки v2

- Preview → `BankStatement` + lines + confidence  
- `PATCH /payments/import/lines/:id` — manual + IBAN alias  
- `PATCH /payments/import/lines/:id/ignore`  
- `GET /payments/import/unmatched?days=30`

## Бюджет (план / факт)

- `BudgetLine`: building + year (+ optional month/fund/category) + `plannedAmount`
- `GET /finance/budget/plan-fact?buildingId&year` — actual = approved non-voided expenses
- UI: `/admin/budget`

## Перекази між фондами

- `FundTransfer` + journal dual `fund_balance` lines
- Same building only; period lock + finance 2FA on write
- UI: `/admin/transfers`

## Глибока бухгалтерія (GL)

### Journal invariants
- Кожен `JournalEntry`: Σ debit = Σ credit; idempotencyKey; `valueDate` + `period` + `entryNo`
- Типи: accrual, payment, expense, void_*, opening, fund_transfer, penalty, accrual_reverse, adjustment, write_off, supplier_invoice, supplier_payment, bank_fee
- Logical CoA (`LedgerAccount`): cash, receivable, advance, expense, fund_balance, payable, income, penalty_income, write_off, clearing, suspense
- API: `GET /journal`, `GET /journal/reconcile`, `GET /journal/trial-balance`, `GET /journal/account-card`, `GET /journal/coa`
- UI: `/admin/journal`

### AR (дебіторка)
- Aging: `GET /accounting/ar-aging`
- Statement квартири: `GET /accounting/apartments/:id/statement`
- Write-off (maker-checker): `POST /accounting/write-offs`, `POST .../approve`
- Service tariffs: `GET|POST /accounting/tariffs`
- UI: `/admin/ar`

### AP (кредиторка)
- `SupplierInvoice` draft→approved→partially_paid→paid + journal expense/payable
- Оплата: `POST /accounting/supplier-invoices/pay` → payable/cash
- Aging: `GET /accounting/ap-aging`
- UI: `/admin/ap`

### Банк / каса
- `BankReconciliation` per bankAccount+period; GL cash vs statement
- Cash book: `GET /accounting/cash-book`
- UI: `/admin/bank-rec`

### Close pack + budget encumbrance
- `POST /accounting/periods/close-snapshot` — TB + aging + reconcile snapshot
- `GET /accounting/budget/plan-fact-encumbrance` — plan/fact + open AP commitments
- CoA export map (1C codes): `GET /accounting/coa-export-map`

### Posting engine + manual allocation + tariffs
- `PostingService` standardizes dual-entry pairs for document events
- Payment `allocations[]` — manual override FIFO; rest → advance (UI checkbox on `/admin/payments`)
- `POST /accruals/lines/:lineId/credit-note` `{ amount, reason? }` (UI on accrual lines)
- `POST /accounting/tariffs/run` `{ buildingId, period, dryRun?, tariffIds? }`
- Shadow SoT: `GET /journal/shadow-compare?buildingId=` → `readyForSot`
- Accountant: `GET /accounting/overview?buildingId=`
- Cash-flow dual: `GET /finance/reports/cash-flow?source=legacy|journal|both`
- Year-end: `POST /accounting/year-end` `{ buildingId, year }`
- Manual adjustment: `POST /accounting/adjustments` (balanced lines)
- Owner change: `GET /accounting/owner-change-policy?apartmentId=` — balance stays on apartment
- Period reopen requires `notes` (reason)

### Journal SoT (cutover path)
- Flag: `Building.settings.finance.journalSot` або env `JOURNAL_SOT=true|false` (env має пріоритет)
- `GET /finance/sot-status?buildingId=` — flags + readyForSot з shadow-compare
- Коли SoT ON:
  - `listFunds` → `balance` = journal cash projector
  - особовий рахунок `summary.advance` = journal advance
  - cash-flow default source = `journal` (override `?source=`)
- Writes лишаються dual-run (legacy fields + journal) до повного drop dual-run
- UI: `/admin/settings` (finance flags), `/admin/reports` (джерело cash-flow)