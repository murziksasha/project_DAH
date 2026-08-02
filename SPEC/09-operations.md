# 09. Експлуатація

Детальний production-гайд: [docs/DEPLOY.md](../docs/DEPLOY.md)

## Запуск

### Development
```bash
docker compose up -d
npm run dev:api
npm run dev:web
```

### Production
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Потрібні TLS-сертифікати в `infra/certs/`:
- `fullchain.pem`
- `privkey.pem`

## Backup / копії даних

### In-app (рекомендовано для ОСББ / УК)

| Що | Де |
|----|-----|
| Автоматична **тижнева** копія БД | Worker: щодня ~03:00 UTC job `backups.weekly` (`source: schedule`) |
| Дедуплікація | Якщо `backups/weekly/{YYYY-Www}/manifest.json` зі `status: ok` — **нову не створює** |
| Ручна копія | UI `/admin/ops` → «Створити копію зараз» або `POST /api/backups` (`source: api`) |
| **Вивантаження на ПК** | UI «**На компʼютер**» (зелена кнопка) або `GET /api/backups/:kind/:id/download` → `dah-backup-….sql.gz` |
| **Завантаження з ПК** | UI «**З компʼютера…**» (жовта кнопка) або `POST /api/backups/upload` → `manual/…`, `source: upload` (**каталог, не restore**) |
| Ролі | Write: `super_admin`, `chairman`, `board`, `accountant`. Read/download: + `auditor`. **`resident` — заборонено** |
| Каталоги | `backups/weekly/…`, `backups/manual/…`, marker `backups/last-backup.json` |
| Вміст v1 | `database.sql.gz` (PostgreSQL). Файли MinIO — окремо скриптом |

#### UI `/admin/ops` — походження в списку

Список показує **origin** за `kind` + `source` (не лише «Ручна»/«Тижнева»):

| Бейдж у UI | Умова | Колір (theme) |
|------------|--------|----------------|
| **Тижнева** | `kind === weekly` | success (зелений) |
| **Ручна** | `kind === manual` і `source !== upload` | primary (синій) |
| **З компʼютера** | `source === upload` | warning (жовтий) |

Кнопки:

| Дія | Підпис | Колір |
|-----|--------|--------|
| Export dump на диск | «На компʼютер» | success (зелений ghost) |
| Import `.sql.gz` у каталог | «З компʼютера…» | warning (жовтий ghost) |

Upload **не** відновлює live PostgreSQL і **не** оновлює health marker (`last-backup.json`).  
Відновлення live БД: лише CLI (нижче).

#### API

| Method | Path | Опис |
|--------|------|------|
| GET | `/backups/status` | Тиждень, `weeklyExists`, `lastBackupAt` |
| GET | `/backups` | Список копій + поле **`source`** |
| POST | `/backups` | Ручна копія (завжди нова) |
| POST | `/backups/weekly` | Ensure weekly (skip якщо є) |
| GET | `/backups/:kind/:id/download` | Stream dump на клієнт |
| POST | `/backups/upload` | multipart `.sql.gz` → каталог, `source: upload` |

#### Manifest (`manifest.json` у теці копії)

| Поле | Опис |
|------|------|
| `kind` | `weekly` \| `manual` |
| `status` | `ok` \| `failed` |
| `finishedAt` | ISO time |
| `sizeBytes` | розмір dump |
| `source` | `schedule` \| `api` \| `upload` \| … |
| `triggeredBy` | userId або null |
| `relativePath` | `weekly/…` або `manual/…` |

Compose: volume `./backups:/backups` на `api` і `worker`; env `BACKUP_DIR`, `BACKUP_STATUS_PATH`.  
Ліміт розміру upload (опційно): `BACKUP_UPLOAD_MAX_MB` — **default unlimited** (не задано / `0`); задати позитивне MB, щоб обмежити.  
nginx production: `client_max_body_size 0` (unlimited); за потреби вручну `client_max_body_size 500M` тощо (краще узгодити з `BACKUP_UPLOAD_MAX_MB`).  
У образі API встановлено `postgresql-client` (`pg_dump`).

### CLI / off-site (повний)

| Команда | Що робить |
|---------|-----------|
| `npm run backup` | Швидкий dump PostgreSQL → `backups/` |
| `./infra/scripts/backup.sh` | PostgreSQL + **MinIO** files + marker |
| `./infra/scripts/restore.sh <dir>` | **Відновлення live БД** (очікує `database.sql.gz` у `<dir>`) |

Рекомендація: in-app weekly + вивантаження ключових dump на ПК / off-site `backup.sh` (інший диск / S3).

## Безпека

### nginx headers (production)
- `Strict-Transport-Security` (HSTS)
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`

### Секрети (обов'язково змінити)
- `JWT_SECRET` — 64+ випадкових символів
- `POSTGRES_PASSWORD`
- `S3_SECRET_KEY`

### Мережа (production)
Не публікувати порти Postgres, Redis, MinIO — лише 443 через nginx.

## Журнал аудиту

- API: `GET /api/audit/logs`
- UI: `/admin/audit`
- Ролі: `chairman`, `auditor`

Логуються: login, фінансові операції, документи, комунікації, налаштування.

## Моніторинг

```bash
docker compose ps
docker compose logs -f api
curl http://localhost:3001/api/health
```

## Оновлення версії

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Міграції застосовуються автоматично при старті `api` (`prisma migrate deploy`).