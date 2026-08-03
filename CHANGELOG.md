# Changelog

## 1.10.1 — Production КЕП / Дія.Підпис

- Модуль **`/api/kep`**: SignSession, providers `mock` | `diia` | `cloud_kep` | `cades`
- Diia offer API + deeplink; webhook `POST /api/kep/webhook` (secret / HMAC)
- Cloud QES OAuth authorize + token exchange
- CAdES upload (`signatureCms` base64) for EUSign/token
- Mock authorize page; meetings `POST /meetings/:id/sign` → session + poll UI
- `docs/KEP.md`, env `KEP_*` у `.env.example`
- Unit-тести `kep.service.spec.ts`

## 1.10.0 — Matching, crew, production pay, збори+КЕП, месенджер

### Matching платежів
- Зіставлення виписки: **квартира → IBAN мешканця → ПІБ**
- `Resident.iban` для імпорту; matching unit-тести

### SLA в Building.settings
- `slaHoursByCategory` (sanitary/electric/elevator/…)
- UI `/admin/settings`; auto-`dueAt` при створенні заявки

### Роль «бригада» (`crew`)
- `WORK_REQUESTS`: лише призначені заявки, без фінансів
- Черга `/admin/dispatch` (mine only)

### Production online-оплата
- Модель `OnlinePaymentOrder` (pending/paid, idempotent webhook)
- LiqPay / WayForPay / generic webhook parsers + amount check
- `sandbox-complete` заблоковано при `ONLINE_PAYMENTS_SANDBOX=false`
- Resident pay: production → checkout form; sandbox → instant complete
- `GET /payments/online/orders/:orderId`, status.productionReady

### Збори + КЕП
- Модуль `/api/meetings`: draft→open→closed, agenda, register, vote, protocol
- Підпис: `mock` (demo) | `kep`/`diia` (pending + challenge)
- UI `/admin/meetings`, `/resident/meetings`

### Месенджер
- Threads: building / board_residents / direct
- API `/api/messenger/*`; UI `/admin/messenger`, `/resident/messenger`

## 1.9.0 — Bank adapters + диспетчер / SLA

### Банківська виписка (будь-який банк)
- Адаптери форматів: `auto` | `generic_csv` | `privatbank` | `monobank` | `oschadbank` | `mt940`
- `POST /payments/import/preview` приймає `format`, `buildingId`; відповідь: `format`, `detectedFormat`
- UI `/admin/payments` — вибір формату + підказка визначеного профілю
- Unit-тести MT940 / detect

### УК-портфель: диспетчер + SLA
- Роль Prisma `dispatcher` (без фінансів; `MANAGE_REQUESTS`)
- `Request.priority` (`low` | `normal` | `high` | `urgent`)
- Авто-`dueAt` з категорії × пріоритету (`request-sla.ts`)
- API: `GET /communications/requests/queue` (фільтри overdue / unassigned / mine)
- UI: `/admin/dispatch` — черга, SLA-бейджі, «Взяти в роботу»
- Nav / labels / create-user для диспетчера

### Продуктові рішення
- Фокус: **self-hosted one OSBB** (не SaaS)
- Месенджер і збори+КЕП — **відкладено**
- Пріоритет: УК диспетчер/SLA + універсальний імпорт виписок

## 1.8.0 — Конструктор документів і звітів

- **Конструктор PDF** (практика layout-блоків + `{{змінні}}`, як у print forms CRM):
  - квитанції мешканців (`kind: receipt`)
  - звіт для зборів / правління (`kind: board_report`)
  - довільні шаблони
- **Конструктор Excel / вигрузок**: увімкнення колонок (боржники, рух коштів, витрати, виписка) і склад export-pack ZIP
- Збереження: `Building.settings.documentTemplates` (`forms` + `exports`)
- API: `GET/PATCH /building/document-templates`
- UI: `/admin/document-templates` (блоки, preview, змінні); посилання з Налаштувань і Звітів
- PDF-генерація квитанцій і board PDF читає **активний** шаблон; export pack фільтрує файли/колонки
- Shared: `@dah/shared` → `document-templates/*`

## 1.7.0 — «Мій дім» + ОСББ / УК

- **Ребрендинг:** DAH / ОСМД → **Мій дім** (UI, PWA, PDF, TOTP, email, landing, docs/SPEC)
- **`Tenant.orgType`:** `osbb` \| `management_company` (міграція, default `osbb`)
- API: create/patch tenants з `orgType`; login/`/auth/me` → `user.tenant`
- Web: `/admin/tenants` — створення ОСББ або УК; labels кабінету/ролей для УК
- `org-labels.ts`, інструкції, setup/settings без «лише ОСББ»
- SPEC: 01, 03, 04, 12-organization-types, README, DEPLOY

## 1.6.0 — Excel exports + resident account UX

- Усі **експорти** → Excel (`.xlsx`): витрати, виписка квартири, export-pack ZIP, звіти
- API: `GET /accruals/apartments/:id/statement.xlsx`
- Кабінет мешканця: фільтри рік/місяць/тип/статус/пошук, історія за періодами, Excel-виписка, адаптив
- Пошук на вкладках новин, документів, боржників, прозорості
- SPEC/08, інструкції мешканця

## 1.5.3 — weekly + manual data backups

- In-app **тижневі копії** PostgreSQL (`backups/weekly/{ISO}`) — worker daily ~03:00 UTC, **skip** якщо за тиждень уже є
- **Ручна копія** з `/admin/ops` + `POST /api/backups` (ролі правління/бухгалтер; не resident)
- API: `GET /backups`, `/backups/status`, `POST /backups/weekly`
- Docker: `postgresql-client`, volume `./backups` на api/worker
- Документація: SPEC/09, 03, 05, DEPLOY, README, інструкції

## 1.5.2 — reports: Cyrillic PDF + Excel exports

- PDF для зборів / квитанції: вбудований **DejaVu Sans** (кирилиця замість «кракозябр» Helvetica)
- Звіти: **Excel: рух** та **Excel: боржники** (`.xlsx` замість CSV)
- Docker API: `assets/fonts` у production-образі

## 1.5.1 — plan complete: full tenant data scope

- `@TenantId()` on finance, payments, accruals, meters, users
- Super-admin: `X-Tenant-Id` / `dah_tenant_id` context switch on `/admin/tenants`
- Roadmap marked **COMPLETE** for original v1 plan

## 1.5.0 — multi-tenant foundation

- Model `Tenant`; `Building.tenantId`, `User.tenantId`
- JWT / session includes `tenantId`
- Buildings/apartments scoped by tenant (non super_admin)
- Super-admin API `GET/POST/PATCH /tenants` + UI `/admin/tenants`
- Register/create user inherit tenant from building/actor

## 1.4.0 — profile phone, TurboSMS, Diia/BankID mock

- `GET/PATCH /auth/profile` — phone for SMS login
- Resident + admin security: edit phone
- TurboSMS + AlphaSMS HTTP send
- Identity module: Diia/BankID skeleton + **mock IdP** for local demos
- Login: «Увійти через Дію / BankID»

## 1.3.0 — WayForPay sig, SMS login, resident meters

- WayForPay `merchantSignature` (HMAC_MD5) on checkout form
- Resident: auto-POST LiqPay/WayForPay form when intent returns `form`
- SMS login: `POST /auth/login/sms/request|verify` + UI tabs on `/login`
- Resident meters: `/resident/meters` self-submit readings

## 1.2.0 — export pack, LiqPay form, SMS skeleton

- `GET /finance/reports/export-pack.zip` — cash-flow, debtors, expenses, 1c_transactions CSV
- Reports UI: **Export pack (Excel)**
- LiqPay checkout form fields (`ONLINE_PAYMENTS_PROVIDER=liqpay`)
- WayForPay form fields (partial)
- SMS module: status, test, OTP send/verify (flag `SMS_ENABLED`)
- TanStack Query: expenses list + funds/banks hooks

## 1.1.0 — meters, export, sandbox pay

- `Meter` / `MeterReading` + `GET/POST /meters`
- Accrual distribution **`by_meter`** (rate × consumption per period)
- Admin page `/admin/meters`
- CSV statement: `GET /accruals/apartments/:id/statement.csv`
- Online pay: `POST /payments/online/sandbox-complete`

## 1.0.0 — production-ready foundation

Перший стабільний self-hosted реліз для ОСББ.

### Security
- AuthSession: refresh rotation + reuse detection
- HttpOnly `dah_refresh`, access у `sessionStorage`
- logout-all, login failure audit

### Money & finance
- `@dah/money` minor units (kopiiky)
- FIFO/void з row locks (`SELECT FOR UPDATE`)
- Immutable journal (accrual/payment/expense/void/opening)
- `Apartment.advanceBalance`
- `GET /journal/reconcile` dual-check
- Create fund API + opening journal entry

### Multi-building
- List/create buildings, header switcher
- Scoped funds, banks, suppliers, expenses, accruals, apartments, reports, debtors

### Product
- Poll vote weight + quorum
- Requests: dueAt, photoKeys
- Resident account timeline
- Optional online pay intent + webhook (`ONLINE_PAYMENTS_ENABLED`)

### Platform
- Structured request logs, health (DB/Redis/MinIO/backup)
- UI kit + DataTable + Pagination
- `@dah/api-client`, TanStack Query hooks
- Payments list pagination

### Docs
- `docs/UPGRADE-0.9-to-1.0.md`
- SPEC v1.0 track

## 0.10.x
- Incremental foundation toward 1.0 (see git history)
