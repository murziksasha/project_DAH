# 11. Roadmap

## MVP → v0.9

Фази 0–8 MVP + пост-MVP 0.2–0.9 — завершено (див. git history).

## v1.0–1.5 plan — **COMPLETE**

| Версія | Зміст | Статус |
|--------|--------|--------|
| **1.0** | Sessions, journal, money minor units, multi-building, vote weight, ops | ✅ |
| **1.1** | Meters / by_meter, statement CSV, online sandbox | ✅ |
| **1.2** | Export pack ZIP, LiqPay form, SMS skeleton, Query hooks | ✅ |
| **1.3** | WayForPay HMAC, SMS login UI, resident meters | ✅ |
| **1.4** | Profile phone, TurboSMS/AlphaSMS, Diia/BankID mock | ✅ |
| **1.5** | Multi-tenant foundation + full data scope + super-admin tenant context | ✅ |

### Original DoD (v1.0+) — all checked

1. [x] Session hardening (no long-lived refresh in localStorage)
2. [x] Health + backup markers + ops
3. [x] Money minor units + FIFO locks
4. [x] Journal + reconcile
5. [x] Typed client, UI kit, pagination, Query
6. [x] Vote weight + quorum
7. [x] Multi-building
8. [x] Meters + by_meter
9. [x] Export pack + online pay skeleton
10. [x] SMS + identity mock
11. [x] Multi-tenant Tenant model + isolation + admin UI + X-Tenant-Id

## v1.6–1.7 product polish — **COMPLETE**

| Версія | Зміст | Статус |
|--------|--------|--------|
| **1.6** | Excel exports, deep resident account UX | ✅ |
| **1.7** | Бренд **«Мій дім»**; `Tenant.orgType` ОСББ \| УК; labels UI | ✅ |

## v1.8 — document constructor

| Тема | Статус |
|------|--------|
| Конструктор PDF (квитанції, звіт правління) | ✅ layout blocks + `{{variables}}` |
| Конструктор Excel / export pack | ✅ увімкнення колонок і файлів ZIP |
| Збереження в `Building.settings.documentTemplates` | ✅ |
| UI `/admin/document-templates` | ✅ |

## v1.9 — bank adapters + dispatcher SLA — **COMPLETE**

| Тема | Статус |
|------|--------|
| Універсальний імпорт виписки (будь-який банк) | ✅ adapters + MT940 + UI format |
| Роль `dispatcher` + `MANAGE_REQUESTS` | ✅ |
| Request priority + auto SLA dueAt + queue API/UI | ✅ |
| Фокус продукту: self-hosted one OSBB | ✅ (SaaS deprioritized) |

## v1.10 — matching, crew, pay, meetings, messenger — **COMPLETE**

| Тема | Статус |
|------|--------|
| Matching IBAN / ПІБ | ✅ Resident.iban + multi-strategy match |
| SLA hours in Building.settings | ✅ |
| Роль `crew` (бригада) | ✅ |
| Production online pay + OnlinePaymentOrder | ✅ |
| Збори + КЕП (mock + skeleton) | ✅ |
| Production КЕП / Дія.Підпис (SignSession, webhook, CAdES) | ✅ 1.10.1 |
| Месенджер | ✅ |

## Product decisions (2026-08)

| Рішення | |
|---------|--|
| Режим | Self-hosted (один ОСББ/інстанс у фокусі) |
| Збори + КЕП | Відкладено (polls лишаються) |
| Імпорт банку | Заготовка під **будь-який** банк (профілі + auto) |
| УК vs messenger | **Диспетчер/SLA** > соц-месенджер |

## v1.12 — confirm dialogs + role dashboards + network banner — **COMPLETE**

| Тема | Статус |
|------|--------|
| ConfirmDialog payments void + documents delete | ✅ |
| Role home: dispatcher / accountant / crew / board | ✅ |
| Login getRoleHome + dispatch ?filter= | ✅ |
| NetworkStatusBanner offline / API / recovered | ✅ |

## v1.11 — security + UX for 200–300 users — **COMPLETE**

| Тема | Статус |
|------|--------|
| Prod hardening (Swagger off, health split, nginx limits, headers) | ✅ |
| Messenger building/tenant scope | ✅ |
| Password reset, lockout, password policy, TOTP encrypt | ✅ |
| Invite registration, magic-byte uploads, Request.buildingId | ✅ |
| Finance 2FA + dual expense approval + backup download audit | ✅ |
| Resident triad, notification center, global search, dispatch mobile | ✅ |
| Worker daily backup + SLA alerts | ✅ |

## v1.14 — runtime slim + perf (A–E) — **COMPLETE**

| Фаза | Зміст | Статус |
|------|--------|--------|
| **A** Slim `WorkerModule` (не full AppModule) | ✅ |
| **B** Inline cron; Redis optional (`REDIS_URL=none`, profile `redis`) | ✅ |
| **C** Same-origin file download HMAC + stream (no public :9000) | ✅ |
| **D** Next `output: 'export'` + nginx:alpine web (no Node web) | ✅ |
| **E** React Query hot paths + dynamic DocumentTemplateBuilder | ✅ |

## Beyond plan (future product, not blocking)

| Тема | Примітка |
|------|----------|
| Production Diia/BankID | Потрібна реєстрація клієнта в IdP |
| Subdomain per tenant / SaaS billing | Низький пріоритет (self-hosted first) |
| Email unique per tenant | **Не потрібно**: global unique identity + `TenantMembership` multi-org |
| WayForPay multi-product arrays | Розширення під кошик |
| Messenger / збори + КЕП | Після dispatcher polish |
| Бригада (crew) role | Можна поверх dispatcher |
| Візуальний drag-and-drop WYSIWYG для PDF | Зараз блоковий конструктор + preview |
| Bank matching by IBAN/resident profile | Наступний крок після adapters |

## Версіонування

- `1.5.x` — patch на multi-tenant + plan completion
- `1.9` — bank adapters + dispatcher SLA
- `2.0` — breaking: subdomain SaaS, billing, email@@tenant (лише якщо знадобиться)

При зміні API/схеми — оновлювати `SPEC/`.
