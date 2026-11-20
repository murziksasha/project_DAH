# Оновлення: Phase 0 (ізоляція організацій) + Phase 1 (фінанси)

## 1. Міграція БД (обов'язково)

```bash
npm run db:generate -w @dah/api
cd apps/api && npx prisma migrate deploy
```

Міграція `20261119120000_phase0_tenant_isolation_finance`:

- `tenantId` у `Reminder`, `BankStatement`, `ExpenseCategory` (з backfill);
- голосування: 1 голос / 1 учасник на **квартиру** (дублікати прибираються, лишається найновіший голос);
- унікальність нарахування `(fundId, period, title)` — наявні дублікати перейменовуються на «… (дубль N)»;
- таблиця `JournalSequence` (атомарні номери проводок) + індекси.

Перед міграцією на production зробіть бекап.

## 2. Змінні середовища (production)

Сервер **не стартує** з прикладами/слабкими секретами при `NODE_ENV=production`:

| Змінна | Вимога |
|---|---|
| `JWT_SECRET` | ≥ 32 символи, не з `.env*.example` |
| `FILE_DOWNLOAD_SECRET` | ≥ 32 символи, **відмінний** від `JWT_SECRET` (якщо не задано — похідний від JWT) |
| `TOTP_ENCRYPTION_KEY`, `S3_SECRET_KEY`, `KEP_WEBHOOK_SECRET`, пароль у `DATABASE_URL` | не placeholder (`change_me`, `REPLACE_WITH_…`, `example` тощо) |
| `KEP_ALLOW_MOCK` | за замовчуванням **вимкнено** в production; `true` — лише для демо |
| `API_HOST` (опц.) | адреса прослуховування API (Windows native: `127.0.0.1`) |
| `PDF_FONT_DIR` (опц.) | тека з DejaVuSans*.ttf для PDF |

Генерація: `openssl rand -hex 32`.

## 3. Поведінка, що змінилась

- Усі запити персоналу обмежені своєю організацією; чужі id → 404.
- `super_admin` для дій в організації передає `X-Tenant-Id`.
- `GET /accruals/:id` — лише персонал (мешканці — через свій рахунок).
- Аванс автоматично зараховується в нові нарахування. Вимкнути: налаштування будинку `autoApplyAdvance=false`.
- Бекапи для ролей організації — лише на однотенантній інсталяції.
- Windows native: MinIO слухає `127.0.0.1`, правило firewall для 3001 видаляється.
- Lint (`npm run lint`) тепер блокує CI.
