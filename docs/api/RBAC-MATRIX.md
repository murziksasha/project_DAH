# «Мій дім» — RBAC matrix

> Згенеровано з метаданих контролерів (`npm run openapi:export -w @dah/api`). Не редагуйте вручну.
> `jwt` без ролей/permissions = будь-який автентифікований користувач (обмеження — у сервісі/tenant-scope).

Endpoints: **268**; лише JWT: **65**; розбіжностей Roles↔Permissions: **0**.

## Розбіжності @Roles ↔ @RequirePermissions (@dah/shared)

Ролі, яким permission дозволяє доступ, але @Roles на endpoint їх не містить (діє суворіше з двох).

Немає.

## Лише JWT (без @Roles/@RequirePermissions)

Доступні будь-якій автентифікованій ролі; доступ обмежує сервіс (власник/квартира/tenant-scope).

| Метод | Шлях | Handler |
|---|---|---|
| `GET` | `/api/accruals/lines/:lineId/receipt` | AccrualsController.receipt |
| `GET` | `/api/accruals/my-account` | AccrualsController.myAccount |
| `POST` | `/api/auth/2fa/disable` | AuthController.disable2fa |
| `POST` | `/api/auth/2fa/enable` | AuthController.enable2fa |
| `POST` | `/api/auth/2fa/setup` | AuthController.setup2fa |
| `GET` | `/api/auth/2fa/status` | AuthController.twoFaStatus |
| `POST` | `/api/auth/change-password` | AuthController.changePassword |
| `PATCH` | `/api/auth/email-notify` | AuthController.emailNotify |
| `POST` | `/api/auth/logout` | AuthController.logout |
| `POST` | `/api/auth/logout-all` | AuthController.logoutAll |
| `GET` | `/api/auth/me` | AuthController.me |
| `GET` | `/api/auth/memberships` | AuthController.listMemberships |
| `POST` | `/api/auth/onboarding/complete` | AuthController.completeOnboarding |
| `GET` | `/api/auth/profile` | AuthController.profile |
| `PATCH` | `/api/auth/profile` | AuthController.updateProfile |
| `POST` | `/api/auth/select-tenant` | AuthController.selectTenant |
| `GET` | `/api/auth/sessions` | AuthController.listSessions |
| `DELETE` | `/api/auth/sessions/:id` | AuthController.revokeSession |
| `GET` | `/api/building` | BuildingController.getBuilding |
| `GET` | `/api/building/apartments` | BuildingController.listApartments |
| `GET` | `/api/building/apartments/:id` | BuildingController.getApartment |
| `GET` | `/api/building/by/:id` | BuildingController.getBuildingById |
| `GET` | `/api/building/document-templates` | BuildingController.getDocumentTemplates |
| `GET` | `/api/building/list` | BuildingController.listBuildings |
| `GET` | `/api/building/settings` | BuildingController.getSettings |
| `GET` | `/api/communications/announcements` | CommunicationsController.listAnnouncements |
| `PATCH` | `/api/communications/announcements/:id/read` | CommunicationsController.markAnnouncementRead |
| `PATCH` | `/api/communications/announcements/read-all` | CommunicationsController.markAllAnnouncementsRead |
| `GET` | `/api/communications/announcements/unread-count` | CommunicationsController.unreadAnnouncementCount |
| `GET` | `/api/communications/polls` | CommunicationsController.listPolls |
| `GET` | `/api/communications/polls/:id` | CommunicationsController.getPoll |
| `GET` | `/api/communications/requests` | CommunicationsController.listRequests |
| `POST` | `/api/communications/requests` | CommunicationsController.createRequest |
| `GET` | `/api/copilot/status` | CopilotController.status |
| `GET` | `/api/documents/public` | DocumentsController.listPublic |
| `POST` | `/api/kep/meetings/:meetingId/sign` | KepController.signMeeting |
| `GET` | `/api/kep/sessions/:id` | KepController.getSession |
| `POST` | `/api/kep/sessions/:id/complete-auth` | KepController.completeAuth |
| `GET` | `/api/meetings` | MeetingsController.list |
| `GET` | `/api/meetings/:id` | MeetingsController.get |
| `POST` | `/api/meetings/:id/agenda/:agendaItemId/vote` | MeetingsController.vote |
| `POST` | `/api/meetings/:id/register` | MeetingsController.register |
| `POST` | `/api/meetings/:id/sign` | MeetingsController.sign |
| `GET` | `/api/messenger/peers` | MessengerController.listPeers |
| `GET` | `/api/messenger/threads` | MessengerController.listThreads |
| `GET` | `/api/messenger/threads/:id/messages` | MessengerController.messages |
| `POST` | `/api/messenger/threads/:id/messages` | MessengerController.post |
| `POST` | `/api/messenger/threads/board` | MessengerController.ensureBoard |
| `POST` | `/api/messenger/threads/building` | MessengerController.ensureBuilding |
| `POST` | `/api/messenger/threads/direct` | MessengerController.createDirect |
| `GET` | `/api/meters` | MetersController.listBuilding |
| `POST` | `/api/meters/:id/readings/self` | MetersController.selfReading |
| `GET` | `/api/meters/apartment/:apartmentId` | MetersController.listApartment |
| `GET` | `/api/notifications/inbox` | NotificationsController.inbox |
| `PATCH` | `/api/notifications/inbox/:id/read` | NotificationsController.markOneRead |
| `PATCH` | `/api/notifications/inbox/read` | NotificationsController.markAllRead |
| `DELETE` | `/api/notifications/subscribe` | NotificationsController.unsubscribe |
| `POST` | `/api/notifications/subscribe` | NotificationsController.subscribe |
| `GET` | `/api/payments` | PaymentsController.list |
| `GET` | `/api/payments/:id` | PaymentsController.getOne |
| `POST` | `/api/payments/online/intent` | PaymentsController.createOnlineIntent |
| `GET` | `/api/payments/online/orders/:orderId` | PaymentsController.onlineOrder |
| `POST` | `/api/payments/online/sandbox-complete` | PaymentsController.sandboxComplete |
| `GET` | `/api/transparency/dashboard` | TransparencyController.dashboard |
| `GET` | `/api/transparency/debtors` | TransparencyController.debtors |

## Повна матриця

| Метод | Шлях | Auth | @Roles | @RequirePermissions | Ефективно (хто проходить guard-и) |
|---|---|---|---|---|---|
| `POST` | `/api/accounting/adjustments` | jwt | — | finance_admin | accountant, chairman |
| `GET` | `/api/accounting/ap-aging` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `GET` | `/api/accounting/apartments/:apartmentId/statement` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `GET` | `/api/accounting/ar-aging` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `GET` | `/api/accounting/bank-gl-balance` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `GET` | `/api/accounting/bank-reconciliations` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `POST` | `/api/accounting/bank-reconciliations` | jwt | — | manage_finance | accountant, board, chairman |
| `POST` | `/api/accounting/bank-reconciliations/:id/close` | jwt | — | manage_finance | accountant, board, chairman |
| `GET` | `/api/accounting/budget/plan-fact-encumbrance` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `GET` | `/api/accounting/cash-book` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `GET` | `/api/accounting/coa-export-map` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `GET` | `/api/accounting/overview` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `GET` | `/api/accounting/owner-change-policy` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `POST` | `/api/accounting/periods/close-snapshot` | jwt | — | manage_finance | accountant, board, chairman |
| `GET` | `/api/accounting/periods/close-snapshots` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `GET` | `/api/accounting/supplier-invoices` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `POST` | `/api/accounting/supplier-invoices` | jwt | — | manage_finance | accountant, board, chairman |
| `POST` | `/api/accounting/supplier-invoices/:id/approve` | jwt | — | manage_finance | accountant, board, chairman |
| `POST` | `/api/accounting/supplier-invoices/pay` | jwt | — | manage_finance | accountant, board, chairman |
| `GET` | `/api/accounting/tariffs` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `POST` | `/api/accounting/tariffs` | jwt | — | manage_finance | accountant, board, chairman |
| `PATCH` | `/api/accounting/tariffs/:id` | jwt | — | manage_finance | accountant, board, chairman |
| `POST` | `/api/accounting/tariffs/run` | jwt | — | manage_finance | accountant, board, chairman |
| `GET` | `/api/accounting/write-offs` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `POST` | `/api/accounting/write-offs` | jwt | — | manage_finance | accountant, board, chairman |
| `POST` | `/api/accounting/write-offs/:id/approve` | jwt | — | manage_finance | accountant, board, chairman |
| `POST` | `/api/accounting/year-end` | jwt | — | finance_admin | accountant, chairman |
| `GET` | `/api/accruals` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `POST` | `/api/accruals` | jwt | — | manage_finance | accountant, board, chairman |
| `GET` | `/api/accruals/:id` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `GET` | `/api/accruals/:id/receipts.pdf` | jwt | accountant, auditor, board, chairman | — | accountant, auditor, board, chairman |
| `GET` | `/api/accruals/:id/receipts.zip` | jwt | accountant, auditor, board, chairman | — | accountant, auditor, board, chairman |
| `POST` | `/api/accruals/:id/reverse` | jwt | — | manage_finance | accountant, board, chairman |
| `GET` | `/api/accruals/apartments/:apartmentId/account` | jwt | accountant, auditor, board, chairman | — | accountant, auditor, board, chairman |
| `GET` | `/api/accruals/apartments/:apartmentId/statement.xlsx` | jwt | accountant, auditor, board, chairman, resident | — | accountant, auditor, board, chairman, resident |
| `POST` | `/api/accruals/lines/:lineId/credit-note` | jwt | — | manage_finance | accountant, board, chairman |
| `GET` | `/api/accruals/lines/:lineId/receipt` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `GET` | `/api/accruals/my-account` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `POST` | `/api/accruals/preview` | jwt | — | manage_finance | accountant, board, chairman |
| `GET` | `/api/accruals/templates` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `POST` | `/api/accruals/templates` | jwt | — | manage_finance | accountant, board, chairman |
| `DELETE` | `/api/accruals/templates/:id` | jwt | — | manage_finance | accountant, board, chairman |
| `GET` | `/api/audit/logs` | jwt | auditor, chairman, super_admin | — | auditor, chairman, super_admin |
| `POST` | `/api/auth/2fa/disable` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `POST` | `/api/auth/2fa/enable` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `POST` | `/api/auth/2fa/setup` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `GET` | `/api/auth/2fa/status` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `POST` | `/api/auth/2fa/verify` | public | — | — | *public* |
| `GET` | `/api/auth/apartments` | public | — | — | *public* |
| `PATCH` | `/api/auth/approve/:id` | jwt | board, chairman | — | board, chairman |
| `POST` | `/api/auth/change-password` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `PATCH` | `/api/auth/email-notify` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `POST` | `/api/auth/login` | public | — | — | *public* |
| `POST` | `/api/auth/login/sms/request` | public | — | — | *public* |
| `POST` | `/api/auth/login/sms/verify` | public | — | — | *public* |
| `POST` | `/api/auth/logout` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `POST` | `/api/auth/logout-all` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `GET` | `/api/auth/me` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `GET` | `/api/auth/memberships` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `POST` | `/api/auth/onboarding/complete` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `POST` | `/api/auth/password/forgot` | public | — | — | *public* |
| `POST` | `/api/auth/password/reset` | public | — | — | *public* |
| `GET` | `/api/auth/pending` | jwt | board, chairman | — | board, chairman |
| `GET` | `/api/auth/profile` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `PATCH` | `/api/auth/profile` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `POST` | `/api/auth/refresh` | public | — | — | *public* |
| `POST` | `/api/auth/register` | public | — | — | *public* |
| `PATCH` | `/api/auth/reject/:id` | jwt | board, chairman | — | board, chairman |
| `POST` | `/api/auth/select-tenant` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `GET` | `/api/auth/sessions` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `DELETE` | `/api/auth/sessions/:id` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `GET` | `/api/backups` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `POST` | `/api/backups` | jwt | accountant, board, chairman, super_admin | — | accountant, board, chairman, super_admin |
| `GET` | `/api/backups/:kind/:id/download` | jwt | — | manage_setup | super_admin |
| `GET` | `/api/backups/status` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `POST` | `/api/backups/upload` | jwt | — | manage_setup | super_admin |
| `POST` | `/api/backups/weekly` | jwt | accountant, board, chairman, super_admin | — | accountant, board, chairman, super_admin |
| `GET` | `/api/building` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `PATCH` | `/api/building` | jwt | board, chairman, super_admin | — | board, chairman, super_admin |
| `GET` | `/api/building/apartments` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `POST` | `/api/building/apartments` | jwt | — | manage_building | chairman, super_admin |
| `POST` | `/api/building/apartments/:apartmentId/residents` | jwt | — | manage_building | chairman, super_admin |
| `DELETE` | `/api/building/apartments/:id` | jwt | — | manage_building | chairman, super_admin |
| `GET` | `/api/building/apartments/:id` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `PATCH` | `/api/building/apartments/:id` | jwt | — | manage_building | chairman, super_admin |
| `POST` | `/api/building/apartments/import` | jwt | — | manage_building | chairman, super_admin |
| `GET` | `/api/building/by/:id` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `POST` | `/api/building/create` | jwt | — | manage_building | chairman, super_admin |
| `GET` | `/api/building/document-templates` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `PATCH` | `/api/building/document-templates` | jwt | accountant, board, chairman, super_admin | — | accountant, board, chairman, super_admin |
| `GET` | `/api/building/list` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `GET` | `/api/building/ops-summary` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `GET` | `/api/building/portfolio` | jwt | accountant, auditor, board, chairman, dispatcher, super_admin | — | accountant, auditor, board, chairman, dispatcher, super_admin |
| `DELETE` | `/api/building/residents/:id` | jwt | — | manage_building | chairman, super_admin |
| `PATCH` | `/api/building/residents/:id` | jwt | — | manage_building | chairman, super_admin |
| `GET` | `/api/building/search` | jwt | accountant, auditor, board, chairman, dispatcher, super_admin | — | accountant, auditor, board, chairman, dispatcher, super_admin |
| `GET` | `/api/building/settings` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `PATCH` | `/api/building/settings` | jwt | board, chairman, super_admin | — | board, chairman, super_admin |
| `GET` | `/api/communications/announcements` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `POST` | `/api/communications/announcements` | jwt | — | manage_finance | accountant, board, chairman |
| `DELETE` | `/api/communications/announcements/:id` | jwt | board, chairman | — | board, chairman |
| `PATCH` | `/api/communications/announcements/:id/read` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `PATCH` | `/api/communications/announcements/read-all` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `GET` | `/api/communications/announcements/unread-count` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `GET` | `/api/communications/polls` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `POST` | `/api/communications/polls` | jwt | board, chairman | — | board, chairman |
| `GET` | `/api/communications/polls/:id` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `PATCH` | `/api/communications/polls/:id/close` | jwt | board, chairman | — | board, chairman |
| `POST` | `/api/communications/polls/:id/vote` | jwt | accountant, board, chairman, resident | — | accountant, board, chairman, resident |
| `GET` | `/api/communications/requests` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `POST` | `/api/communications/requests` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `PATCH` | `/api/communications/requests/:id` | jwt | accountant, board, chairman, crew, dispatcher | — | accountant, board, chairman, crew, dispatcher |
| `GET` | `/api/communications/requests/queue` | jwt | accountant, board, chairman, crew, dispatcher | — | accountant, board, chairman, crew, dispatcher |
| `POST` | `/api/copilot/classify-request` | jwt | — | work_requests | board, chairman, crew, dispatcher, super_admin |
| `POST` | `/api/copilot/draft-note` | jwt | board, chairman, super_admin | — | board, chairman, super_admin |
| `POST` | `/api/copilot/match-hint` | jwt | accountant, board, chairman, super_admin | — | accountant, board, chairman, super_admin |
| `GET` | `/api/copilot/status` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `GET` | `/api/documents` | jwt | — | manage_finance | accountant, board, chairman |
| `POST` | `/api/documents` | jwt | — | manage_finance | accountant, board, chairman |
| `DELETE` | `/api/documents/:id` | jwt | — | finance_admin | accountant, chairman |
| `PATCH` | `/api/documents/:id/visibility` | jwt | — | manage_finance | accountant, board, chairman |
| `GET` | `/api/documents/public` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `GET` | `/api/files/download` | public | — | — | *public* |
| `POST` | `/api/files/upload` | jwt | accountant, board, chairman, crew, dispatcher, resident | — | accountant, board, chairman, crew, dispatcher, resident |
| `GET` | `/api/finance/bank-accounts` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `POST` | `/api/finance/bank-accounts` | jwt | — | finance_admin | accountant, chairman |
| `DELETE` | `/api/finance/bank-accounts/:id` | jwt | — | finance_admin | accountant, chairman |
| `PATCH` | `/api/finance/bank-accounts/:id` | jwt | — | finance_admin | accountant, chairman |
| `GET` | `/api/finance/budget` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `POST` | `/api/finance/budget` | jwt | — | manage_finance | accountant, board, chairman |
| `DELETE` | `/api/finance/budget/:id` | jwt | — | manage_finance | accountant, board, chairman |
| `PATCH` | `/api/finance/budget/:id` | jwt | — | manage_finance | accountant, board, chairman |
| `GET` | `/api/finance/budget/plan-fact` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `GET` | `/api/finance/categories` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `POST` | `/api/finance/categories` | jwt | — | manage_finance | accountant, board, chairman |
| `DELETE` | `/api/finance/categories/:id` | jwt | — | finance_admin | accountant, chairman |
| `PATCH` | `/api/finance/categories/:id` | jwt | — | manage_finance | accountant, board, chairman |
| `GET` | `/api/finance/expenses` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `POST` | `/api/finance/expenses` | jwt | — | manage_finance | accountant, board, chairman |
| `GET` | `/api/finance/expenses/:id` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `POST` | `/api/finance/expenses/:id/approve` | jwt | — | manage_finance | accountant, board, chairman |
| `PATCH` | `/api/finance/expenses/:id/void` | jwt | — | finance_admin | accountant, chairman |
| `GET` | `/api/finance/funds` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `POST` | `/api/finance/funds` | jwt | — | manage_finance | accountant, board, chairman |
| `PATCH` | `/api/finance/funds/:id` | jwt | — | finance_admin | accountant, chairman |
| `GET` | `/api/finance/periods` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `PATCH` | `/api/finance/periods` | jwt | accountant, board, chairman, super_admin | — | accountant, board, chairman, super_admin |
| `GET` | `/api/finance/periods/checklist` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `GET` | `/api/finance/reports/board.pdf` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `GET` | `/api/finance/reports/cash-flow` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `GET` | `/api/finance/reports/expenses-summary` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `GET` | `/api/finance/reports/export-pack.zip` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `GET` | `/api/finance/sot-status` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `GET` | `/api/finance/suppliers` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `POST` | `/api/finance/suppliers` | jwt | — | manage_finance | accountant, board, chairman |
| `PATCH` | `/api/finance/suppliers/:id` | jwt | — | manage_finance | accountant, board, chairman |
| `GET` | `/api/finance/transfers` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `POST` | `/api/finance/transfers` | jwt | — | manage_finance | accountant, board, chairman |
| `PATCH` | `/api/finance/transfers/:id/void` | jwt | — | finance_admin | accountant, chairman |
| `GET` | `/api/health` | public | — | — | *public* |
| `GET` | `/api/health/details` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `GET` | `/api/health/live` | public | — | — | *public* |
| `GET` | `/api/health/ready` | public | — | — | *public* |
| `POST` | `/api/identity/authorize` | public | — | — | *public* |
| `POST` | `/api/identity/callback` | public | — | — | *public* |
| `GET` | `/api/identity/mock/authorize` | public | — | — | *public* |
| `GET` | `/api/identity/status` | public | — | — | *public* |
| `GET` | `/api/journal` | jwt | accountant, auditor, board, chairman, super_admin | — | accountant, auditor, board, chairman, super_admin |
| `GET` | `/api/journal/:id` | jwt | accountant, auditor, board, chairman, super_admin | — | accountant, auditor, board, chairman, super_admin |
| `GET` | `/api/journal/account-card` | jwt | accountant, auditor, board, chairman, super_admin | — | accountant, auditor, board, chairman, super_admin |
| `GET` | `/api/journal/coa` | jwt | accountant, auditor, board, chairman, super_admin | — | accountant, auditor, board, chairman, super_admin |
| `PATCH` | `/api/journal/coa/:id/external-code` | jwt | accountant, chairman, super_admin | — | accountant, chairman, super_admin |
| `POST` | `/api/journal/coa/ensure-defaults` | jwt | super_admin | — | super_admin |
| `GET` | `/api/journal/fund-balances` | jwt | accountant, auditor, board, chairman, super_admin | — | accountant, auditor, board, chairman, super_admin |
| `GET` | `/api/journal/reconcile` | jwt | accountant, auditor, board, chairman, super_admin | — | accountant, auditor, board, chairman, super_admin |
| `GET` | `/api/journal/shadow-compare` | jwt | accountant, auditor, board, chairman, super_admin | — | accountant, auditor, board, chairman, super_admin |
| `POST` | `/api/journal/shadow-runs` | jwt | accountant, chairman, super_admin | — | accountant, chairman, super_admin |
| `POST` | `/api/journal/sot` | jwt | accountant, chairman, super_admin | — | accountant, chairman, super_admin |
| `GET` | `/api/journal/sot-readiness` | jwt | accountant, auditor, board, chairman, super_admin | — | accountant, auditor, board, chairman, super_admin |
| `GET` | `/api/journal/trial-balance` | jwt | accountant, auditor, board, chairman, super_admin | — | accountant, auditor, board, chairman, super_admin |
| `POST` | `/api/kep/meetings/:meetingId/sign` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `GET` | `/api/kep/mock/authorize` | public | — | — | *public* |
| `GET` | `/api/kep/sessions/:id` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `POST` | `/api/kep/sessions/:id/complete` | public | — | — | *public* |
| `POST` | `/api/kep/sessions/:id/complete-auth` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `GET` | `/api/kep/status` | public | — | — | *public* |
| `POST` | `/api/kep/webhook` | public | — | — | *public* |
| `GET` | `/api/mail/logs` | jwt | board, chairman, super_admin | — | board, chairman, super_admin |
| `GET` | `/api/mail/status` | jwt | board, chairman, super_admin | — | board, chairman, super_admin |
| `POST` | `/api/mail/test` | jwt | board, chairman, super_admin | — | board, chairman, super_admin |
| `GET` | `/api/meetings` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `POST` | `/api/meetings` | jwt | board, chairman, super_admin | — | board, chairman, super_admin |
| `GET` | `/api/meetings/:id` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `POST` | `/api/meetings/:id/agenda/:agendaItemId/vote` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `POST` | `/api/meetings/:id/protocol` | jwt | board, chairman, super_admin | — | board, chairman, super_admin |
| `GET` | `/api/meetings/:id/protocol.pdf` | jwt | auditor, board, chairman, super_admin | — | auditor, board, chairman, super_admin |
| `POST` | `/api/meetings/:id/register` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `POST` | `/api/meetings/:id/sign` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `PATCH` | `/api/meetings/:id/status` | jwt | board, chairman, super_admin | — | board, chairman, super_admin |
| `GET` | `/api/messenger/peers` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `GET` | `/api/messenger/threads` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `GET` | `/api/messenger/threads/:id/messages` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `POST` | `/api/messenger/threads/:id/messages` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `POST` | `/api/messenger/threads/board` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `POST` | `/api/messenger/threads/building` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `POST` | `/api/messenger/threads/direct` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `GET` | `/api/meters` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `POST` | `/api/meters` | jwt | accountant, board, chairman, super_admin | — | accountant, board, chairman, super_admin |
| `PATCH` | `/api/meters/:id/deactivate` | jwt | accountant, board, chairman, super_admin | — | accountant, board, chairman, super_admin |
| `POST` | `/api/meters/:id/readings` | jwt | accountant, board, chairman, super_admin | — | accountant, board, chairman, super_admin |
| `POST` | `/api/meters/:id/readings/self` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `GET` | `/api/meters/apartment/:apartmentId` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `GET` | `/api/metrics` | public | — | — | *public* |
| `GET` | `/api/notifications/inbox` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `PATCH` | `/api/notifications/inbox/:id/read` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `PATCH` | `/api/notifications/inbox/read` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `DELETE` | `/api/notifications/subscribe` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `POST` | `/api/notifications/subscribe` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `GET` | `/api/notifications/vapid-public-key` | public | — | — | *public* |
| `GET` | `/api/payments` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `POST` | `/api/payments` | jwt | — | manage_finance | accountant, board, chairman |
| `GET` | `/api/payments/:id` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `PATCH` | `/api/payments/:id/void` | jwt | — | finance_admin | accountant, chairman |
| `POST` | `/api/payments/import` | jwt | — | manage_finance | accountant, board, chairman |
| `PATCH` | `/api/payments/import/lines/:lineId` | jwt | — | manage_finance | accountant, board, chairman |
| `PATCH` | `/api/payments/import/lines/:lineId/ignore` | jwt | — | manage_finance | accountant, board, chairman |
| `POST` | `/api/payments/import/preview` | jwt | — | manage_finance | accountant, board, chairman |
| `GET` | `/api/payments/import/unmatched` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `POST` | `/api/payments/online/intent` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `GET` | `/api/payments/online/orders/:orderId` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `POST` | `/api/payments/online/sandbox-complete` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `GET` | `/api/payments/online/status` | public | — | — | *public* |
| `POST` | `/api/payments/online/webhook` | public | — | — | *public* |
| `GET` | `/api/payments/preview/allocation` | jwt | — | manage_finance | accountant, board, chairman |
| `GET` | `/api/payments/reports/debtors` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `GET` | `/api/reminders` | jwt | — | read_finance | accountant, auditor, board, chairman, super_admin |
| `POST` | `/api/reminders` | jwt | — | manage_finance | accountant, board, chairman |
| `DELETE` | `/api/reminders/:id` | jwt | — | manage_finance | accountant, board, chairman |
| `POST` | `/api/reminders/notify-debtors` | jwt | — | manage_finance | accountant, board, chairman |
| `POST` | `/api/reminders/process` | jwt | accountant, board, chairman, super_admin | — | accountant, board, chairman, super_admin |
| `GET` | `/api/roles` | jwt | — | manage_users | chairman, super_admin |
| `POST` | `/api/roles` | jwt | — | manage_setup | super_admin |
| `DELETE` | `/api/roles/:code` | jwt | — | manage_setup | super_admin |
| `PATCH` | `/api/roles/:code` | jwt | — | manage_setup | super_admin |
| `POST` | `/api/setup/apartments` | jwt | — | manage_setup | super_admin |
| `POST` | `/api/setup/bank` | jwt | — | manage_setup | super_admin |
| `POST` | `/api/setup/building` | jwt | — | manage_setup | super_admin |
| `POST` | `/api/setup/complete` | jwt | — | manage_setup | super_admin |
| `GET` | `/api/setup/status` | jwt | — | manage_setup | super_admin |
| `POST` | `/api/setup/users` | jwt | — | manage_setup | super_admin |
| `POST` | `/api/sms/otp/send` | public | — | — | *public* |
| `POST` | `/api/sms/otp/verify` | public | — | — | *public* |
| `GET` | `/api/sms/status` | public | — | — | *public* |
| `POST` | `/api/sms/test` | jwt | — | manage_settings | chairman, super_admin |
| `GET` | `/api/tenants` | jwt | — | manage_setup | super_admin |
| `POST` | `/api/tenants` | jwt | — | manage_setup | super_admin |
| `DELETE` | `/api/tenants/:id` | jwt | — | manage_setup | super_admin |
| `GET` | `/api/tenants/:id` | jwt | — | manage_setup | super_admin |
| `PATCH` | `/api/tenants/:id` | jwt | — | manage_setup | super_admin |
| `GET` | `/api/tenants/:id/delete-check` | jwt | — | manage_setup | super_admin |
| `GET` | `/api/transparency/dashboard` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `GET` | `/api/transparency/debtors` | jwt | — | — | accountant, auditor, board, chairman, crew, dispatcher, resident, super_admin |
| `GET` | `/api/users` | jwt | — | manage_users | chairman, super_admin |
| `POST` | `/api/users` | jwt | — | manage_setup | super_admin |
| `PATCH` | `/api/users/:id` | jwt | — | manage_setup | super_admin |
| `DELETE` | `/api/users/:id/apartments/:apartmentId` | jwt | — | manage_setup | super_admin |
| `POST` | `/api/users/:id/apartments/:apartmentId` | jwt | — | manage_setup | super_admin |
| `PATCH` | `/api/users/:id/block` | jwt | — | manage_users | chairman, super_admin |
