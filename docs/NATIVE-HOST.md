# Native-хост на ноутбуці (без Docker)

Інструкція для сценарію: **ноутбук (Ubuntu / Lubuntu / Debian)** тримає «Мій дім» як звичайні **systemd-служби** + **nginx**. Docker **не** потрібен.

> **Хост на Windows?** Скрипт `install-native-systemd.sh` / `npx dah-native install` **не працює** (немає systemd).  
> Повна інструкція: **[NATIVE-HOST-WINDOWS.md](./NATIVE-HOST-WINDOWS.md)**.

Скрипти в репо:

| Скрипт / команда | Призначення |
|------------------|-------------|
| `npx dah-native install` / `npm run install:native` | **Один раз**: systemd + nginx (Node-обгортка → bash; потрібен root/sudo) |
| `npx dah-install-native` | Те саме, що `install` |
| `npx dah-native update` / `npm run update:native` | **Оновлення**: pull → install → **prisma generate** → build → migrate → restart |
| `infra/scripts/install-native-systemd.sh` | Той самий install напряму через bash |
| `infra/scripts/run-minio.sh` | MinIO з ключами з `.env` (викликає unit `dah-minio`) |
| `infra/scripts/run-with-env.sh` | Запуск node з підвантаженим `.env` |
| Пакет `@dah/native-cli` | Workspace-бінарі `dah-native`, `dah-install-native` |

Після установки служби самі піднімаються після reboot.

---

## 1. Що буде працювати

```
Мешканці / правління
        │
        ▼
   nginx :3000  (або 80/443 ззовні через KeenDNS)
   ├── static  → apps/web/out
   └── /api/   → proxy → Nest API :3001
                        │
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
  PostgreSQL      MinIO :9000      Worker (cron/reminders)
  (system)        dah-minio        dah-worker
                  dah-api
```

| Компонент | Як запускається |
|-----------|-----------------|
| PostgreSQL | системний пакет `postgresql` (apt) |
| MinIO | unit `dah-minio` |
| API | unit `dah-api` |
| Worker | unit `dah-worker` |
| Web UI | nginx (`sites-enabled/dah`) |
| Redis | **не потрібен** (`REDIS_URL=none`) |

---

## 2. Вимоги до ноутбука

- **ОС:** Ubuntu 22.04+ / Lubuntu / Debian (systemd).
- **Node.js ≥ 20** (nvm або nodesource) — у того користувача, від якого крутиться сервіс (часто `admin`).
- **PostgreSQL 14+** (краще 16).
- **nginx** (скрипт поставить сам, якщо немає).
- **minio** (+ бажано **mc**) у `PATH`, наприклад `/usr/local/bin/minio`.
- Достатньо місця під БД, `~/minio-data` і `backups/`.
- Мережа: статична IP у LAN (DHCP reservation на роутері) — зручно для мешканців і KeenDNS.

> Windows: native systemd **немає**. Ця інструкція — для Linux-ноутбука / WSL2 з systemd, або Linux dual-boot. На Windows можна лише Docker або ручний `npm run start` без служб.

---

## 3. Одноразова підготовка

### 3.1. Репозиторій

```bash
# приклад шляху
cd ~
git clone <url-репо> DAH   # або miy_dim / project_DAH
cd ~/DAH
```

### 3.2. Node

```bash
node -v   # >= 20
npm -v
```

### 3.3. PostgreSQL

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
```

Користувач і БД (пароль має збігатися з `.env`):

```bash
sudo -u postgres psql <<'SQL'
CREATE USER dah WITH PASSWORD 'dah_secret_change_me';
CREATE DATABASE dah OWNER dah;
SQL
```

Перевірка:

```bash
psql "postgresql://dah:dah_secret_change_me@127.0.0.1:5432/dah" -c 'SELECT 1'
```

### 3.4. MinIO binary

```bash
# приклад (архітектуру підставте: amd64 / arm64)
curl -fsSL -o /tmp/minio \
  https://dl.min.io/server/minio/release/linux-amd64/minio
sudo install -m 755 /tmp/minio /usr/local/bin/minio
minio --version

# опційно: mc для створення bucket (скрипт init)
# curl ... mc → /usr/local/bin/mc
```

Дані MinIO за замовчуванням: `~/minio-data` (користувач служби).

### 3.5. Файл `.env` (обов’язково localhost)

```bash
cp .env.example .env
nano .env   # або інший редактор
```

**Критично для native** — не лишайте docker-хостнейми `postgres` / `minio`:

```env
# Database — локальний PostgreSQL
POSTGRES_USER=dah
POSTGRES_PASSWORD=...сильний_пароль...
POSTGRES_DB=dah
DATABASE_URL=postgresql://dah:...сильний_пароль...@127.0.0.1:5432/dah

# Redis не використовуємо
REDIS_URL=none

# MinIO на цій же машині
S3_ENDPOINT=http://127.0.0.1:9000
S3_ACCESS_KEY=...
S3_SECRET_KEY=...довгий_секрет...
S3_BUCKET=dah-files
S3_REGION=us-east-1

# Auth
JWT_SECRET=...мінімум_64_символи_random...
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

# Перший супер-адмін (створюється, якщо користувачів ще немає)
SUPER_ADMIN_EMAIL=admin@ваш-домен.local
SUPER_ADMIN_PASSWORD=...сильний...

REGISTRATION_ENABLED=true
# SWAGGER_ENABLED=false   # у «бойовому» хості краще вимкнути

API_PORT=3001
WEB_PORT=3000
BUILDING_NAME=ОСББ ...
DEFAULT_LOCALE=uk

# Для браузера за reverse-proxy краще same-origin (через nginx /api)
NEXT_PUBLIC_API_URL=http://127.0.0.1:3000/api
# або після KeenDNS/HTTPS:
# NEXT_PUBLIC_API_URL=https://osbb-xxx.keenetic.link/api
# APP_URL=https://osbb-xxx.keenetic.link
# CORS_ORIGIN=https://osbb-xxx.keenetic.link
# COOKIE_SECURE=true
# DOMAIN=osbb-xxx.keenetic.link

# Web Push (опційно)
# npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@...
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
```

Правила:

- `DATABASE_URL` → `127.0.0.1` / `localhost`, **не** `postgres`.
- `S3_ENDPOINT` → `http://127.0.0.1:9000`, **не** `http://minio:9000`.
- `REDIS_URL=none`.
- Паролі з `.env.example` у проді **змініть**.

### 3.6. Залежності, Prisma Client, збірка, міграції

З кореня репо **від імені звичайного користувача** (не root):

```bash
cd ~/DAH
npm install

# Обов’язково: згенерувати Prisma Client (інакше nest build падає з «no exported member UserRole» тощо)
npm run db:generate -w @dah/api

npm run build
# = shared + money + api-client + api + web (static → apps/web/out)

# Postgres уже має слухати :5432
npm run db:migrate
```

Перевірка артефактів перед службами:

```bash
test -f apps/api/dist/src/main.js && echo API_OK
test -d apps/web/out && echo WEB_OK
```

Ручний пробний старт (без systemd):

```bash
npm run start
# API :3001 + worker; web — окремо через nginx після install
curl -s http://127.0.0.1:3001/api/health
# Ctrl+C
```

---

## 4. Перетворення на служби (один раз)

Після `npm install` у корені репо доступні Node-команди (пакет `@dah/native-cli`):

```bash
cd ~/DAH
npm install

# зручно через Node / npx (самі піднімуть sudo -E bash …)
npx dah-native install
# або:
npm run install:native
npx dah-install-native
```

Еквівалент «класикою»:

```bash
sudo bash infra/scripts/install-native-systemd.sh
```

Якщо `sudo` немає — CLI підкаже; або:

```bash
su -
cd /home/USER/DAH
RUN_USER=USER bash infra/scripts/install-native-systemd.sh
```

Опції (env):

```bash
# інший шлях / користувач / порт UI
RUN_USER=admin WEB_PORT=3000 DAH_ROOT=/home/admin/DAH npx dah-native install

# без nginx (рідко)
SKIP_NGINX=1 npx dah-native install
```

Скрипт:

1. Перевіряє `.env`, зібраний API (`dist`) і web (`out`), наявність `node`.
2. Ставить units у `/etc/systemd/system/`:
   - `dah-minio.service`
   - `dah-minio-init.service` (bucket)
   - `dah-api.service`
   - `dah-worker.service`
   - `dah.target`
3. Ставить nginx site `dah` (listen **WEB_PORT**, root `apps/web/out`, `/api/` → `:3001`).
4. Увімкне PostgreSQL (якщо є unit), MinIO, API, worker, nginx.
5. `enable` — автозапуск після reboot.

### Перевірка

```bash
systemctl status dah-minio dah-api dah-worker nginx --no-pager
curl -s http://127.0.0.1:3001/api/health
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
```

У браузері в LAN: `http://<IP-ноутбука>:3000/`.

Логи:

```bash
journalctl -u dah-api -f
journalctl -u dah-worker -f
journalctl -u dah-minio -f
```

Керування:

```bash
sudo systemctl restart dah-api dah-worker
sudo systemctl reload nginx
sudo systemctl stop dah.target   # залежить від wants — див. units
```

---

## 5. Оновлення версії (на вже працюючому хості)

З кореня репо **від користувача, якому належить клон** (не обов’язково root):

```bash
cd ~/DAH
npm run update:native
# bash infra/scripts/update-native.sh
# git pull → npm install → prisma generate → build → db:migrate → restart api/worker + nginx
```

Скрипт і root `npm run build` самі викликають `db:generate`. Ручний generate потрібен лише якщо збираєте API окремо (`npm run build -w @dah/api` без root build).

Прапорці:

```bash
SKIP_PULL=1 npm run update:native        # код уже оновлений
SKIP_INSTALL=1 npm run update:native     # без npm install
SKIP_GENERATE=1 npm run update:native    # без prisma generate (не рекомендується)
SKIP_BUILD=1 npm run update:native       # generate + migrate + restart (без full build — рідко)
SKIP_MIGRATE=1 npm run update:native     # без міграцій (обережно)
SKIP_RESTART=1 npm run update:native     # без systemctl
```

**Важливо:**

- Migrate **не** робиться при boot — лише в `update:native` / вручну `npm run db:migrate`.
- Перед migrate **PostgreSQL має бути запущений** (`systemctl status postgresql`). Інакше `P1001: Can't reach database server`.
- Ноутбук має бути онлайн у LAN, якщо мешканці ходять по Wi‑Fi; для KeenDNS — див. [DEPLOY.md](./DEPLOY.md) §6.

---

## 6. Типові збої

| Симптом | Що зробити |
|---------|------------|
| `P1001 Can't reach database server at localhost:5432` | `sudo systemctl start postgresql` і перевірити `DATABASE_URL` |
| `no exported member 'UserRole'` / 200+ TS errors на build | `npm run db:generate -w @dah/api` і знову `npm run build` |
| install-native: `API not built` | `npm run build` від `RUN_USER` |
| install-native: `Web export missing` | `npm run build -w @dah/web` (або повний `npm run build`) |
| MinIO / файли не вантажаться | `systemctl status dah-minio`; `S3_ENDPOINT=http://127.0.0.1:9000`; `command -v minio` |
| UI є, `/api` 502 | `systemctl status dah-api`; `curl :3001/api/health` |
| Після reboot нічого не слухає | `systemctl status dah-api dah-minio nginx postgresql` — чи `enable` пройшов |
| Docker-хостнейми в `.env` | Замінити `postgres`/`minio` на `127.0.0.1` |

---

## 7. Безпека на «домашньому» хості

- Змініть усі паролі з example (`POSTGRES_*`, `JWT_SECRET`, `S3_SECRET_KEY`, super-admin).
- Не відкривайте назовні **5432**, **9000**, **3001** — лише **80/443** (або KeenDNS → nginx).
- `SWAGGER_ENABLED=false` у постійній експлуатації.
- Резервні копії: in-app weekly (worker) + періодично `./infra/scripts/backup.sh` off-site. Див. [DEPLOY.md](./DEPLOY.md) §5.
- Чекліст: [SECURITY-CHECKLIST.md](./SECURITY-CHECKLIST.md).

---

## 8. Короткий чекліст «з нуля»

```text
[ ] Ubuntu/Lubuntu, Node ≥ 20
[ ] apt install postgresql; CREATE USER/DATABASE dah
[ ] minio → /usr/local/bin
[ ] git clone; cp .env.example .env → localhost URLs, REDIS_URL=none
[ ] npm install
[ ] npm run db:generate -w @dah/api
[ ] npm run build
[ ] npm run db:migrate
[ ] sudo bash infra/scripts/install-native-systemd.sh
[ ] curl health :3001 і HTTP 200 на :3000
[ ] Логін super-admin / створення організації
[ ] (опційно) KeenDNS + TLS — DEPLOY.md §6
[ ] Оновлення: npm run update:native
```

---

## 9. Пов’язані документи

- [DEPLOY.md](./DEPLOY.md) — Docker prod, KeenDNS, backup, native §10 (коротко)
- [TESTING.md](./TESTING.md) — тести, `db:generate`
- [README.md](../README.md) — огляд продукту
