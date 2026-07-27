# Changelog

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
