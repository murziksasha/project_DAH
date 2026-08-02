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
| Автоматична **тижнева** копія БД | Worker: щодня ~03:00 UTC job `backups.weekly` |
| Дедуплікація | Якщо `backups/weekly/{YYYY-Www}/manifest.json` зі `status: ok` — **нову не створює** |
| Ручна копія | UI `/admin/ops` → «Створити копію зараз» або `POST /api/backups` |
| Ролі | Write: `super_admin`, `chairman`, `board`, `accountant`. Read list: + `auditor`. **`resident` — заборонено** |
| Каталоги | `backups/weekly/…`, `backups/manual/…`, marker `backups/last-backup.json` |
| Вміст v1 | `database.sql.gz` (PostgreSQL). Файли MinIO — окремо скриптом |

API:

| Method | Path | Опис |
|--------|------|------|
| GET | `/backups/status` | Тиждень, чи є weekly, lastBackupAt |
| GET | `/backups` | Список копій |
| POST | `/backups` | Ручна копія (завжди нова) |
| POST | `/backups/weekly` | Ensure weekly (skip якщо є) |

Compose: volume `./backups:/backups` на `api` і `worker`; env `BACKUP_DIR`, `BACKUP_STATUS_PATH`.  
У образі API встановлено `postgresql-client` (`pg_dump`).

### CLI / off-site (повний)

| Команда | Що робить |
|---------|-----------|
| `npm run backup` | Швидкий dump PostgreSQL → `backups/` |
| `./infra/scripts/backup.sh` | PostgreSQL + **MinIO** files + marker |
| `./infra/scripts/restore.sh <dir>` | Відновлення |

Рекомендація: in-app weekly + періодичний `backup.sh` off-site (інший диск / S3).

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