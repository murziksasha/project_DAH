# Upgrade 0.9 → 1.0.0

## 1. Database migrations

```bash
npm install
npm run build -w @dah/shared
npm run build -w @dah/money
npm run build -w @dah/api-client
npm run db:generate -w @dah/api
npm run db:migrate -w @dah/api
```

Key migrations:
- `AuthSession`
- `JournalEntry` / `JournalLine`
- `Apartment.advanceBalance`
- Poll `voteWeight` / `quorumPercent`
- Request `dueAt` / `photoKeys`
- Meters / by_meter
- **Tenant** (default tenant backfill for existing buildings/users)

## 2. Sessions (breaking for clients)

Users must **log in again**.

| Before | After |
|--------|--------|
| refresh in `localStorage` | HttpOnly cookie `dah_refresh` |
| access long-lived | short TTL + `sessionStorage` |
| soft cookie = JWT | soft flag `dah_session=1` |

Production HTTPS:

```env
COOKIE_SECURE=true
CORS_ORIGIN=https://your-domain
```

## 3. API changes

- `GET /payments` → `{ items, total, page, limit, totalPages }`
- `POST /finance/funds` — create fund
- `GET /building/list`, `POST /building/create`
- `GET /journal`, `GET /journal/reconcile`
- `POST /payments/online/intent` (auth)
- `POST /payments/online/webhook` (public, when enabled)
- Query `buildingId` on finance/accruals/payments lists

## 4. Optional online payments

```env
ONLINE_PAYMENTS_ENABLED=true
ONLINE_PAYMENTS_SECRET=<hmac-secret>
ONLINE_PAYMENTS_PROVIDER=generic
APP_URL=https://your-domain
```

Webhook: `POST /api/payments/online/webhook` with `{ orderId, status, amount, payload, signature }`.

## 5. Verify

```bash
npm run test -w @dah/api
npm run build
curl -s http://localhost:3001/api/health
# /admin/ops → Journal reconcile
```

## 6. Backup before upgrade

```bash
npm run backup
# or
./infra/scripts/backup.sh
```
