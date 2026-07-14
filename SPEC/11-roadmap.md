# 11. Roadmap

## Завершені фази (MVP v0.1.0)

| # | Фаза | Результат |
|---|------|-----------|
| 0 | Scaffold | Monorepo, Docker, auth, seed |
| 1 | Expenses | CRUD витрат, MinIO, постачальники |
| 2 | Accruals | Нарахування, особові рахунки, PDF |
| 3 | Payments | FIFO, платежі, звіт боржників |
| 4 | Transparency | Дашборд мешканця, документи |
| 5 | Communications | Оголошення, заявки, опитування, Web Push, PWA |
| 6 | Operations | Backup, аудит, HTTPS, deploy docs |
| 7 | Testing | Jest unit/e2e, Playwright, CI |
| 8 | Documentation | Папка SPEC (цей набір документів) |

## Можливий розвиток (v0.2+)

### Пріоритет високий
- [x] `/admin/organization` — CRUD користувачів і квартир, many-to-many прив'язка
- [x] UI polish v0.1.1 — grouped nav + RBAC, light/dark, dashboard KPI, resident hero + IBAN, JWT refresh, CSV боржників, KeenDNS docs
- [x] v0.2 stage — імпорт банківської виписки CSV, reject заявок, polish `/register` + `/admin/residents`, пошук квартири в платежах
- [x] Сторінка `/register` + UI підтвердження/відхилення мешканців
- [x] Email-сповіщення (реєстрація, нарахування, платежі, оголошення, заявки, борг, тест SMTP)
- [x] Імпорт банківської виписки (CSV)
- [x] e2e finance/accruals + auth 2FA

### Пріоритет середній
- [x] Багатомовність (uk / ru) — nav/shell + toggle; settings locale
- [x] Експорт звітів (CSV; Excel/PDF — пізніше)
- [x] Нагадування (custom + debt auto + worker)
- [x] 2FA (TOTP) для admin-ролей
- [x] v0.3 — масові квитанції PDF/ZIP, особовий рахунок квартири, search, seed guard, i18n
- [x] v0.4 — історія платежів/void, void+CSV витрат, період у звітах, PDF для зборів, ops health, middleware cookie guard
- [x] v0.5 — майстер нарахувань (4 кроки), період на дашборді, фільтри історії платежів/аудиту, print CSS, Playwright admin smoke
- [x] v0.6 — категорії витрат CRUD, документи visibility/delete, довідники, ops-summary на дашборді, email боржникам, kanban заявок, save template
- [x] v0.7 — зміна пароля, push UI, фонди (залишки/IBAN), CSV квартир, безпека для мешканця
- [x] v0.8 — банківські рахунки CRUD, профіль ОСМД, auto-overdue нарахувань, landing + expense polish
- [x] v0.9 — health+DB+version, пагінація витрат, імпорт квартир CSV, delete оголошень, login ?next=

### Пріоритет низький / дослідження
- [ ] Мультитенантність (кілька ОСМД)
- [ ] Мобільні push через FCM (native wrapper)
- [ ] Інтеграція з Дія / BankID
- [ ] Паритет з комерційним DAH

## Версіонування

Рекомендована схема:
- `0.x.y` — MVP та пост-MVP покращення
- `1.0.0` — перший стабільний release для production ОСМД

При зміні API або схеми БД — оновлювати відповідні файли в `SPEC/`.