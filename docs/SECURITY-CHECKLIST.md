# Production security checklist («Мій дім»)

Use before exposing the instance to the internet (200–300 users, low concurrency).

## Secrets

- [ ] `JWT_SECRET` — random ≥ 32 bytes (64+ hex chars recommended)
- [ ] `POSTGRES_PASSWORD` — strong, unique
- [ ] `S3_SECRET_KEY` / MinIO root password — not defaults
- [ ] `ONLINE_PAYMENTS_SECRET` if online pay enabled
- [ ] `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` for Web Push
- [ ] `SUPER_ADMIN_PASSWORD` changed after first bootstrap; remove from long-lived env if possible
- [ ] `COOKIE_SECURE=true` behind HTTPS
- [ ] Optional `TOTP_ENCRYPTION_KEY` for TOTP-at-rest

## Do not

- [ ] Do **not** run `prisma/seed.ts` with demo passwords in production
- [ ] Do **not** publish Postgres/Redis/MinIO ports to the public internet
- [ ] Do **not** leave MinIO console (`:9001`) on a public interface
- [ ] Do **not** rely on browser → MinIO `:9000` (use same-origin `/api/files/download` only)
- [ ] Do **not** enable Swagger (`SWAGGER_ENABLED=true`) on a public host without VPN
- [ ] Redis is optional; leave `REDIS_URL=none` unless you intentionally run profile `redis`

## App config

- [ ] `NODE_ENV=production`
- [ ] `CORS_ORIGIN=https://your-domain`
- [ ] `APP_URL=https://your-domain` (password reset links)
- [ ] SMTP configured (registration, reset, accruals)
- [ ] TLS certs in `infra/certs` for prod compose
- [ ] Registration invite code set in Settings (recommended)
- [ ] Finance users enroll 2FA (`REQUIRE_FINANCE_2FA` default on)
- [ ] Dual-approval threshold for large expenses if board wants it

## Nginx / network

- [ ] Body limits: API 25m, backups 512m (shipped configs)
- [ ] Security headers present (HSTS on TLS vhost)
- [ ] Firewall: only 80/443 public
- [ ] **KeenDNS / laptop host:** do **not** port-forward `5432`, `9000`, `9001`, `3001` — only nginx `WEB_PORT` / 80 / 443
- [ ] Windows native: see [KEENDNS-WINDOWS.md](./KEENDNS-WINDOWS.md); prefer `npm run backup:native` + offsite copy

## Backups

- [ ] Worker running (slim module + inline cron: reminders / SLA / daily+weekly backups)
- [ ] Restore drill once per quarter
- [ ] Full instance backup download and upload are restricted strictly to `super_admin`
- [ ] In-app backup creation marks `partial` status if MinIO file export encounters errors

## Application & Multi-tenant Integrity

- [ ] JWT strategy enforces `typ === 'access'` and validates non-revoked session `sid` on every request
- [ ] 2FA temporary tokens (`typ: '2fa'`) cannot be used as Bearer tokens
- [ ] Online payment webhooks verify cryptographic signatures (LiqPay canonical SHA1 / WayForPay HMAC)
- [ ] Online payment webhooks use DB-level mutex locking to prevent duplicate payment processing
- [ ] Resident endpoints enforce apartment link ownership; cross-tenant apartment, request, and transparency access blocked
- [ ] Accounting periods enforce closing checklist before locking; expenses in locked periods cannot be approved
- [ ] Identity provider integration trusts only verified IdP claims (no client phone fallback); mock identity disabled in prod

## After deploy smoke test

- [ ] `GET /api/health` → `{ status: "ok" }` (no component leak)
- [ ] Login + refresh cookie works over HTTPS
- [ ] Resident: account, request, meters
- [ ] Dispatcher: SLA queue
- [ ] Accountant: expense / import (with 2FA)
- [ ] Password reset email arrives
