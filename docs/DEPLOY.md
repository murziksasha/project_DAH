# Розгортання «Мій дім» у production

Один інстанс Docker = одна або кілька **організацій** (ОСББ та/або УК) через multi-tenant.  
Нижче — мінімальний production-чекліст.

## 1. Підготовка сервера

- Ubuntu 22.04+ або аналог
- Docker Engine 24+ і Docker Compose v2
- Домен, наприклад `osbb.example.com`, A-запис на IP сервера
- Відкриті порти **80** і **443**

## 2. Клонування та конфігурація

```bash
git clone <repo-url> miy-dim && cd miy-dim
cp .env.example .env
```

Після старту super-admin створює організації на `/admin/tenants` з типом **ОСББ** (`osbb`) або **УК** (`management_company`).

Обов'язково змініть у `.env`:

| Змінна | Опис |
|--------|------|
| `POSTGRES_PASSWORD` | Сильний пароль БД |
| `JWT_SECRET` | Випадковий рядок 64+ символів |
| `S3_SECRET_KEY` | Пароль MinIO (internal; не публікувати :9000) |
| `REDIS_URL` | За замовчуванням `none` (worker без Redis) |
| `FILE_DOWNLOAD_SECRET` | Опційно; інакше HMAC від `JWT_SECRET` |
| `DOMAIN` | Ваш домен |
| `CORS_ORIGIN` | `https://<домен>` |
| `NEXT_PUBLIC_API_URL` | `https://<домен>/api` |
| `APP_URL` | `https://<домен>` (посилання скидання пароля) |
| `VAPID_*` | `npx web-push generate-vapid-keys` |
| `COOKIE_SECURE` | `true` за HTTPS (HttpOnly refresh cookie) |
| `BACKUP_DIR` | Каталог копій (Docker: `/backups`) |
| `BACKUP_STATUS_PATH` | `last-backup.json` для health / ops |
| `BACKUP_MAX_AGE_HOURS` | Поріг «stale» для health (напр. 192 для weekly) |
| `SWAGGER_ENABLED` | у prod залиште вимкненим (default off when `NODE_ENV=production`) |
| `REQUIRE_FINANCE_2FA` | default on; finance + backup download need TOTP |

Повний чекліст: [SECURITY-CHECKLIST.md](./SECURITY-CHECKLIST.md).

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
- API health: `https://<домен>/api/health` (мінімальний status)
- Health details (staff JWT): `https://<домен>/api/health/details`
- Swagger: only if `SWAGGER_ENABLED=true` → `https://<домен>/api/docs`

## 5. Резервне копіювання

### 5.1. In-app (тижневі + ручні копії БД)

Сервіси `api` і `worker` монтують `./backups` і пишуть:

```
backups/
  weekly/2026-W31/database.sql.gz   # один слот на ISO-тиждень
  manual/20260801_153045/…          # кожна ручна — окремо
  last-backup.json                  # для GET /api/health і /admin/ops
```

- **Worker** (slim Nest context, **без Redis/BullMQ**): кожні 15 хв — reminders + SLA; ~02:00 UTC daily dump; ~03:00 UTC `backups.weekly` (skip якщо тиждень уже є).
- **Ручна:** `/admin/ops` → «Створити копію зараз» (ролі: голова, правління, бухгалтер, super_admin). Мешканцям недоступно.
- Env: `BACKUP_DIR=/backups`, `BACKUP_STATUS_PATH=/backups/last-backup.json`, опційно `BACKUP_MAX_AGE_HOURS` (для health «stale»; за замовчуванням у compose ~192 год / 8 днів).

### 5.2. CLI dump

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

Архіви CLI: `backups/<timestamp>/` — `database.sql.gz`, `files/` (MinIO), `manifest.json`.

**Відновлення:**

```bash
./infra/scripts/restore.sh backups/20260625_120000
# або restore з backups/weekly/2026-W31 (лише БД)
```

Рекомендація: покладайтесь на in-app weekly + раз на тиждень/місяць full `backup.sh` off-site.

```cron
0 4 * * 0 cd /opt/dah && ./infra/scripts/backup.sh >> /var/log/dah-backup.log 2>&1
```

## 6. Ноутбук + KeenDNS (доступ у мережу будинку)

Типовий сценарій: «Мій дім» працює на ноутбуці голови/бухгалтера/УК, мешканці заходять з телефону через Wi‑Fi або з інтернету через **KeenDNS** (Keenetic).

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

У кабінеті є **банер**, якщо `/api/health` недоступний (Wi‑Fi, KeenDNS, сон ноутбука). Мешканцям варто пояснити: «сервер — ноутбук організації, уночі може бути офлайн».

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

## 10. Native host (без Docker) — ноутбук / слабкий сервер

> **Повна інструкція Linux (systemd):** [NATIVE-HOST.md](./NATIVE-HOST.md)  
> **Хост на Windows** (без systemd-скрипта): [NATIVE-HOST-WINDOWS.md](./NATIVE-HOST-WINDOWS.md)

Коли Docker недоступний: Postgres + MinIO з apt/binary, Node 20+, nginx для static web.

### 10.1. `.env` (localhost)

```env
DATABASE_URL=postgresql://dah:…@127.0.0.1:5432/dah
REDIS_URL=none
S3_ENDPOINT=http://127.0.0.1:9000
S3_ACCESS_KEY=…
S3_SECRET_KEY=…
S3_BUCKET=dah-files
```

Не використовуйте hostname `postgres` / `minio` з Docker-compose.

### 10.2. Build і ручний старт

```bash
cd ~/DAH   # або шлях до репо
npm install
npm run db:generate -w @dah/api   # обов’язково перед build (Prisma Client)
npm run build
npm run db:migrate
npm run start          # = start:app → API + Worker
```

Скрипти:

| Команда | Що робить |
|---------|-----------|
| `npm run start` / `start:app` | API + Worker (`concurrently`) |
| `npm run start:api` | лише Nest API (`dotenv` + `.env`) |
| `npm run start:worker` | лише worker |

Web **не** входить у `npm run start` (static export). Відкрийте через nginx (§10.3) або тимчасово `npm run dev:web` (важче по CPU).

### 10.3. Автозапуск (systemd + nginx)

Передумови: Node ≥20, PostgreSQL service, бінарники `minio` (+ бажано `mc`), зібраний `apps/api/dist` і `apps/web/out`, файл `.env`.

```bash
# один раз (після npm install у корені)
npx dah-native install
# або: npm run install:native
# або: sudo bash infra/scripts/install-native-systemd.sh
# опційно: RUN_USER=admin WEB_PORT=3000 DAH_ROOT=/home/admin/DAH
```

Скрипт ставить units:

| Unit | Роль |
|------|------|
| `dah-minio` | MinIO (`run-minio.sh`, ключі з `.env` S3_*) |
| `dah-minio-init` | oneshot: `mc mb` bucket |
| `dah-api` | `node apps/api/dist/src/main.js` |
| `dah-worker` | `node apps/api/dist/src/worker.js` |
| `dah.target` | wants stack |
| nginx site `dah` | `apps/web/out` + `/api` → `:3001`, listen **3000** |

Після reboot:

```bash
systemctl status dah-api dah-worker dah-minio nginx
curl -s http://127.0.0.1:3001/api/health
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
```

Логи: `journalctl -u dah-api -f`.

### 10.4. Оновлення на native-хості

**Однією командою** (з кореня репо):

```bash
cd ~/DAH
npm run update:native
# = bash infra/scripts/update-native.sh
# pull → npm install → prisma generate → build → migrate → restart api/worker + nginx
```

Опції (env):

```bash
SKIP_PULL=1 npm run update:native        # уже зробили git pull
SKIP_INSTALL=1 npm run update:native     # без npm install
SKIP_GENERATE=1 npm run update:native    # без prisma generate (не рекомендується)
```

Еквівалент вручну:

```bash
cd ~/DAH
git pull
npm install
npm run db:generate -w @dah/api   # також входить у root npm run build / update:native
npm run build
npm run db:migrate
sudo systemctl restart dah-api dah-worker
sudo systemctl reload nginx
```

Migrate **не** виконується автоматично при boot (свідомий вибір).  
Якщо migrate падає з `P1001` — PostgreSQL не запущений (`systemctl start postgresql`).  
Деталі та типові збої: [NATIVE-HOST.md](./NATIVE-HOST.md).

### 10.5. KeenDNS / TLS

Після native stack — той самий периметр, що §6: назовні лише 80/443 (nginx SSL), не 5432/9000/3001.