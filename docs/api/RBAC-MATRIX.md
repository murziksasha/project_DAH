# «Мій дім» — RBAC matrix

> Згенеровано з метаданих контролерів (`npm run openapi:export -w @dah/api`). Не редагуйте вручну.
> `jwt` без ролей/permissions = будь-який автентифікований користувач (обмеження — у сервісі/tenant-scope).

Endpoints: **267**; лише JWT: **65**; розбіжностей Roles↔Permissions: **4**.

## Розбіжності @Roles ↔ @RequirePermissions (@dah/shared)

Ролі, яким permission дозволяє доступ, але @Roles на endpoint їх не містить (діє суворіше з двох).

| Метод | Шлях | Деталі |
|---|---|---|
| `POST` | `/api/accounting/adjustments` | @Roles без: board |
| `POST` | `/api/accounting/write-offs/:id/approve` | @Roles без: board |
| `POST` | `/api/accounting/year-end` | @Roles без: board |
| `PATCH` | `/api/finance/transfers/:id/void` | @Roles без: board |

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

| Метод | Шлях | Auth | @Roles | @RequirePermissions |
|---|---|---|---|---|
| `POST` | `/api/accounting/adjustments` | jwt | accountant, chairman, super_admin | manage_finance |
| `GET` | `/api/accounting/ap-aging` | jwt | accountant, auditor, board, chairman, super_admin | read_finance |
| `GET` | `/api/accounting/apartments/:apartmentId/statement` | jwt | accountant, auditor, board, chairman, super_admin | read_finance |
| `GET` | `/api/accounting/ar-aging` | jwt | accountant, auditor, board, chairman, super_admin | read_finance |
| `GET` | `/api/accounting/bank-gl-balance` | jwt | accountant, auditor, board, chairman, super_admin | read_finance |
| `GET` | `/api/accounting/bank-reconciliations` | jwt | accountant, auditor, board, chairman, super_admin | read_finance |
| `POST` | `/api/accounting/bank-reconciliations` | jwt | accountant, board, chairman | manage_finance |
| `POST` | `/api/accounting/bank-reconciliations/:id/close` | jwt | accountant, board, chairman | manage_finance |
| `GET` | `/api/accounting/budget/plan-fact-encumbrance` | jwt | accountant, auditor, board, chairman, super_admin | read_finance |
| `GET` | `/api/accounting/cash-book` | jwt | accountant, auditor, board, chairman, super_admin | read_finance |
| `GET` | `/api/accounting/coa-export-map` | jwt | accountant, auditor, board, chairman, super_admin | read_finance |
| `GET` | `/api/accounting/overview` | jwt | accountant, auditor, board, chairman, super_admin | read_finance |
| `GET` | `/api/accounting/owner-change-policy` | jwt | accountant, auditor, board, chairman, super_admin | read_finance |
| `POST` | `/api/accounting/periods/close-snapshot` | jwt | accountant, board, chairman | manage_finance |
| `GET` | `/api/accounting/periods/close-snapshots` | jwt | accountant, auditor, board, chairman, super_admin | read_finance |
| `GET` | `/api/accounting/supplier-invoices` | jwt | accountant, auditor, board, chairman, super_admin | read_finance |
| `POST` | `/api/accounting/supplier-invoices` | jwt | accountant, board, chairman | manage_finance |
| `POST` | `/api/accounting/supplier-invoices/:id/approve` | jwt | accountant, board, chairman | manage_finance |
| `POST` | `/api/accounting/supplier-invoices/pay` | jwt | accountant, board, chairman | manage_finance |
| `GET` | `/api/accounting/tariffs` | jwt | accountant, auditor, board, chairman, super_admin | read_finance |
| `POST` | `/api/accounting/tariffs` | jwt | accountant, board, chairman | manage_finance |
| `PATCH` | `/api/accounting/tariffs/:id` | jwt | accountant, board, chairman | manage_finance |
| `POST` | `/api/accounting/tariffs/run` | jwt | accountant, board, chairman | manage_finance |
| `GET` | `/api/accounting/write-offs` | jwt | accountant, auditor, board, chairman, super_admin | read_finance |
| `POST` | `/api/accounting/write-offs` | jwt | accountant, board, chairman | manage_finance |
| `POST` | `/api/accounting/write-offs/:id/approve` | jwt | accountant, chairman, super_admin | manage_finance |
| `POST` | `/api/accounting/year-end` | jwt | accountant, chairman, super_admin | manage_finance |
| `GET` | `/api/accruals` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `POST` | `/api/accruals` | jwt | accountant, board, chairman | — |
| `GET` | `/api/accruals/:id` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `GET` | `/api/accruals/:id/receipts.pdf` | jwt | accountant, auditor, board, chairman | — |
| `GET` | `/api/accruals/:id/receipts.zip` | jwt | accountant, auditor, board, chairman | — |
| `POST` | `/api/accruals/:id/reverse` | jwt | accountant, board, chairman | — |
| `GET` | `/api/accruals/apartments/:apartmentId/account` | jwt | accountant, auditor, board, chairman | — |
| `GET` | `/api/accruals/apartments/:apartmentId/statement.xlsx` | jwt | accountant, auditor, board, chairman, resident | — |
| `POST` | `/api/accruals/lines/:lineId/credit-note` | jwt | accountant, board, chairman | — |
| `GET` | `/api/accruals/lines/:lineId/receipt` | jwt | — | — |
| `GET` | `/api/accruals/my-account` | jwt | — | — |
| `POST` | `/api/accruals/preview` | jwt | accountant, board, chairman | — |
| `GET` | `/api/accruals/templates` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `POST` | `/api/accruals/templates` | jwt | accountant, board, chairman | — |
| `DELETE` | `/api/accruals/templates/:id` | jwt | accountant, board, chairman | — |
| `GET` | `/api/audit/logs` | jwt | auditor, chairman, super_admin | — |
| `POST` | `/api/auth/2fa/disable` | jwt | — | — |
| `POST` | `/api/auth/2fa/enable` | jwt | — | — |
| `POST` | `/api/auth/2fa/setup` | jwt | — | — |
| `GET` | `/api/auth/2fa/status` | jwt | — | — |
| `POST` | `/api/auth/2fa/verify` | public | — | — |
| `GET` | `/api/auth/apartments` | public | — | — |
| `PATCH` | `/api/auth/approve/:id` | jwt | board, chairman | — |
| `POST` | `/api/auth/change-password` | jwt | — | — |
| `PATCH` | `/api/auth/email-notify` | jwt | — | — |
| `POST` | `/api/auth/login` | public | — | — |
| `POST` | `/api/auth/login/sms/request` | public | — | — |
| `POST` | `/api/auth/login/sms/verify` | public | — | — |
| `POST` | `/api/auth/logout` | jwt | — | — |
| `POST` | `/api/auth/logout-all` | jwt | — | — |
| `GET` | `/api/auth/me` | jwt | — | — |
| `GET` | `/api/auth/memberships` | jwt | — | — |
| `POST` | `/api/auth/onboarding/complete` | jwt | — | — |
| `POST` | `/api/auth/password/forgot` | public | — | — |
| `POST` | `/api/auth/password/reset` | public | — | — |
| `GET` | `/api/auth/pending` | jwt | board, chairman | — |
| `GET` | `/api/auth/profile` | jwt | — | — |
| `PATCH` | `/api/auth/profile` | jwt | — | — |
| `POST` | `/api/auth/refresh` | public | — | — |
| `POST` | `/api/auth/register` | public | — | — |
| `PATCH` | `/api/auth/reject/:id` | jwt | board, chairman | — |
| `POST` | `/api/auth/select-tenant` | jwt | — | — |
| `GET` | `/api/auth/sessions` | jwt | — | — |
| `DELETE` | `/api/auth/sessions/:id` | jwt | — | — |
| `GET` | `/api/backups` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `POST` | `/api/backups` | jwt | accountant, board, chairman, super_admin | — |
| `GET` | `/api/backups/:kind/:id/download` | jwt | super_admin | — |
| `GET` | `/api/backups/status` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `POST` | `/api/backups/upload` | jwt | super_admin | — |
| `POST` | `/api/backups/weekly` | jwt | accountant, board, chairman, super_admin | — |
| `GET` | `/api/building` | jwt | — | — |
| `PATCH` | `/api/building` | jwt | board, chairman, super_admin | — |
| `GET` | `/api/building/apartments` | jwt | — | — |
| `POST` | `/api/building/apartments` | jwt | chairman, super_admin | — |
| `POST` | `/api/building/apartments/:apartmentId/residents` | jwt | chairman, super_admin | — |
| `DELETE` | `/api/building/apartments/:id` | jwt | chairman, super_admin | — |
| `GET` | `/api/building/apartments/:id` | jwt | — | — |
| `PATCH` | `/api/building/apartments/:id` | jwt | chairman, super_admin | — |
| `POST` | `/api/building/apartments/import` | jwt | chairman, super_admin | — |
| `GET` | `/api/building/by/:id` | jwt | — | — |
| `POST` | `/api/building/create` | jwt | chairman, super_admin | — |
| `GET` | `/api/building/document-templates` | jwt | — | — |
| `PATCH` | `/api/building/document-templates` | jwt | accountant, board, chairman, super_admin | — |
| `GET` | `/api/building/list` | jwt | — | — |
| `GET` | `/api/building/ops-summary` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `GET` | `/api/building/portfolio` | jwt | accountant, auditor, board, chairman, dispatcher, super_admin | — |
| `DELETE` | `/api/building/residents/:id` | jwt | chairman, super_admin | — |
| `PATCH` | `/api/building/residents/:id` | jwt | chairman, super_admin | — |
| `GET` | `/api/building/search` | jwt | accountant, auditor, board, chairman, dispatcher, super_admin | — |
| `GET` | `/api/building/settings` | jwt | — | — |
| `PATCH` | `/api/building/settings` | jwt | board, chairman, super_admin | — |
| `GET` | `/api/communications/announcements` | jwt | — | — |
| `POST` | `/api/communications/announcements` | jwt | accountant, board, chairman | — |
| `DELETE` | `/api/communications/announcements/:id` | jwt | board, chairman | — |
| `PATCH` | `/api/communications/announcements/:id/read` | jwt | — | — |
| `PATCH` | `/api/communications/announcements/read-all` | jwt | — | — |
| `GET` | `/api/communications/announcements/unread-count` | jwt | — | — |
| `GET` | `/api/communications/polls` | jwt | — | — |
| `POST` | `/api/communications/polls` | jwt | board, chairman | — |
| `GET` | `/api/communications/polls/:id` | jwt | — | — |
| `PATCH` | `/api/communications/polls/:id/close` | jwt | board, chairman | — |
| `POST` | `/api/communications/polls/:id/vote` | jwt | accountant, board, chairman, resident | — |
| `GET` | `/api/communications/requests` | jwt | — | — |
| `POST` | `/api/communications/requests` | jwt | — | — |
| `PATCH` | `/api/communications/requests/:id` | jwt | accountant, board, chairman, crew, dispatcher | — |
| `GET` | `/api/communications/requests/queue` | jwt | accountant, board, chairman, crew, dispatcher | — |
| `POST` | `/api/copilot/classify-request` | jwt | board, chairman, crew, dispatcher, super_admin | — |
| `POST` | `/api/copilot/draft-note` | jwt | board, chairman, super_admin | — |
| `POST` | `/api/copilot/match-hint` | jwt | accountant, board, chairman, super_admin | — |
| `GET` | `/api/copilot/status` | jwt | — | — |
| `GET` | `/api/documents` | jwt | accountant, board, chairman | — |
| `POST` | `/api/documents` | jwt | accountant, board, chairman | — |
| `DELETE` | `/api/documents/:id` | jwt | accountant, chairman | — |
| `PATCH` | `/api/documents/:id/visibility` | jwt | accountant, board, chairman | — |
| `GET` | `/api/documents/public` | jwt | — | — |
| `GET` | `/api/files/download` | public | — | — |
| `POST` | `/api/files/upload` | jwt | accountant, board, chairman, crew, dispatcher, resident | — |
| `GET` | `/api/finance/bank-accounts` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `POST` | `/api/finance/bank-accounts` | jwt | accountant, chairman | — |
| `DELETE` | `/api/finance/bank-accounts/:id` | jwt | accountant, chairman | — |
| `PATCH` | `/api/finance/bank-accounts/:id` | jwt | accountant, chairman | — |
| `GET` | `/api/finance/budget` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `POST` | `/api/finance/budget` | jwt | accountant, board, chairman | manage_finance |
| `DELETE` | `/api/finance/budget/:id` | jwt | accountant, board, chairman | manage_finance |
| `PATCH` | `/api/finance/budget/:id` | jwt | accountant, board, chairman | manage_finance |
| `GET` | `/api/finance/budget/plan-fact` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `GET` | `/api/finance/categories` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `POST` | `/api/finance/categories` | jwt | accountant, board, chairman | — |
| `DELETE` | `/api/finance/categories/:id` | jwt | accountant, chairman | — |
| `PATCH` | `/api/finance/categories/:id` | jwt | accountant, board, chairman | — |
| `GET` | `/api/finance/expenses` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `POST` | `/api/finance/expenses` | jwt | accountant, board, chairman | manage_finance |
| `GET` | `/api/finance/expenses/:id` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `POST` | `/api/finance/expenses/:id/approve` | jwt | accountant, board, chairman | — |
| `PATCH` | `/api/finance/expenses/:id/void` | jwt | accountant, chairman | — |
| `GET` | `/api/finance/funds` | jwt | accountant, auditor, board, chairman, super_admin | read_finance |
| `POST` | `/api/finance/funds` | jwt | accountant, board, chairman | — |
| `PATCH` | `/api/finance/funds/:id` | jwt | accountant, chairman | — |
| `GET` | `/api/finance/periods` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `PATCH` | `/api/finance/periods` | jwt | accountant, board, chairman, super_admin | — |
| `GET` | `/api/finance/periods/checklist` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `GET` | `/api/finance/reports/board.pdf` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `GET` | `/api/finance/reports/cash-flow` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `GET` | `/api/finance/reports/expenses-summary` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `GET` | `/api/finance/reports/export-pack.zip` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `GET` | `/api/finance/sot-status` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `GET` | `/api/finance/suppliers` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `POST` | `/api/finance/suppliers` | jwt | accountant, board, chairman | — |
| `PATCH` | `/api/finance/suppliers/:id` | jwt | accountant, board, chairman | — |
| `GET` | `/api/finance/transfers` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `POST` | `/api/finance/transfers` | jwt | accountant, board, chairman | manage_finance |
| `PATCH` | `/api/finance/transfers/:id/void` | jwt | accountant, chairman | manage_finance |
| `GET` | `/api/health` | public | — | — |
| `GET` | `/api/health/details` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `GET` | `/api/health/live` | public | — | — |
| `GET` | `/api/health/ready` | public | — | — |
| `POST` | `/api/identity/authorize` | public | — | — |
| `POST` | `/api/identity/callback` | public | — | — |
| `GET` | `/api/identity/mock/authorize` | public | — | — |
| `GET` | `/api/identity/status` | public | — | — |
| `GET` | `/api/journal` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `GET` | `/api/journal/:id` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `GET` | `/api/journal/account-card` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `GET` | `/api/journal/coa` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `PATCH` | `/api/journal/coa/:id/external-code` | jwt | accountant, chairman, super_admin | — |
| `POST` | `/api/journal/coa/ensure-defaults` | jwt | super_admin | — |
| `GET` | `/api/journal/fund-balances` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `GET` | `/api/journal/reconcile` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `GET` | `/api/journal/shadow-compare` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `POST` | `/api/journal/shadow-runs` | jwt | accountant, chairman, super_admin | — |
| `GET` | `/api/journal/sot-readiness` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `GET` | `/api/journal/trial-balance` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `POST` | `/api/kep/meetings/:meetingId/sign` | jwt | — | — |
| `GET` | `/api/kep/mock/authorize` | public | — | — |
| `GET` | `/api/kep/sessions/:id` | jwt | — | — |
| `POST` | `/api/kep/sessions/:id/complete` | public | — | — |
| `POST` | `/api/kep/sessions/:id/complete-auth` | jwt | — | — |
| `GET` | `/api/kep/status` | public | — | — |
| `POST` | `/api/kep/webhook` | public | — | — |
| `GET` | `/api/mail/logs` | jwt | board, chairman, super_admin | — |
| `GET` | `/api/mail/status` | jwt | board, chairman, super_admin | — |
| `POST` | `/api/mail/test` | jwt | board, chairman, super_admin | — |
| `GET` | `/api/meetings` | jwt | — | — |
| `POST` | `/api/meetings` | jwt | board, chairman, super_admin | — |
| `GET` | `/api/meetings/:id` | jwt | — | — |
| `POST` | `/api/meetings/:id/agenda/:agendaItemId/vote` | jwt | — | — |
| `POST` | `/api/meetings/:id/protocol` | jwt | board, chairman, super_admin | — |
| `GET` | `/api/meetings/:id/protocol.pdf` | jwt | auditor, board, chairman, super_admin | — |
| `POST` | `/api/meetings/:id/register` | jwt | — | — |
| `POST` | `/api/meetings/:id/sign` | jwt | — | — |
| `PATCH` | `/api/meetings/:id/status` | jwt | board, chairman, super_admin | — |
| `GET` | `/api/messenger/peers` | jwt | — | — |
| `GET` | `/api/messenger/threads` | jwt | — | — |
| `GET` | `/api/messenger/threads/:id/messages` | jwt | — | — |
| `POST` | `/api/messenger/threads/:id/messages` | jwt | — | — |
| `POST` | `/api/messenger/threads/board` | jwt | — | — |
| `POST` | `/api/messenger/threads/building` | jwt | — | — |
| `POST` | `/api/messenger/threads/direct` | jwt | — | — |
| `GET` | `/api/meters` | jwt | — | — |
| `POST` | `/api/meters` | jwt | accountant, board, chairman, super_admin | — |
| `PATCH` | `/api/meters/:id/deactivate` | jwt | accountant, board, chairman, super_admin | — |
| `POST` | `/api/meters/:id/readings` | jwt | accountant, board, chairman, super_admin | — |
| `POST` | `/api/meters/:id/readings/self` | jwt | — | — |
| `GET` | `/api/meters/apartment/:apartmentId` | jwt | — | — |
| `GET` | `/api/metrics` | public | — | — |
| `GET` | `/api/notifications/inbox` | jwt | — | — |
| `PATCH` | `/api/notifications/inbox/:id/read` | jwt | — | — |
| `PATCH` | `/api/notifications/inbox/read` | jwt | — | — |
| `DELETE` | `/api/notifications/subscribe` | jwt | — | — |
| `POST` | `/api/notifications/subscribe` | jwt | — | — |
| `GET` | `/api/notifications/vapid-public-key` | public | — | — |
| `GET` | `/api/payments` | jwt | — | — |
| `POST` | `/api/payments` | jwt | accountant, board, chairman | — |
| `GET` | `/api/payments/:id` | jwt | — | — |
| `PATCH` | `/api/payments/:id/void` | jwt | accountant, chairman | — |
| `POST` | `/api/payments/import` | jwt | accountant, board, chairman | — |
| `PATCH` | `/api/payments/import/lines/:lineId` | jwt | accountant, board, chairman | — |
| `PATCH` | `/api/payments/import/lines/:lineId/ignore` | jwt | accountant, board, chairman | — |
| `POST` | `/api/payments/import/preview` | jwt | accountant, board, chairman | — |
| `GET` | `/api/payments/import/unmatched` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `POST` | `/api/payments/online/intent` | jwt | — | — |
| `GET` | `/api/payments/online/orders/:orderId` | jwt | — | — |
| `POST` | `/api/payments/online/sandbox-complete` | jwt | — | — |
| `GET` | `/api/payments/online/status` | public | — | — |
| `POST` | `/api/payments/online/webhook` | public | — | — |
| `GET` | `/api/payments/preview/allocation` | jwt | accountant, board, chairman | — |
| `GET` | `/api/payments/reports/debtors` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `GET` | `/api/reminders` | jwt | accountant, auditor, board, chairman, super_admin | — |
| `POST` | `/api/reminders` | jwt | accountant, board, chairman | — |
| `DELETE` | `/api/reminders/:id` | jwt | accountant, board, chairman | — |
| `POST` | `/api/reminders/notify-debtors` | jwt | accountant, board, chairman | — |
| `POST` | `/api/reminders/process` | jwt | accountant, board, chairman, super_admin | — |
| `GET` | `/api/roles` | jwt | chairman, super_admin | — |
| `POST` | `/api/roles` | jwt | super_admin | — |
| `DELETE` | `/api/roles/:code` | jwt | super_admin | — |
| `PATCH` | `/api/roles/:code` | jwt | super_admin | — |
| `POST` | `/api/setup/apartments` | jwt | super_admin | — |
| `POST` | `/api/setup/bank` | jwt | super_admin | — |
| `POST` | `/api/setup/building` | jwt | super_admin | — |
| `POST` | `/api/setup/complete` | jwt | super_admin | — |
| `GET` | `/api/setup/status` | jwt | super_admin | — |
| `POST` | `/api/setup/users` | jwt | super_admin | — |
| `POST` | `/api/sms/otp/send` | public | — | — |
| `POST` | `/api/sms/otp/verify` | public | — | — |
| `GET` | `/api/sms/status` | public | — | — |
| `POST` | `/api/sms/test` | jwt | chairman, super_admin | — |
| `GET` | `/api/tenants` | jwt | super_admin | — |
| `POST` | `/api/tenants` | jwt | super_admin | — |
| `DELETE` | `/api/tenants/:id` | jwt | super_admin | — |
| `GET` | `/api/tenants/:id` | jwt | super_admin | — |
| `PATCH` | `/api/tenants/:id` | jwt | super_admin | — |
| `GET` | `/api/tenants/:id/delete-check` | jwt | super_admin | — |
| `GET` | `/api/transparency/dashboard` | jwt | — | — |
| `GET` | `/api/transparency/debtors` | jwt | — | — |
| `GET` | `/api/users` | jwt | chairman, super_admin | — |
| `POST` | `/api/users` | jwt | super_admin | — |
| `PATCH` | `/api/users/:id` | jwt | super_admin | — |
| `DELETE` | `/api/users/:id/apartments/:apartmentId` | jwt | super_admin | — |
| `POST` | `/api/users/:id/apartments/:apartmentId` | jwt | super_admin | — |
| `PATCH` | `/api/users/:id/block` | jwt | chairman, super_admin | — |
