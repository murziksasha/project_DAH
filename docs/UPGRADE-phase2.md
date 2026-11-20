# Оновлення: Phase 2 (архітектура, ізоляція, ops) + roadmap

Застосовується поверх Phase 0/1 (`docs/UPGRADE-phase0-security.md`). Зворотно сумісне: нові змінні
опційні, міграції адитивні.

## 1. Міграції БД (обов'язково)

```bash
# спершу бекап!
./infra/scripts/backup.sh            # або in-app «Створити бекап»
npm run db:generate -w @dah/api
cd apps/api && npx prisma migrate deploy
```

| Міграція | Що робить | Безпечність для даних |
|---|---|---|
| `20261120090000_tenant_fk_global_coa` | FK `tenantId` → `Tenant` (ON DELETE SET NULL) для `Announcement`, `Request`, `Poll`, `Document`, `Meeting`; backfill `tenantId` з будинку / квартири / автора; на **однотенантній** інсталяції решта NULL → єдина організація; частковий unique `LedgerAccount(code) WHERE buildingId IS NULL` (L10) | осиротілі `tenantId` (на неіснуючу організацію) → NULL; якщо глобальні рахунки вже дублюються — індекс не створюється, у лог міграції пишеться NOTICE (приберіть дублікати й запустіть міграцію вручну) |
| `20261120100000_worker_job_lease` | таблиця `WorkerJob` (lease + час останнього запуску cron-задач) | нова таблиця |
| `20261120110000_journal_shadow_run` | таблиця `JournalShadowRun` (щоденний shadow-compare журналу по будинку) | нова таблиця, каскадне видалення з будинком |

Перевірка після міграції (мультитенант): записи без організації не видно персоналу —

```sql
SELECT 'Announcement', count(*) FROM "Announcement" WHERE "tenantId" IS NULL
UNION ALL SELECT 'Document', count(*) FROM "Document" WHERE "tenantId" IS NULL
UNION ALL SELECT 'Poll', count(*) FROM "Poll" WHERE "tenantId" IS NULL
UNION ALL SELECT 'Request', count(*) FROM "Request" WHERE "tenantId" IS NULL
UNION ALL SELECT 'Meeting', count(*) FROM "Meeting" WHERE "tenantId" IS NULL;
```

Якщо там не 0 — призначте організацію вручну (`UPDATE … SET "tenantId" = '<id>' WHERE …`).

## 2. Нові змінні середовища (усі опційні)

| Змінна | За замовчуванням | Призначення |
|---|---|---|
| `TENANT_AUTO_SCOPE` | `true` | автоматична tenant-ізоляція в Prisma (Building, Announcement, Request, Poll, Document, Meeting, Reminder, BankStatement). `false` — аварійний вимикач (ручні перевірки Phase 0 лишаються) |
| `AUTH_CACHE_TTL_MS` | `0` (вимкнено) | кеш автентифікованого користувача, мс. Будь-який запис у `User`/`AuthSession`/`TenantMembership`/`Tenant` очищає кеш у цьому процесі; на **інших** інстансах відкликання видно із затримкою до TTL — тримайте ≤ 30000 |
| `METRICS_TOKEN` | — | Bearer-токен для `GET /api/metrics`. Без нього в production endpoint повертає 404 |
| `LOG_FORMAT` | `text` | `json` — один JSON-об'єкт на рядок (API і worker) |
| `LOG_LEVEL` | `log` | `error` / `warn` / `log` / `debug` / `verbose` |
| `DAH_VERSION` | версія з кореневого `package.json` | перевизначити версію в `/health`, Swagger, метриках, маніфестах бекапів |
| `JOURNAL_SOT_STREAK_DAYS` | `30` | скільки днів поспіль shadow-compare має бути «ready», щоб `/journal/sot-readiness` показав `eligible` |
| `BACKUP_ENCRYPTION_PASSPHRASE_FILE` | — | файл з паролем (chmod 600) — `infra/scripts/backup.sh` шифрує дамп і файли (`openssl aes-256-cbc -pbkdf2`), `restore.sh` розшифровує |
| `MINIO_IMAGE`, `MINIO_MC_IMAGE` | `minio/minio:latest`, `minio/mc:latest` | закріпити версію MinIO (рекомендовано). Поточну версію дізнатись: `docker compose exec minio minio --version` |

`S3_ACCESS_KEY` / `S3_SECRET_KEY` у `backup.sh` / `restore.sh` більше **не мають** вбудованих значень за
замовчуванням: без них бекап файлів пропускається і бекап позначається `partial`.

## 3. Поведінка, що змінилась

- **Валідація (M10):** невідомі поля або неправильні типи в тілах (SMS-логін, скидання пароля,
  лічильники, організації, сторно/credit-note, identity, створення будинку) → **400**. Вебхуки
  провайдерів (LiqPay/WayForPay/KEP) приймаються як і раніше.
- **NULL-tenant (M8):** оголошення/документи/опитування без організації більше не видно персоналу
  організацій (раніше були «спільні»).
- **Онлайн-оплата (L12):** статус `sandbox` зараховується як оплата лише при
  `ONLINE_PAYMENTS_SANDBOX=true`.
- **Worker (M9):** задачі мають lease у БД — два worker-и не запускають ту саму задачу одночасно;
  щоденні задачі (бекап 02:00, тижневий 03:00, звірка журналу 04:00 UTC) **доганяються** після простою.
- **Пеня (M6/M9):** паралельний запуск не створює дублікатів.
- **Health:** нові `GET /api/health/live` (процес живий) і `GET /api/health/ready` (503, якщо БД недоступна).
  Selfhost-compose: `api` має healthcheck, `worker` стартує після `api: healthy`.
- **Метрики:** `GET /api/metrics` (Prometheus): `dah_http_requests_total`, `dah_http_request_duration_seconds`,
  `dah_db_up`, `dah_backup_age_seconds`, `dah_backup_partial`, `dah_worker_job_last_success_age_seconds{job}`,
  `dah_worker_job_last_failed{job}`, `dah_build_info{version}`.
- **Логи (L8):** `x-request-id` приймається лише формату `[A-Za-z0-9._:-]{8,128}`, інакше генерується новий;
  `tenantId` у логах — з JWT.
- **Бекапи (M17):** `backup.sh` завершується з помилкою, якщо Postgres недоступний (маркер не
  оновлюється); пропуск файлів → `status: partial` у маркері, `/health/details` і метриці.
- **Selfhost compose (M16):** `api`/`worker` — `user: node`, `cap_drop: ALL`, `no-new-privileges`,
  `pids_limit`; MinIO healthcheck через `mc ready` (у нових образах MinIO немає curl).
- **Гроші у web (L6):** суми завжди з 2 знаками («100,00 ₴»), округлення через `@dah/money`
  (виправлено також округлення `1.005 → 1.01` у самому пакеті).
- **Версія (L1):** усі пакети застосунку — 1.14.0; Swagger і `/health` беруть версію з кореневого `package.json`.

## 4. Нові можливості

- **OpenAPI (L2/L9):** `npm run openapi:export -w @dah/api` → `docs/api/openapi.json`,
  `docs/api/API-REFERENCE.md` (усі endpoints), `docs/api/RBAC-MATRIX.md` (ролі/permissions кожного endpoint,
  розбіжності `@Roles` ↔ `@dah/shared`). `npm run check` падає, якщо файли застарілі.
  Типи клієнта: `npm run codegen -w @dah/api-client` (`paths`, `components`, `ApiPath`).
- **Журнал як джерело правди (roadmap):** worker щодня зберігає shadow-compare кожного будинку;
  `GET /api/journal/sot-readiness?buildingId=` — серія днів поспіль без розбіжностей і `eligible`;
  `POST /api/journal/shadow-runs?buildingId=` — записати перевірку зараз. На сторінці «Журнал → Shadow»
  показано «N / 30 дн.». Перемикання (`settings.finance.journalSot`) — свідома дія адміністратора.

## 5. Відкат

Код: попередній образ / тег `phase1`. Міграції адитивні; старий код працює з новою схемою
(нові таблиці й FK йому не заважають). Відкат схеми зазвичай не потрібен; за потреби:

```sql
DROP TABLE IF EXISTS "JournalShadowRun";
DROP TABLE IF EXISTS "WorkerJob";
DROP INDEX IF EXISTS "LedgerAccount_global_code_key";
ALTER TABLE "Announcement" DROP CONSTRAINT IF EXISTS "Announcement_tenantId_fkey";
ALTER TABLE "Request"      DROP CONSTRAINT IF EXISTS "Request_tenantId_fkey";
ALTER TABLE "Poll"         DROP CONSTRAINT IF EXISTS "Poll_tenantId_fkey";
ALTER TABLE "Document"     DROP CONSTRAINT IF EXISTS "Document_tenantId_fkey";
ALTER TABLE "Meeting"      DROP CONSTRAINT IF EXISTS "Meeting_tenantId_fkey";
DELETE FROM "_prisma_migrations" WHERE migration_name IN
  ('20261120090000_tenant_fk_global_coa','20261120100000_worker_job_lease','20261120110000_journal_shadow_run');
```
