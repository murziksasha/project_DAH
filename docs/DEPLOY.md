# Розгортання DAH у production

Один інстанс Docker = одне ОСМД. Нижче — мінімальний production-чекліст.

## 1. Підготовка сервера

- Ubuntu 22.04+ або аналог
- Docker Engine 24+ і Docker Compose v2
- Домен, наприклад `osbb.example.com`, A-запис на IP сервера
- Відкриті порти **80** і **443**

## 2. Клонування та конфігурація

```bash
git clone <repo-url> dah && cd dah
cp .env.example .env
```

Обов'язково змініть у `.env`:

| Змінна | Опис |
|--------|------|
| `POSTGRES_PASSWORD` | Сильний пароль БД |
| `JWT_SECRET` | Випадковий рядок 64+ символів |
| `S3_SECRET_KEY` | Пароль MinIO |
| `DOMAIN` | Ваш домен |
| `CORS_ORIGIN` | `https://<домен>` |
| `NEXT_PUBLIC_API_URL` | `https://<домен>/api` |
| `VAPID_*` | `npx web-push generate-vapid-keys` |

## 3. TLS-сертифікати (Let's Encrypt)

```bash
mkdir -p infra/certs
# Варіант A: certbot на хості
sudo certbot certonly --standalone -d osbb.example.com
sudo cp /etc/letsencrypt/live/osbb.example.com/fullchain.pem infra/certs/
sudo cp /etc/letsencrypt/live/osbb.example.com/privkey.pem infra/certs/
```

Або self-signed для тесту:

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout infra/certs/privkey.pem \
  -out infra/certs/fullchain.pem \
  -subj "/CN=localhost"
```

## 4. Запуск

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose exec api npx ts-node prisma/seed.ts   # лише перший раз
```

Перевірка:

- PWA: `https://<домен>/`
- API health: `https://<домен>/api/health`
- Swagger: `https://<домен>/api/docs`

## 5. Резервне копіювання

**Швидкий dump БД (Docker profile):**

```bash
npm run backup
# або
docker compose --profile backup run --rm backup
```

**Повний backup (БД + файли MinIO):**

```bash
# Linux / macOS
chmod +x infra/scripts/backup.sh
./infra/scripts/backup.sh

# Windows
powershell -File infra/scripts/backup.ps1
```

Архіви зберігаються в `backups/<timestamp>/`:
- `database.sql.gz` (або `.sql` на Windows)
- `files/` — дзеркало бакета MinIO
- `manifest.json`

**Відновлення:**

```bash
./infra/scripts/restore.sh backups/20260625_120000
```

Рекомендація: cron щодня о 03:00 + копія `backups/` на інший диск або S3.

```cron
0 3 * * * cd /opt/dah && ./infra/scripts/backup.sh >> /var/log/dah-backup.log 2>&1
```

## 6. Ноутбук + KeenDNS (доступ у мережу будинку)

Типовий сценарій: DAH працює на ноутбуці голови/бухгалтера, мешканці заходять з телефону через Wi‑Fi або з інтернету через **KeenDNS** (Keenetic).

### 6.1. Локальна мережа

1. Задайте ноутбуку **статичну IP** (DHCP reservation на роутері).
2. Запустіть стек (Docker Desktop / Linux):
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
   ```
3. У LAN відкривайте `https://<IP-ноутбука>` або `http://<IP>:8080` (dev).
4. У **Налаштування** → «Посилання для мешканців» скопіюйте URL / покажіть QR.

### 6.2. KeenDNS (доступ з інтернету)

1. На Keenetic увімкніть **KeenDNS** (наприклад `osbb-ivan.keenetic.link`).
2. **Проброс портів** на IP ноутбука: `443` (і за потреби `80` для ACME/redirect).
3. Виставте в `.env`:
   - `DOMAIN=osbb-ivan.keenetic.link`
   - `CORS_ORIGIN=https://osbb-ivan.keenetic.link`
   - `NEXT_PUBLIC_API_URL=https://osbb-ivan.keenetic.link/api`
4. TLS: Let's Encrypt (DNS/HTTP challenge) або інший валідний сертифікат у `infra/certs/`.  
   **Self-signed** зазвичай ламає встановлення PWA та Web Push на телефонах.
5. Перевірте **hairpin NAT** (доступ до KeenDNS зсередини LAN) — у Keenetic зазвичай працює; інакше в LAN користуйтеся локальним IP.

### 6.3. Безпека периметра

- Назовні лише **nginx 80/443**. Postgres, Redis, MinIO — не публікувати.
- Змініть усі паролі seed / `SUPER_ADMIN_*` / `JWT_SECRET` перед відкриттям в інтернет.
- Рекомендовано: сильні паролі адмінів, регулярний `npm run backup`, UPS для ноутбука.
- Опційно обмежте admin-шляхи VPN; мешканцям достатньо HTTPS + JWT.

### 6.4. UX при обриві зв’язку

У кабінеті є **банер**, якщо `/api/health` недоступний (Wi‑Fi, KeenDNS, сон ноутбука). Мешканцям варто пояснити: «сервер — ноутбук ОСМД, уночі може бути офлайн».

## 7. Оновлення версії

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Міграції застосовуються автоматично при старті `api`.

## 8. Безпека

- Nginx додає HSTS, X-Frame-Options, nosniff (див. `infra/nginx/nginx-ssl.conf`)
- Журнал аудиту: `/admin/audit` (ролі `chairman`, `auditor`)
- Не публікуйте порти Postgres/Redis/MinIO у production — лише nginx 443
- Оновлюйте сертифікати (certbot renew + reload nginx)
- Для KeenDNS див. також §6.3
- **2FA (TOTP)** для правління: `/admin/security`
- **Email**: змінні `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `APP_URL` (без SMTP листи пишуться в `EmailLog` / логи API)
- **Worker** (`docker compose` service `worker`) кожні 15 хв надсилає нагадування про борг і custom reminders

## 9. Моніторинг

- `docker compose ps`
- `docker compose logs -f api`
- Health: `GET /api/health`

## Локальна розробка vs production

| | Dev | Production |
|---|-----|------------|
| URL | `http://localhost:8080` | `https://<домен>` |
| Compose | `docker compose up` | `docker compose -f docker-compose.yml -f docker-compose.prod.yml up` |
| TLS | Ні | Так (`infra/certs/`) |
| Push | Опційно | VAPID keys обов'язкові |