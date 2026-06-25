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

## Backup

| Команда | Що робить |
|---------|-----------|
| `npm run backup` | Швидкий dump PostgreSQL → `backups/` |
| `./infra/scripts/backup.sh` | PostgreSQL + MinIO files |
| `./infra/scripts/restore.sh <dir>` | Відновлення |

Рекомендація: cron щодня + копія `backups/` off-site.

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