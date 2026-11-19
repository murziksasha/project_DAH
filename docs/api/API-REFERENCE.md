# «Мій дім» — API reference

> Згенеровано з OpenAPI (`npm run openapi:export -w @dah/api`). Не редагуйте вручну.
> Машиночитна специфікація: [`openapi.json`](./openapi.json). 🔒 — потрібен Bearer JWT.

Усього endpoints: **266**.

## accounting

| Метод | Шлях | Auth | Опис |
|---|---|---|---|
| `POST` | `/api/accounting/adjustments` | 🔒 |  |
| `GET` | `/api/accounting/ap-aging` | 🔒 |  |
| `GET` | `/api/accounting/apartments/{apartmentId}/statement` | 🔒 |  |
| `GET` | `/api/accounting/ar-aging` | 🔒 |  |
| `GET` | `/api/accounting/bank-gl-balance` | 🔒 |  |
| `GET` | `/api/accounting/bank-reconciliations` | 🔒 |  |
| `POST` | `/api/accounting/bank-reconciliations` | 🔒 |  |
| `POST` | `/api/accounting/bank-reconciliations/{id}/close` | 🔒 |  |
| `GET` | `/api/accounting/budget/plan-fact-encumbrance` | 🔒 |  |
| `GET` | `/api/accounting/cash-book` | 🔒 |  |
| `GET` | `/api/accounting/coa-export-map` | 🔒 |  |
| `GET` | `/api/accounting/overview` | 🔒 |  |
| `GET` | `/api/accounting/owner-change-policy` | 🔒 |  |
| `POST` | `/api/accounting/periods/close-snapshot` | 🔒 |  |
| `GET` | `/api/accounting/periods/close-snapshots` | 🔒 |  |
| `GET` | `/api/accounting/supplier-invoices` | 🔒 |  |
| `POST` | `/api/accounting/supplier-invoices` | 🔒 |  |
| `POST` | `/api/accounting/supplier-invoices/pay` | 🔒 |  |
| `POST` | `/api/accounting/supplier-invoices/{id}/approve` | 🔒 |  |
| `GET` | `/api/accounting/tariffs` | 🔒 |  |
| `POST` | `/api/accounting/tariffs` | 🔒 |  |
| `POST` | `/api/accounting/tariffs/run` | 🔒 |  |
| `PATCH` | `/api/accounting/tariffs/{id}` | 🔒 |  |
| `GET` | `/api/accounting/write-offs` | 🔒 |  |
| `POST` | `/api/accounting/write-offs` | 🔒 |  |
| `POST` | `/api/accounting/write-offs/{id}/approve` | 🔒 |  |
| `POST` | `/api/accounting/year-end` | 🔒 |  |

## accruals

| Метод | Шлях | Auth | Опис |
|---|---|---|---|
| `GET` | `/api/accruals` | 🔒 |  |
| `POST` | `/api/accruals` | 🔒 |  |
| `GET` | `/api/accruals/apartments/{apartmentId}/account` | 🔒 |  |
| `GET` | `/api/accruals/apartments/{apartmentId}/statement.xlsx` | 🔒 |  |
| `POST` | `/api/accruals/lines/{lineId}/credit-note` | 🔒 |  |
| `GET` | `/api/accruals/lines/{lineId}/receipt` | 🔒 |  |
| `GET` | `/api/accruals/my-account` | 🔒 |  |
| `POST` | `/api/accruals/preview` | 🔒 |  |
| `GET` | `/api/accruals/templates` | 🔒 |  |
| `POST` | `/api/accruals/templates` | 🔒 |  |
| `DELETE` | `/api/accruals/templates/{id}` | 🔒 |  |
| `GET` | `/api/accruals/{id}` | 🔒 |  |
| `GET` | `/api/accruals/{id}/receipts.pdf` | 🔒 |  |
| `GET` | `/api/accruals/{id}/receipts.zip` | 🔒 |  |
| `POST` | `/api/accruals/{id}/reverse` | 🔒 |  |

## audit

| Метод | Шлях | Auth | Опис |
|---|---|---|---|
| `GET` | `/api/audit/logs` | 🔒 |  |

## auth

| Метод | Шлях | Auth | Опис |
|---|---|---|---|
| `POST` | `/api/auth/2fa/disable` | 🔒 |  |
| `POST` | `/api/auth/2fa/enable` | 🔒 |  |
| `POST` | `/api/auth/2fa/setup` | 🔒 |  |
| `GET` | `/api/auth/2fa/status` | 🔒 |  |
| `POST` | `/api/auth/2fa/verify` |  |  |
| `GET` | `/api/auth/apartments` |  |  |
| `PATCH` | `/api/auth/approve/{id}` | 🔒 |  |
| `POST` | `/api/auth/change-password` | 🔒 |  |
| `PATCH` | `/api/auth/email-notify` | 🔒 |  |
| `POST` | `/api/auth/login` |  |  |
| `POST` | `/api/auth/login/sms/request` |  |  |
| `POST` | `/api/auth/login/sms/verify` |  |  |
| `POST` | `/api/auth/logout` | 🔒 |  |
| `POST` | `/api/auth/logout-all` | 🔒 |  |
| `GET` | `/api/auth/me` | 🔒 |  |
| `GET` | `/api/auth/memberships` | 🔒 |  |
| `POST` | `/api/auth/onboarding/complete` | 🔒 |  |
| `POST` | `/api/auth/password/forgot` |  |  |
| `POST` | `/api/auth/password/reset` |  |  |
| `GET` | `/api/auth/pending` | 🔒 |  |
| `GET` | `/api/auth/profile` | 🔒 |  |
| `PATCH` | `/api/auth/profile` | 🔒 |  |
| `POST` | `/api/auth/refresh` |  |  |
| `POST` | `/api/auth/register` |  |  |
| `PATCH` | `/api/auth/reject/{id}` | 🔒 |  |
| `POST` | `/api/auth/select-tenant` | 🔒 |  |
| `GET` | `/api/auth/sessions` | 🔒 |  |
| `DELETE` | `/api/auth/sessions/{id}` | 🔒 |  |

## backups

| Метод | Шлях | Auth | Опис |
|---|---|---|---|
| `GET` | `/api/backups` | 🔒 |  |
| `POST` | `/api/backups` | 🔒 |  |
| `GET` | `/api/backups/status` | 🔒 |  |
| `POST` | `/api/backups/upload` | 🔒 |  |
| `POST` | `/api/backups/weekly` | 🔒 |  |
| `GET` | `/api/backups/{kind}/{id}/download` | 🔒 |  |

## building

| Метод | Шлях | Auth | Опис |
|---|---|---|---|
| `GET` | `/api/building` | 🔒 |  |
| `PATCH` | `/api/building` | 🔒 |  |
| `GET` | `/api/building/apartments` | 🔒 |  |
| `POST` | `/api/building/apartments` | 🔒 |  |
| `POST` | `/api/building/apartments/import` | 🔒 |  |
| `POST` | `/api/building/apartments/{apartmentId}/residents` | 🔒 |  |
| `GET` | `/api/building/apartments/{id}` | 🔒 |  |
| `PATCH` | `/api/building/apartments/{id}` | 🔒 |  |
| `DELETE` | `/api/building/apartments/{id}` | 🔒 |  |
| `GET` | `/api/building/by/{id}` | 🔒 |  |
| `POST` | `/api/building/create` | 🔒 |  |
| `GET` | `/api/building/document-templates` | 🔒 |  |
| `PATCH` | `/api/building/document-templates` | 🔒 |  |
| `GET` | `/api/building/list` | 🔒 |  |
| `GET` | `/api/building/ops-summary` | 🔒 |  |
| `GET` | `/api/building/portfolio` | 🔒 |  |
| `PATCH` | `/api/building/residents/{id}` | 🔒 |  |
| `DELETE` | `/api/building/residents/{id}` | 🔒 |  |
| `GET` | `/api/building/search` | 🔒 |  |
| `GET` | `/api/building/settings` | 🔒 |  |
| `PATCH` | `/api/building/settings` | 🔒 |  |

## communications

| Метод | Шлях | Auth | Опис |
|---|---|---|---|
| `GET` | `/api/communications/announcements` | 🔒 |  |
| `POST` | `/api/communications/announcements` | 🔒 |  |
| `PATCH` | `/api/communications/announcements/read-all` | 🔒 |  |
| `GET` | `/api/communications/announcements/unread-count` | 🔒 |  |
| `DELETE` | `/api/communications/announcements/{id}` | 🔒 |  |
| `PATCH` | `/api/communications/announcements/{id}/read` | 🔒 |  |
| `GET` | `/api/communications/polls` | 🔒 |  |
| `POST` | `/api/communications/polls` | 🔒 |  |
| `GET` | `/api/communications/polls/{id}` | 🔒 |  |
| `PATCH` | `/api/communications/polls/{id}/close` | 🔒 |  |
| `POST` | `/api/communications/polls/{id}/vote` | 🔒 |  |
| `GET` | `/api/communications/requests` | 🔒 |  |
| `POST` | `/api/communications/requests` | 🔒 |  |
| `GET` | `/api/communications/requests/queue` | 🔒 |  |
| `PATCH` | `/api/communications/requests/{id}` | 🔒 |  |

## copilot

| Метод | Шлях | Auth | Опис |
|---|---|---|---|
| `POST` | `/api/copilot/classify-request` | 🔒 |  |
| `POST` | `/api/copilot/draft-note` | 🔒 |  |
| `POST` | `/api/copilot/match-hint` | 🔒 |  |
| `GET` | `/api/copilot/status` | 🔒 |  |

## documents

| Метод | Шлях | Auth | Опис |
|---|---|---|---|
| `GET` | `/api/documents` | 🔒 |  |
| `POST` | `/api/documents` | 🔒 |  |
| `GET` | `/api/documents/public` | 🔒 |  |
| `DELETE` | `/api/documents/{id}` | 🔒 |  |
| `PATCH` | `/api/documents/{id}/visibility` | 🔒 |  |

## files

| Метод | Шлях | Auth | Опис |
|---|---|---|---|
| `GET` | `/api/files/download` |  |  |
| `POST` | `/api/files/upload` | 🔒 |  |

## finance

| Метод | Шлях | Auth | Опис |
|---|---|---|---|
| `GET` | `/api/finance/bank-accounts` | 🔒 |  |
| `POST` | `/api/finance/bank-accounts` | 🔒 |  |
| `PATCH` | `/api/finance/bank-accounts/{id}` | 🔒 |  |
| `DELETE` | `/api/finance/bank-accounts/{id}` | 🔒 |  |
| `GET` | `/api/finance/budget` | 🔒 |  |
| `POST` | `/api/finance/budget` | 🔒 |  |
| `GET` | `/api/finance/budget/plan-fact` | 🔒 |  |
| `PATCH` | `/api/finance/budget/{id}` | 🔒 |  |
| `DELETE` | `/api/finance/budget/{id}` | 🔒 |  |
| `GET` | `/api/finance/categories` | 🔒 |  |
| `POST` | `/api/finance/categories` | 🔒 |  |
| `PATCH` | `/api/finance/categories/{id}` | 🔒 |  |
| `DELETE` | `/api/finance/categories/{id}` | 🔒 |  |
| `GET` | `/api/finance/expenses` | 🔒 |  |
| `POST` | `/api/finance/expenses` | 🔒 |  |
| `GET` | `/api/finance/expenses/{id}` | 🔒 |  |
| `POST` | `/api/finance/expenses/{id}/approve` | 🔒 |  |
| `PATCH` | `/api/finance/expenses/{id}/void` | 🔒 |  |
| `GET` | `/api/finance/funds` | 🔒 |  |
| `POST` | `/api/finance/funds` | 🔒 |  |
| `PATCH` | `/api/finance/funds/{id}` | 🔒 |  |
| `GET` | `/api/finance/reports/board.pdf` | 🔒 |  |
| `GET` | `/api/finance/reports/cash-flow` | 🔒 |  |
| `GET` | `/api/finance/reports/expenses-summary` | 🔒 |  |
| `GET` | `/api/finance/reports/export-pack.zip` | 🔒 |  |
| `GET` | `/api/finance/sot-status` | 🔒 |  |
| `GET` | `/api/finance/suppliers` | 🔒 |  |
| `POST` | `/api/finance/suppliers` | 🔒 |  |
| `PATCH` | `/api/finance/suppliers/{id}` | 🔒 |  |
| `GET` | `/api/finance/transfers` | 🔒 |  |
| `POST` | `/api/finance/transfers` | 🔒 |  |
| `PATCH` | `/api/finance/transfers/{id}/void` | 🔒 |  |

## finance-periods

| Метод | Шлях | Auth | Опис |
|---|---|---|---|
| `GET` | `/api/finance/periods` | 🔒 |  |
| `PATCH` | `/api/finance/periods` | 🔒 |  |
| `GET` | `/api/finance/periods/checklist` | 🔒 |  |

## health

| Метод | Шлях | Auth | Опис |
|---|---|---|---|
| `GET` | `/api/health` |  |  |
| `GET` | `/api/health/details` | 🔒 |  |
| `GET` | `/api/health/live` |  |  |
| `GET` | `/api/health/ready` |  |  |

## identity

| Метод | Шлях | Auth | Опис |
|---|---|---|---|
| `POST` | `/api/identity/authorize` |  |  |
| `POST` | `/api/identity/callback` |  |  |
| `GET` | `/api/identity/mock/authorize` |  |  |
| `GET` | `/api/identity/status` |  |  |

## journal

| Метод | Шлях | Auth | Опис |
|---|---|---|---|
| `GET` | `/api/journal` | 🔒 |  |
| `GET` | `/api/journal/account-card` | 🔒 |  |
| `GET` | `/api/journal/coa` | 🔒 |  |
| `POST` | `/api/journal/coa/ensure-defaults` | 🔒 |  |
| `PATCH` | `/api/journal/coa/{id}/external-code` | 🔒 |  |
| `GET` | `/api/journal/fund-balances` | 🔒 |  |
| `GET` | `/api/journal/reconcile` | 🔒 |  |
| `GET` | `/api/journal/shadow-compare` | 🔒 |  |
| `POST` | `/api/journal/shadow-runs` | 🔒 |  |
| `GET` | `/api/journal/sot-readiness` | 🔒 |  |
| `GET` | `/api/journal/trial-balance` | 🔒 |  |
| `GET` | `/api/journal/{id}` | 🔒 |  |

## kep

| Метод | Шлях | Auth | Опис |
|---|---|---|---|
| `POST` | `/api/kep/meetings/{meetingId}/sign` | 🔒 |  |
| `GET` | `/api/kep/mock/authorize` |  |  |
| `GET` | `/api/kep/sessions/{id}` | 🔒 |  |
| `POST` | `/api/kep/sessions/{id}/complete` |  |  |
| `POST` | `/api/kep/sessions/{id}/complete-auth` | 🔒 |  |
| `GET` | `/api/kep/status` |  |  |
| `POST` | `/api/kep/webhook` |  |  |

## mail

| Метод | Шлях | Auth | Опис |
|---|---|---|---|
| `GET` | `/api/mail/logs` | 🔒 |  |
| `GET` | `/api/mail/status` | 🔒 |  |
| `POST` | `/api/mail/test` | 🔒 |  |

## meetings

| Метод | Шлях | Auth | Опис |
|---|---|---|---|
| `GET` | `/api/meetings` | 🔒 |  |
| `POST` | `/api/meetings` | 🔒 |  |
| `GET` | `/api/meetings/{id}` | 🔒 |  |
| `POST` | `/api/meetings/{id}/agenda/{agendaItemId}/vote` | 🔒 |  |
| `POST` | `/api/meetings/{id}/protocol` | 🔒 |  |
| `GET` | `/api/meetings/{id}/protocol.pdf` | 🔒 |  |
| `POST` | `/api/meetings/{id}/register` | 🔒 |  |
| `POST` | `/api/meetings/{id}/sign` | 🔒 |  |
| `PATCH` | `/api/meetings/{id}/status` | 🔒 |  |

## messenger

| Метод | Шлях | Auth | Опис |
|---|---|---|---|
| `GET` | `/api/messenger/peers` | 🔒 |  |
| `GET` | `/api/messenger/threads` | 🔒 |  |
| `POST` | `/api/messenger/threads/board` | 🔒 |  |
| `POST` | `/api/messenger/threads/building` | 🔒 |  |
| `POST` | `/api/messenger/threads/direct` | 🔒 |  |
| `GET` | `/api/messenger/threads/{id}/messages` | 🔒 |  |
| `POST` | `/api/messenger/threads/{id}/messages` | 🔒 |  |

## meters

| Метод | Шлях | Auth | Опис |
|---|---|---|---|
| `GET` | `/api/meters` | 🔒 |  |
| `POST` | `/api/meters` | 🔒 |  |
| `GET` | `/api/meters/apartment/{apartmentId}` | 🔒 |  |
| `PATCH` | `/api/meters/{id}/deactivate` | 🔒 |  |
| `POST` | `/api/meters/{id}/readings` | 🔒 |  |
| `POST` | `/api/meters/{id}/readings/self` | 🔒 |  |

## notifications

| Метод | Шлях | Auth | Опис |
|---|---|---|---|
| `GET` | `/api/notifications/inbox` | 🔒 |  |
| `PATCH` | `/api/notifications/inbox/read` | 🔒 |  |
| `PATCH` | `/api/notifications/inbox/{id}/read` | 🔒 |  |
| `POST` | `/api/notifications/subscribe` | 🔒 |  |
| `DELETE` | `/api/notifications/subscribe` | 🔒 |  |
| `GET` | `/api/notifications/vapid-public-key` |  |  |

## payments

| Метод | Шлях | Auth | Опис |
|---|---|---|---|
| `GET` | `/api/payments` | 🔒 |  |
| `POST` | `/api/payments` |  |  |
| `POST` | `/api/payments/import` |  |  |
| `PATCH` | `/api/payments/import/lines/{lineId}` |  |  |
| `PATCH` | `/api/payments/import/lines/{lineId}/ignore` |  |  |
| `POST` | `/api/payments/import/preview` |  |  |
| `GET` | `/api/payments/import/unmatched` |  |  |
| `POST` | `/api/payments/online/intent` | 🔒 |  |
| `GET` | `/api/payments/online/orders/{orderId}` | 🔒 |  |
| `POST` | `/api/payments/online/sandbox-complete` | 🔒 |  |
| `GET` | `/api/payments/online/status` |  |  |
| `POST` | `/api/payments/online/webhook` |  |  |
| `GET` | `/api/payments/preview/allocation` |  |  |
| `GET` | `/api/payments/reports/debtors` | 🔒 |  |
| `GET` | `/api/payments/{id}` |  |  |
| `PATCH` | `/api/payments/{id}/void` |  |  |

## reminders

| Метод | Шлях | Auth | Опис |
|---|---|---|---|
| `GET` | `/api/reminders` | 🔒 |  |
| `POST` | `/api/reminders` | 🔒 |  |
| `POST` | `/api/reminders/notify-debtors` | 🔒 |  |
| `POST` | `/api/reminders/process` | 🔒 |  |
| `DELETE` | `/api/reminders/{id}` | 🔒 |  |

## roles

| Метод | Шлях | Auth | Опис |
|---|---|---|---|
| `GET` | `/api/roles` | 🔒 |  |
| `POST` | `/api/roles` | 🔒 |  |
| `PATCH` | `/api/roles/{code}` | 🔒 |  |
| `DELETE` | `/api/roles/{code}` | 🔒 |  |

## setup

| Метод | Шлях | Auth | Опис |
|---|---|---|---|
| `POST` | `/api/setup/apartments` | 🔒 |  |
| `POST` | `/api/setup/bank` | 🔒 |  |
| `POST` | `/api/setup/building` | 🔒 |  |
| `POST` | `/api/setup/complete` | 🔒 |  |
| `GET` | `/api/setup/status` | 🔒 |  |
| `POST` | `/api/setup/users` | 🔒 |  |

## sms

| Метод | Шлях | Auth | Опис |
|---|---|---|---|
| `POST` | `/api/sms/otp/send` |  |  |
| `POST` | `/api/sms/otp/verify` |  |  |
| `GET` | `/api/sms/status` |  |  |
| `POST` | `/api/sms/test` | 🔒 |  |

## tenants

| Метод | Шлях | Auth | Опис |
|---|---|---|---|
| `GET` | `/api/tenants` | 🔒 |  |
| `POST` | `/api/tenants` | 🔒 |  |
| `GET` | `/api/tenants/{id}` | 🔒 |  |
| `PATCH` | `/api/tenants/{id}` | 🔒 |  |
| `DELETE` | `/api/tenants/{id}` | 🔒 |  |
| `GET` | `/api/tenants/{id}/delete-check` | 🔒 |  |

## transparency

| Метод | Шлях | Auth | Опис |
|---|---|---|---|
| `GET` | `/api/transparency/dashboard` | 🔒 |  |
| `GET` | `/api/transparency/debtors` | 🔒 |  |

## users

| Метод | Шлях | Auth | Опис |
|---|---|---|---|
| `GET` | `/api/users` | 🔒 |  |
| `POST` | `/api/users` | 🔒 |  |
| `PATCH` | `/api/users/{id}` | 🔒 |  |
| `POST` | `/api/users/{id}/apartments/{apartmentId}` | 🔒 |  |
| `DELETE` | `/api/users/{id}/apartments/{apartmentId}` | 🔒 |  |
| `PATCH` | `/api/users/{id}/block` | 🔒 |  |
