# PR: v1.11 — Security hardening + UX (200–300 users)

## Summary

Hardens self-hosted «Мій дім» for production use at OSBB/UK scale (~200–300 people, low concurrency): auth lockout & password reset, invite-based registration, messenger tenant scope, finance dual-approval + mandatory 2FA policy, upload magic-byte checks, and resident/admin UX polish (triad, notifications, global search, mobile dispatch, expense approve UI).

## Why

Board and residents handle money and personal data. Previous baseline already had JWT sessions, RBAC, and payment signatures; this release closes the highest-ROI gaps from the security audit (messenger join-any-building, open Swagger/health/apartments, unlimited upload body, no password reset, weak dual control) and makes day-to-day UX usable for seniors and accountants.

## Key changes

### Security
- Swagger off by default when `NODE_ENV=production`
- API + nginx security headers / CSP; body limits 25m / 512m backups
- Minimal public `GET /health`; full `GET /health/details` (staff JWT)
- Messenger: building membership + same-tenant peers/DMs
- Password policy, login lockout, email password reset
- TOTP encrypted at rest; finance + backup download require 2FA (env-gated)
- Registration invite code; file magic-byte validation
- Expense dual-approval threshold + second signature API
- Request `buildingId`; SLA alert worker job; backup download audit

### UX
- Resident home triad; notification bell + inbox; onboarding / 2FA banner
- Admin global search; login forgot-password; toast + request-id errors
- Dispatch mobile cards; **expenses list: approve pending + status filter**
- Settings: invite code + dual-approval threshold

### Ops / docs
- Daily backup job; `docs/SECURITY-CHECKLIST.md`; DEPLOY/CHANGELOG/SPEC
- Migration `20260804120000_security_ux_hardening`
- e2e smoke: `security-smoke.e2e-spec.ts`

## Test plan

- [ ] `npm run db:migrate -w @dah/api` (apply migration)
- [ ] `npm run test -w @dah/api` (unit)
- [ ] `npm run test:e2e -w @dah/api` (includes security smoke + finance dual-approval)
- [ ] Manual: set dual threshold in Settings → create large expense as accountant → approve as chairman in `/admin/expenses/list`
- [ ] Manual: forgot password with SMTP + `APP_URL`
- [ ] Manual: invite code on register; messenger only own building
- [ ] Prod checklist: `docs/SECURITY-CHECKLIST.md`

## Deploy notes

1. Set `APP_URL`, SMTP, strong secrets; **do not** seed demo passwords in prod.
2. Leave `SWAGGER_ENABLED` unset/false in production.
3. Finance users must enable 2FA unless `REQUIRE_FINANCE_2FA=false` (e2e only).
4. Optional: set registration invite code and expense dual-approval threshold in Settings.

## Risk / rollback

- Schema migration is additive (new columns/tables with defaults). Rollback: reverse app deploy; leave columns (safe).
- Dual-approval may leave pending expenses if threshold set high without second signer — document for board.
- Existing TOTP secrets migrate transparently (plaintext still opens until re-enable seals).

## Follow-ups in 1.11.1

- Active sessions list + revoke (`/auth/sessions`)
- Header quick search
- Expense void ConfirmDialog with reason field
- Resident security sessions panel

## Out of scope

- Full BFF cookie-only access tokens
- SaaS multi-tenant billing / subdomains
- Production Diia/BankID identity
