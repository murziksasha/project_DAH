# Changelog

## Unreleased

### Journal SoT cutover path
- `settings.finance.journalSot` + env `JOURNAL_SOT` override
- `GET /finance/sot-status`; funds/account/cash-flow read projectors when ON
- Reports UI: cash-flow source auto|legacy|journal|both + SoT badge
- Settings UI: journalSot / strictBankRec / defaultCashFlowSource
- E2E `finance-deep.e2e-spec.ts` (month-close happy path, skips without DB)

### Deep accounting max-pack
- Payments UI: manual allocation override FIFO with editable amounts
- Accruals list: per-line Credit note
- PostingService wired for expenses, accruals, penalties, fund transfers
- Cash-flow `?source=legacy|journal|both` dual projector
- Year-end soft_close + snapshot; period reopen requires reason
- Manual GL adjustment UI on journal Shadow tab
- Owner-change policy API (balance stays on apartment)

### Deep accounting follow-up (posting engine + AR/AP depth)
- `PostingService` — central balanced postings (payment, expense, AP, write-off, credit note, transfer, penalty)
- Manual payment allocation override FIFO: `CreatePaymentDto.allocations[]`
- Credit note: `POST /accruals/lines/:lineId/credit-note` (open balance only)
- Mass tariff run: `POST /accounting/tariffs/run` (dryRun + create) + UI on `/admin/ar`
- Journal projectors: `GET /journal/fund-balances`, `GET /journal/shadow-compare` (readyForSot)
- Accountant dashboard GL strip + deep-accounting overview API
- `planManualAllocation` unit tests

### Deep accounting (GL-0 … GL-6)
- Journal invariants: D=C validation, idempotencyKey, valueDate/period/entryNo, reverse link
- Entry types: fund_transfer, penalty, accrual_reverse, write_off, supplier_*, bank_fee, adjustment
- CoA `LedgerAccount` + trial balance + account card + reconcile v2 (entry balance, orphans, TB)
- AP: SupplierInvoice / SupplierPayment + aging; UI `/admin/ap`
- AR: aging, apartment statement, write-off maker-checker, service tariffs; UI `/admin/ar`
- Bank reconciliation + cash book; UI `/admin/bank-rec`
- Journal / ОСВ UI `/admin/journal`
- Period close snapshot + checklist (bank rec, write-offs, draft invoices)
- Budget plan/fact with AP encumbrance; CoA→external (1C) export map
- Migration `20260815200000_deep_accounting_gl`

### Copilot (heuristic, opt-in)
- Module `/api/copilot`: classify-request, match-hint, draft-note (no external LLM by default)
- Dispatch UI: button «AI пріоритет» applies classify → PATCH request
- `COPILOT_ENABLED=false` to disable

### Worker markers + ops
- Worker writes `backups/worker-last.json` after reminders/SLA/reconcile
- `GET /health/details` includes `worker` status; ops page uses details + stale alerts

### Budget plan/fact + fund transfers
- Models `BudgetLine`, `FundTransfer` + migration `20260815140000_budget_fund_transfer`
- API: `GET/POST/PATCH/DELETE /finance/budget`, `GET /finance/budget/plan-fact`
- API: `GET/POST /finance/transfers`, `PATCH /finance/transfers/:id/void`
- UI: `/admin/budget`, `/admin/transfers` + nav
- Resident account: shows principal vs пеня when penalty debt present
- Hardened `finance-policy.e2e-spec.ts` matrix

### Deep follow-up (finance engine + bank + ops + meetings)
- Resident push **quiet hours** (localStorage) + hide install/push prompt during quiet window
- Accruals list **Сторно** button
- **Пеня**: `Building.settings.penalty` + daily worker job (`processDailyPenalties`); account summary `debtPrincipal` / `debtPenalty`
- **Сторно нарахування**: `POST /accruals/:id/reverse` + journal reverse
- **Close-month checklist**: `GET /finance/periods/checklist` + UI on `/admin/periods`
- Bank: ignore line, `GET /payments/import/unmatched`, golden Privat/Mono fixtures
- Multi-building announcements: `buildingIds[]` on create
- `PermissionsGuard` + `@RequirePermissions` on finance funds/expenses write
- Ops: backup stale alert (>8 days); prod compose `KEP_ALLOW_MOCK=false`
- Meetings: quorum stats UI, **PDF протоколу** download
- Unit: `penalty.spec.ts`

### Package E — «Платформа на 2–3 роки»
- Building settings **schemaVersion 2** + migrate/validate helpers + unit tests
- In-process **domain events** bus (`domain-events.ts`); payment.allocated emit
- Worker daily **journal.reconcile** (~04:00 UTC) + mismatch domain event
- Structured HTTP logs: tenantId / userId / role when present
- `docs/OPENAPI-CODEGEN.md` for Swagger → api-client flow

### Package D — «Юридична вага»
- Meeting lifecycle transitions (draft→scheduled→open→closed); auto protocol on close
- Live quorum stats on meeting detail (`participationPercent`, `quorumMet`, `eligibleWeight`)
- `GET /meetings/:id/protocol.pdf` — PDF протоколу; KEP production checklist in `docs/KEP.md`

### Package C — «УК як бізнес»
- `GET /building/portfolio` — KPI по будинках (борг, збір %, SLA-заявки)
- Admin home для `management_company` chairman/board → **PortfolioDashboard**
- Crew mobile: великі кнопки «В роботі» / «Виконано» на домівці

### Package B — «Мешканець щодня відкриває»
- Offline **request drafts** queue + auto-flush (`RequestQueueFlusher`); Action Home card
- Pay deep-link `/resident?pay=1` opens PaySheet
- Transparency **«Куди пішли гроші»** story cards (income / expenses / net + top categories/funds)

### Package A — «Довіра бухгалтера»
- **Matching engine v2**: confidence scores, multi-candidate conflict demotion, IBAN alias learning; name-only matches require manual confirm
- **BankStatement / BankStatementLine** persisted on import preview; `PATCH /payments/import/lines/:id` manual assign; commit links `paymentId` + statement status
- **AccountingPeriod** (`open` | `soft_closed` | `locked`) per building/YYYY-MM; gates payments/expenses/accruals/voids; UI `/admin/periods`; API `GET|PATCH /finance/periods`
- **Finance RBAC**: GET funds/expenses/reports/accruals templates require READ_FINANCE roles (resident/dispatcher/crew → 403)
- **Unified backup pack**: optional MinIO `files/` mirror in API dump (manifest schemaVersion 2); `infra/scripts/restore.ps1` + `npm run restore:native:win`
- **Policy tests**: `packages/shared` permissions matrix unit; `finance-policy.e2e-spec.ts`; period service unit tests

### Login / admin password
- Password field **eye toggle** (show/hide) on login, reset, register, org user form
- Login + register + admin user: email **normalized** (trim + lower)
- Admin set password: `assertPasswordStrength`, clear lockout counters, explicit success hint
- Create-user for existing email can also reset password when provided

### UX — who is signed in + dismissable security banner
- Header always shows **name + role** (drawer also shows role under name)
- Onboarding «Безпека» 2FA nag: **Сховати** (session) / **Більше не показувати** (localStorage per user)
- Security link respects resident vs staff (`/resident/security` vs `/admin/security`)

### Native Windows host ops (KeenDNS-ready)
- `npm run update:native:win` — install → generate → build → migrate → restart (`update-native-windows.ps1`)
- **No git pull** in Windows update script (operator updates tree manually)
- Fix: pre-update dump no longer assigns `$host` (PowerShell read-only automatic variable → `$pgHost`)
- Fix: stop stack **before** `prisma generate` (Windows EPERM on `query_engine-windows.dll.node`)
- `stop:native:win` / `restart:native:win` / `status:native:win` / `smoke:native:win`
- `npx dah-native update` on win32 → PowerShell update (not bash/`systemctl`)
- `backup.ps1` native fallback: `pg_dump` + optional `mc`; `npm run backup:native` / `backup:win`
- Pre-update DB dump under `backups/pre-update/` when `pg_dump` available
- nginx `dah-windows.conf.in`: `@@TLS_SERVER_BLOCK@@` opt-in (`DAH_ENABLE_TLS=1` / `-EnableTls`); default remains HTTP-only
- Docs: `docs/KEENDNS-WINDOWS.md`, NATIVE-HOST-WINDOWS update section, SECURITY perimeter note, README scripts
- Firewall install rules **unchanged** (docs-only guidance)

### Setup wizard — tenant scope + nav flicker
- `GET/POST /setup/*` привʼязані до **`X-Tenant-Id`** (building/users/complete не змішують orgs)
- Web: soft `router.replace` замість `window.location` при already-initialized / після complete (без full-page blink)
- Drawer: «Майстер налаштування» лише коли вибраний tenant `!isInitialized`; якщо tenants є, але контекст не обрано — пункт сховано
- AppShell перечитує status після SPA-навігації та `dah-tenant-change`
- Docs: SPEC/03, SPEC/05

### Users — org scope, filter/sort, multi-membership, role catalog
- Model `TenantMembership` unique `(userId, tenantId, role)`; multi-org + dual persona (board+resident)
- Model `TenantRole`: per-tenant catalog — activate/deactivate/labels; DELETE only if 0 members
- `GET/POST/PATCH/DELETE /roles` (manage: super_admin; list: +chairman); assignable check on create/update user
- `GET /users`: tenant required; filters/sort/search; membership rows
- `POST /users`: existing email → new membership (other role same org OK); inactive catalog role rejected
- Auth: `memberships[]`, `select-tenant { tenantId, role }`, login/header persona switcher
- Web organization: org selector, users filter/sort, **Roles** section, dropdowns from catalog
- SPEC 02/03/04/05 + README

### Security — tenant deactivation
- Login / 2FA / SMS / refresh / JWT: відмова, якщо `Tenant.isActive = false` (голова ОСББ і всі users org)
- `PATCH /tenants/:id` `isActive: false` відкликає `AuthSession` users організації
- Web: `/login?reason=tenant_inactive`, без циклу «кабінет → login → кабінет»; підказка на `/admin/tenants`
- Docs: SPEC/02, 03, 04, 05; e2e auth inactive tenant

### Native host (no Docker)
- Root scripts: `npm run start` / `start:app` / `start:api` / `start:worker` (dotenv + API + Worker)
- `@dah/api` script `start:worker`
- `infra/scripts/run-with-env.sh`, `run-minio.sh`, `run-minio-init.sh`, `install-native-systemd.sh`
- systemd templates `infra/systemd/dah-*.service.in`, `dah.target.in`
- nginx native site template `infra/nginx/dah-native.conf.in` (static `out` + `/api` proxy)
- Docs: README + DEPLOY §10 Native host
- `npm run update:native` / `infra/scripts/update-native.sh` — one-shot pull→build→migrate→restart

## 1.14.0 — Runtime slim + performance (phases A–E)

### A — Slim worker
- `WorkerModule` loads only Prisma, Mail, Audit, Reminders, Backups, Notifications
- No full `AppModule` (auth/finance/kep/messenger/throttler not booted in worker)

### B — Jobs without Redis
- Inline cron (`setInterval`): 15‑min reminders+SLA, daily/weekly backups
- BullMQ removed; `REDIS_URL=none` by default; compose `redis` under `--profile redis`
- Health: `redis: skipped` when URL empty/none/disabled

### C — Same-origin files
- `GET /api/files/download?key&exp&sig` streams from MinIO (HMAC token)
- Upload / finance / documents / communications URLs no longer point at `:9000`
- Unit tests: `file-download-token.spec.ts`

### D — Static web
- Next.js `output: 'export'` + `trailingSlash`; Docker web = **nginx:alpine** (no Node)
- Apartment account: `/admin/apartments/detail/?id=` (static-export safe)
- Soft auth via `AppShell` (middleware removed)

### E — Client perf
- React Query: dispatch queue, communications bundle, messenger threads/peers
- `dynamic()` code-split for `DocumentTemplateBuilder`

### Docs
- SPEC/02, SPEC/09, SPEC/11, DEPLOY, SECURITY-CHECKLIST, `.env.example`

## 1.13.5 — Seed meters/multi-apt, security polish, e2e helpers

### Demo seed
- 3 лічильники (хол./гар. вода, ел.) + покази за попередній період
- Resident linked to **2 apartments** (switcher ready for e2e)

### Resident security
- Skeleton, back link, comfort toggle section, better labels/hints for email & push

### QA
- `e2e/helpers.ts` — loginAsResident / dismissTour / expandDesktopNav
- Expanded resident + offline-apt e2e (real multi-apt + offline submit)

## 1.13.4 — E2E offline/apt, mail CTA tests, drawer comfort

### QA
- Playwright: offline meter queue banner + flush; multi-apt soft switch (no reload); drawer comfort toggle
- Jest: `mail.templates.spec.ts` — resolveActionUrl + HTML CTA deep-links

### Resident
- **Comfort mode** у desktop drawer (footer A⁺ / A), не лише header

## 1.13.3 — Nav badges, home queue signal, global meter flush

### Resident
- **Bottom nav badges**: unread news (Ще), open requests, offline meter queue
- **Action Home**: картка «Надіслати офлайн-покази»
- **MeterQueueFlusher** у AppShell (flush з будь-якого екрану при online)
- **NetworkStatusBanner**: resident offline copy + hint після recovery

## 1.13.2 — Offline meters queue, soft apt switch, email deep-links

### Resident
- **Offline queue** показів: localStorage + auto-flush on `online` + manual «Надіслати зараз»
- **Multi-apartment** без full reload (`dah-apartment-change` event → re-fetch account/meters)
- **Email deep-links**: `actionPath` / CTA-кнопка в HTML (рахунок, новини, заявки, dispatch, login)

## 1.13.1 — Multi-apt, comfort mode, messenger/meetings polish

### Resident
- **Multi-apartment switcher** (`/auth/profile` apartments + `?apartmentId=` on my-account)
- **Comfort mode** (A⁺ larger type) for residents in header
- **Messenger / meetings** polish: EmptyState, skeletons, i18n, mobile layout, previews
- **One-tap PDF** за поточний місяць на спрощеному рахунку
- **Modal a11y**: focus trap, aria-labelledby, restore focus

## 1.13.0 — Resident flow UX (action home → A–E polish)

### Кабінет мешканця (базовий flow)
- **Action Home**, **bottom nav**, **Pay sheet**, news/requests split
- **Спрощений рахунок**, deep-link сповіщень, **pending-реєстрація**

### A–E (100%)
- **A** Read-state оголошень (`AnnouncementRead`), badges, mark-all на вкладці Новини
- **B** Заявки: dueAt/updatedAt/SLA, assignee, фото (upload folder `requests` для resident)
- **C** Лічильники batch + `metersReadingDeadlineDay` + банер на домівці
- **D** `ResidentTour` (3 кроки), empty apartment state
- **E** Lazy-load: account/meters first → signals → transparency on demand
- Migration `20260804140000_announcement_reads_meters_deadline`
- SPEC `08-resident-portal.md`

## 1.12.0 — Confirm dialogs, role dashboards, network banner

### ConfirmDialog
- Payments void: modal + required reason (no `window.prompt`)
- Documents delete: modal with title/visibility (no `window.confirm`)

### Role dashboards (`/admin`)
- **Dispatcher** — SLA KPI, urgent list, take-in-progress
- **Accountant** — cash-flow, pending dual-approve, debtors, quick finance actions
- **Crew** — my open jobs
- **Board/chairman/auditor** — existing board dashboard (extracted)
- Login redirect uses `getRoleHome`; dispatcher/crew home → `/admin`
- Dispatch supports `?filter=overdue|unassigned|mine`

### Offline / PWA network
- `NetworkStatusBanner`: browser offline vs API down vs recovered flash
- Shown site-wide via root layout (login included)

## 1.11.1 — Sessions UI, header search, expense void dialog

- `GET/DELETE /auth/sessions` — список пристроїв + відкликання (family revoke)
- Access JWT містить `sid` для позначки «цей пристрій»
- UI: `SessionsPanel` у admin/resident security
- Header quick search для staff
- Витрати: анулювання через ConfirmDialog + причина (без `window.prompt`)
- Audit labels для password reset / session / expense dual-approve
- e2e: sessions smoke

## 1.11.0 — Security hardening + UX for 200–300 users

### Security (P0–P1)
- Swagger **off by default in production** (`SWAGGER_ENABLED` explicit opt-in)
- API security headers (CSP, nosniff, frame options)
- nginx body limits: 25m API, 512m backups; CSP header
- Public `/api/health` minimal; full details at `/api/health/details` (staff)
- Messenger: building membership + same-tenant DMs/peers
- Password policy (length + letter + digit + common list)
- Login lockout after 10 failed attempts (15 min)
- Password reset via email (`POST /auth/password/forgot|reset`)
- TOTP secrets encrypted at rest (`enc:v1:` + AES-GCM)
- File uploads validated by **magic bytes** (not client MIME alone)
- Registration **invite code** (`Building.settings.registrationInviteCode`)
- Finance + backup download: **require 2FA** (`REQUIRE_FINANCE_2FA`, default on)
- Expense dual-approval threshold + `POST /finance/expenses/:id/approve`
- Request `buildingId` + SLA notify job; audit on backup download

### UX
- Resident home triad (balance / request / meters)
- Notification bell + in-app inbox
- Admin global search (apartments, users, open requests)
- Password reset UI on login; onboarding / 2FA banners
- Dispatch mobile cards; toast provider; confirm dialog component
- Settings: invite code + dual-approval threshold

### Ops
- Worker: daily backup + SLA scan
- `docs/SECURITY-CHECKLIST.md`
- Migration `20260804120000_security_ux_hardening`

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
