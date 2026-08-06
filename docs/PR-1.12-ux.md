# PR: v1.12 — Confirm dialogs, role dashboards, network banner

## Summary

UX polish for OSBB/UK operators (200–300 users):

1. **ConfirmDialog** for payment void (required reason) and document delete.
2. **Role-aware `/admin` home**: dispatcher SLA, accountant finance, crew my jobs, board unchanged.
3. **NetworkStatusBanner**: browser offline vs API down vs recovered (PWA-friendly).

## Test plan

- [ ] Void payment: modal + reason required
- [ ] Delete document: modal shows title
- [ ] Login dispatcher → `/admin` SLA cards, no finance errors
- [ ] Login accountant → KPIs + pending expenses
- [ ] Login chairman → board dashboard
- [ ] DevTools Offline → offline copy; Online → recovered once
- [ ] Dispatch `?filter=overdue` works from dashboard links
- [ ] `npm run test:e2e -w @dah/api` (security-smoke still green)

## Risk

Low — web-only; API contracts unchanged.
