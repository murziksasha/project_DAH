# Native-хост на Windows (ноутбук без Linux systemd)

## Головне (прочитайте спочатку)

| Питання | Відповідь |
|---------|-----------|
| Linux `install-native-systemd.sh` на Windows? | **Ні** — немає systemd. |
| Аналог на Windows (без Docker) | **`infra/scripts/install-native-windows.ps1`** |
| Команди | `npm run install:native:win` · `npx dah-native install` (на win32 → цей .ps1) |
| Автозапуск | Scheduled Task **`DAH-Native-Stack`** (At startup + At logon) |
| Linux | [NATIVE-HOST.md](./NATIVE-HOST.md) |

```
Linux:   sudo bash infra/scripts/install-native-systemd.sh
Windows: powershell -File infra/scripts/install-native-windows.ps1
```

---

## Швидкий старт (без Docker) — рекомендовано

### Що має бути встановлено вручну один раз

1. **Node.js ≥ 20**  
2. **PostgreSQL** (служба Windows, порт **5432**), БД/юзер як у `.env`  
3. Опційно: **nginx for Windows** у `C:\nginx\nginx.exe` (UI на :3000)  
4. **MinIO** — скрипт сам завантажить у `tools\minio.exe`, якщо немає  

Docker **не** потрібен.

### `.env`

```env
DATABASE_URL=postgresql://dah:ПАРОЛЬ@127.0.0.1:5432/dah
REDIS_URL=none
S3_ENDPOINT=http://127.0.0.1:9000
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=dah-files
JWT_SECRET=...
# ...
```

### Встановити стек + автозапуск

PowerShell **від імені адміністратора** (скрипт сам запропонує elevate):

```powershell
cd C:\miy_dim
copy .env.example .env
# відредагуйте .env (127.0.0.1 !)

# PostgreSQL уже запущений (services.msc)

npm run install:native:win
# те саме:
#   npx dah-native install
#   powershell -ExecutionPolicy Bypass -File infra\scripts\install-native-windows.ps1
```

Скрипт:

1. Перевіряє Node + Postgres `:5432`  
2. Завантажує `tools\minio.exe` за потреби  
3. `npm run build` + `db:migrate`  
4. Пише `infra\nginx\dah-windows.conf`  
5. Реєструє задачу **DAH-Native-Stack** (старт через ~60 с після boot + at logon)  
6. Firewall inbound для `:3000` і `:3001` (Private/Domain)  
7. Одразу піднімає MinIO + API + worker (+ nginx, якщо знайдено)  

Логи: `logs\native-windows\`  
Зняти:  

```powershell
powershell -ExecutionPolicy Bypass -File infra\scripts\install-native-windows.ps1 -Unregister
```

Ручний старт стеку (без перевстановлення задачі):

```powershell
npm run start:native:win
```

### Параметри install

```powershell
# без rebuild / без migrate
.\infra\scripts\install-native-windows.ps1 -SkipBuild -SkipMigrate

# свій nginx / minio
.\infra\scripts\install-native-windows.ps1 -NginxExe C:\nginx\nginx.exe -DownloadMinio

# порт UI
.\infra\scripts\install-native-windows.ps1 -WebPort 3000
```

---

## 1. Архітектура на Windows

```
Телефони / ПК мешканців
        │
        ▼
  nginx (або Caddy) :3000   ← static apps\web\out + proxy /api → :3001
        │
        ▼
  Node API :3001  +  Node Worker     ← npm run start  (або 2 служби)
        │
   ┌────┴────┐
   ▼         ▼
PostgreSQL  MinIO :9000
:5432
```

| Компонент | Linux (systemd) | Windows |
|-----------|-----------------|---------|
| Postgres | apt + unit | Docker Desktop **або** інсталятор PostgreSQL |
| MinIO | `dah-minio.service` | Docker **або** `minio.exe` + Task Scheduler |
| API | `dah-api.service` | `node …\main.js` + NSSM/pm2/Task Scheduler |
| Worker | `dah-worker.service` | `node …\worker.js` + окрема служба |
| Web | nginx site `dah` | nginx для Windows / Caddy / IIS reverse proxy |
| Install-скрипт | `npx dah-native install` | **не використовується** |

**Рекомендований простий варіант для ОСББ-ноутбука на Windows:**

1. **Docker Desktop** лише для Postgres + MinIO (`npm run docker:infra`).
2. **Node на хості** для API + worker + збірки.
3. **nginx** (Windows build) або **Caddy** для UI на `:3000`.
4. Автозапуск після reboot — Task Scheduler або NSSM.

Повний Docker (`docker compose up` з api/web) теж ок — тоді ця «native» інструкція не потрібна; див. [DEPLOY.md](./DEPLOY.md).

---

## 2. Вимоги

- Windows 10/11 (64-bit), ноутбук завжди в мережі (або прокидає KeenDNS).
- [Node.js ≥ 20](https://nodejs.org/) (LTS).
- Git (опційно Git Bash — лише для зручності; **не** замінює systemd).
- Один із варіантів БД+файлів:
  - **A (простіше):** [Docker Desktop](https://www.docker.com/products/docker-desktop/) + WSL2 backend;
  - **B:** PostgreSQL for Windows + MinIO Windows binary.
- Місце на диску для `node_modules`, БД, MinIO data, `backups\`.
- Статична IP у LAN (резервація DHCP на роутері).

PowerShell **від імені звичайного користувача** (Administrator — лише для встановлення служб/nginx у Program Files).

---

## 3. Клон і `.env`

```powershell
cd C:\miy_dim
# або: git clone <url> C:\miy_dim ; cd C:\miy_dim

copy .env.example .env
notepad .env
```

### Обов’язкові значення для Windows-хоста

```env
# НЕ docker-імена postgres/minio, якщо API крутиться на Windows-хості
POSTGRES_USER=dah
POSTGRES_PASSWORD=...сильний...
POSTGRES_DB=dah
DATABASE_URL=postgresql://dah:...сильний...@127.0.0.1:5432/dah

REDIS_URL=none

S3_ENDPOINT=http://127.0.0.1:9000
S3_ACCESS_KEY=dah_minio
S3_SECRET_KEY=...сильний...
S3_BUCKET=dah-files
S3_REGION=us-east-1

JWT_SECRET=...мінімум_64_random...
SUPER_ADMIN_EMAIL=admin@local
SUPER_ADMIN_PASSWORD=...сильний...

API_PORT=3001
WEB_PORT=3000
REGISTRATION_ENABLED=true

# same-origin через reverse-proxy на :3000
NEXT_PUBLIC_API_URL=http://127.0.0.1:3000/api
# у LAN з телефону зручніше IP ноутбука:
# NEXT_PUBLIC_API_URL=http://192.168.1.50:3000/api

DEFAULT_LOCALE=uk
BUILDING_NAME=ОСББ ...
```

Після зміни `NEXT_PUBLIC_*` потрібен **повторний** `npm run build` (web).

---

## 4. Підняти Postgres і MinIO

### Варіант A — Docker лише для інфри (рекомендовано)

Docker Desktop **Running**, потім у PowerShell:

```powershell
cd C:\miy_dim
npm run docker:infra
# = docker compose up -d postgres minio minio-init

docker compose ps
Test-NetConnection 127.0.0.1 -Port 5432
Test-NetConnection 127.0.0.1 -Port 9000
```

Користувач/БД створюються з `.env` (`POSTGRES_*`).  
`DATABASE_URL` і `S3_ENDPOINT` — на **127.0.0.1**, бо контейнери з пробросом портів.

Зупинка інфри:

```powershell
npm run docker:infra:down
```

### Варіант B — без Docker

1. Встановити [PostgreSQL](https://www.postgresql.org/download/windows/), порт 5432.
2. У pgAdmin / `psql`:

```sql
CREATE USER dah WITH PASSWORD '...';
CREATE DATABASE dah OWNER dah;
```

3. Завантажити [MinIO](https://min.io/download) (`minio.exe`), дані наприклад `C:\miy_dim\minio-data`:

```powershell
$env:MINIO_ROOT_USER="dah_minio"
$env:MINIO_ROOT_PASSWORD="...з .env S3_SECRET_KEY..."
mkdir C:\miy_dim\minio-data -Force
# у окремому вікні / службі:
C:\path\to\minio.exe server C:\miy_dim\minio-data --address ":9000" --console-address ":9001"
```

4. Bucket `dah-files` (консоль :9001 або `mc mb`).

---

## 5. Збірка додатку (Node на Windows)

```powershell
cd C:\miy_dim
npm install

# Prisma Client (також входить у root npm run build)
npm run db:generate -w @dah/api

npm run build
# shared → money → api-client → prisma generate → api → web (apps\web\out)

# Postgres має слухати :5432
npm run db:migrate
```

Перевірка:

```powershell
Test-Path apps\api\dist\src\main.js
Test-Path apps\web\out\index.html
```

### Чому `install-native-systemd.sh` тут «не запускається»

```powershell
# Це НЕ поставить служби Windows:
npx dah-native install
# → "requires Linux with systemd"

bash infra/scripts/install-native-systemd.sh
# Git Bash: немає systemd / типово немає sudo → скрипт непридатний
```

**Не намагайтесь** «змусити» цей скрипт через Developer Mode sudo — він налаштовує **Linux unit-файли**, яких на Windows немає.

---

## 6. Ручний запуск (перевірка «все живе»)

Термінал 1 — інфра вже up (Docker або native PG/MinIO).

```powershell
cd C:\miy_dim
npm run start
# = API :3001 + Worker (через dotenv + concurrently)
```

Перевірка API:

```powershell
curl http://127.0.0.1:3001/api/health
# або:
Invoke-RestMethod http://127.0.0.1:3001/api/health
```

Web static **не** входить у `npm run start`. Тимчасово для перевірки UI:

```powershell
# окремий термінал — лише для тесту (не prod-патерн)
npx --yes serve apps/web/out -l 3000
```

Але **`/api` не проксується** через `serve` → у браузері API має бути доступний згідно `NEXT_PUBLIC_API_URL`.  
Для мешканців у LAN потрібен reverse-proxy (наступний розділ), інакше CORS/URL часто ламаються.

---

## 7. Web UI + proxy `/api` (аналог nginx site `dah`)

Потрібно те саме, що робить `infra/nginx/dah-native.conf.in`:

- root = `C:\miy_dim\apps\web\out`
- `location /api/` → `http://127.0.0.1:3001/api/`
- listen **3000** (або 80)

### 7.1. nginx для Windows

1. Завантажити [nginx for Windows](https://nginx.org/en/download.html), розпакувати наприклад у `C:\nginx`.
2. Додати server (фрагмент; шлях підставте свій):

```nginx
server {
    listen 3000;
    server_name _;
    root C:/miy_dim/apps/web/out;
    index index.html;
    client_max_body_size 100m;

    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    location /_next/static/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    location = /sw.js {
        add_header Cache-Control "no-cache";
        try_files $uri =404;
    }

    location / {
        try_files $uri $uri/ $uri/index.html /index.html;
    }
}
```

3. Запуск:

```powershell
cd C:\nginx
.\nginx.exe
# перевірка:
curl http://127.0.0.1:3000/
curl http://127.0.0.1:3000/api/health
```

Перезавантаження конфігу: `.\nginx.exe -s reload`.

### 7.2. Caddy (простіше, один файл)

`Caddyfile` у репо або поруч:

```
:3000 {
    root * C:\miy_dim\apps\web\out
    encode gzip
    handle /api/* {
        reverse_proxy 127.0.0.1:3001
    }
    handle {
        try_files {path} {path}/ /index.html
        file_server
    }
}
```

```powershell
caddy run --config C:\miy_dim\Caddyfile
```

### 7.3. Браузер

- Локально: `http://127.0.0.1:3000/`
- LAN: `http://<IP-ноутбука>:3000/`  
  У firewall Windows дозвольте вхід на **3000** (і не відкривайте 5432/9000/3001 назовні).

---

## 8. Автозапуск після reboot (замість systemd)

`install-native-systemd.sh` на Linux робить `enable --now`. На Windows зробіть **еквівалент вручну**.

### 8.1. Мінімум — Task Scheduler (без зайвих утиліт)

Створіть, наприклад, `C:\miy_dim\infra\scripts\start-windows-host.ps1`:

```powershell
# start-windows-host.ps1 — приклад; шляхи підставте свої
$ErrorActionPreference = "Stop"
Set-Location "C:\miy_dim"

# 1) Docker-інфра (якщо використовуєте варіант A)
docker compose up -d postgres minio minio-init

# 2) API + Worker (потрібен dotenv-cli з npm install)
# Окремі вікна не потрібні — concurrently у start
Start-Process -FilePath "npm" -ArgumentList "run","start" -WorkingDirectory "C:\miy_dim" -WindowStyle Hidden

# 3) nginx — якщо встановлений
# & "C:\nginx\nginx.exe"
```

Планувальник завдань:

1. Task Scheduler → Create Task.
2. **Run whether user is logged on or not** / **Run with highest privileges** (за потреби).
3. Trigger: **At startup** (затримка 30–60 с, щоб Docker встиг піднятись).
4. Action: `powershell.exe -ExecutionPolicy Bypass -File C:\miy_dim\infra\scripts\start-windows-host.ps1`.

Для **nginx** — окремий startup або Windows Service wrapper.

### 8.2. NSSM (зручні Windows Services)

[NSSM](https://nssm.cc/) — обгортка «exe → служба».

Приклад API (від Administrator CMD/PowerShell):

```text
nssm install DAH-API "C:\Program Files\nodejs\node.exe"
nssm set DAH-API AppDirectory C:\miy_dim\apps\api
nssm set DAH-API AppParameters dist\src\main.js
nssm set DAH-API AppEnvironmentExtra DATABASE_URL=postgresql://... JWT_SECRET=... S3_ENDPOINT=http://127.0.0.1:9000 ...
# або AppEnvironmentExtra з файлу — NSSM UI: Environment
nssm start DAH-API
```

Worker окремо:

```text
nssm install DAH-Worker "C:\Program Files\nodejs\node.exe"
nssm set DAH-Worker AppDirectory C:\miy_dim\apps\api
nssm set DAH-Worker AppParameters dist\src\worker.js
# ті самі змінні середовища, що в .env
nssm start DAH-Worker
```

Простіше підхопити `.env`: маленький `run-api.cmd`:

```bat
@echo off
cd /d C:\miy_dim
call npm run start:api
```

і вказати nssm на `cmd.exe /c C:\miy_dim\run-api.cmd` (аналогічно worker).

### 8.3. pm2 (кросплатформенно)

```powershell
npm install -g pm2
npm install -g pm2-windows-startup   # за бажанням автозапуск
cd C:\miy_dim
pm2 start npm --name dah-api -- run start:api
pm2 start npm --name dah-worker -- run start:worker
pm2 save
```

Деталі pm2 на Windows залежать від версії; NSSM часто стабільніший для «поставили й забули».

---

## 9. Оновлення версії на Windows-хості

На Linux: `npm run update:native`.  
На Windows **частково** той самий flow, **без** `systemctl`:

```powershell
cd C:\miy_dim
git pull
npm install
npm run build          # вже містить db:generate
npm run db:migrate     # Postgres має бути up

# перезапуск процесів:
# Task Scheduler / nssm restart DAH-API DAH-Worker
# або: pm2 restart all
# або: зупинити npm run start і запустити знову
# nginx: C:\nginx\nginx.exe -s reload
```

Або:

```powershell
# update CLI спробує bash update-native.sh (Git Bash) —
# migrate/build відпрацюють; restart systemd пропустить, якщо units немає
$env:SKIP_RESTART = "1"
npm run update:native
```

Потім **вручну** перезапустіть API/worker/nginx.

---

## 10. KeenDNS / доступ з інтернету

Те саме, що [DEPLOY.md](./DEPLOY.md) §6:

- На Keenetic: KeenDNS + port forward **80/443** (або ваш зовнішній порт) на IP ноутбука.
- На ноуті: TLS (Caddy auto HTTPS, або nginx + cert) **або** HTTPS на роутері.
- Не пробрасувати **5432**, **9000**, **3001** назовні — лише фронт (80/443 → nginx/Caddy).
- У `.env`: `APP_URL`, `CORS_ORIGIN`, `NEXT_PUBLIC_API_URL`, за HTTPS — `COOKIE_SECURE=true`.

---

## 11. Типові збої (Windows)

| Симптом | Що робити |
|---------|-----------|
| `npx dah-native install` → requires Linux | Очікувано. Читайте **цю** інструкцію, не Linux-скрипт. |
| `sudo: command not found` (Git Bash) | Не Linux. Не ставте «Windows sudo» заради цього скрипта. |
| `P1001 Can't reach database` | `docker compose ps` / служба PostgreSQL; `Test-NetConnection 127.0.0.1 -Port 5432` |
| Prisma `UserRole` / 200+ TS errors | `npm run db:generate -w @dah/api` → `npm run build` |
| UI ок, `/api` 502 | API не запущений: `curl :3001/api/health` |
| З телефону не відкривається | Firewall inbound 3000; IP ноутбука; `NEXT_PUBLIC_API_URL` з IP/доменом + rebuild web |
| Docker Desktop stopped after sleep | Task Scheduler delay; увімкнути Docker auto-start |
| MinIO Access Denied | `S3_ACCESS_KEY` / `S3_SECRET_KEY` = ті самі, що MinIO root |

---

## 12. Чекліст Windows-хоста «з нуля»

```text
[ ] Node ≥ 20, (опційно) Docker Desktop
[ ] clone → copy .env.example .env → 127.0.0.1, REDIS_URL=none
[ ] npm run docker:infra   (або native PG + MinIO)
[ ] npm install
[ ] npm run build
[ ] npm run db:migrate
[ ] npm run start          → health :3001
[ ] nginx/Caddy :3000 → out + /api proxy
[ ] Перевірка з телефону в Wi‑Fi
[ ] Автозапуск: Task Scheduler / NSSM / pm2
[ ] Firewall: 3000 (і 80/443), не 5432/9000
[ ] (опційно) KeenDNS + TLS
[ ] Оновлення: git pull → npm install → build → migrate → restart процесів
```

**Чого немає в чеклісті:** `install-native-systemd.sh` — він для Linux.

---

## 13. Порівняння команд

| Дія | Linux | Windows |
|-----|-------|---------|
| Поставити «служби ОС» | `npx dah-native install` | NSSM / Task Scheduler / pm2 (вручну) |
| Оновлення | `npm run update:native` | `git pull` + `npm install` + `npm run build` + `db:migrate` + restart |
| Інфра БД/S3 | apt + minio binary | `npm run docker:infra` або native installers |
| Web proxy | nginx unit з install-скрипта | nginx/Caddy config вручну (§7) |
| Логи API | `journalctl -u dah-api -f` | консоль NSSM / pm2 logs / файл |

---

## 14. Пов’язані документи

- [NATIVE-HOST.md](./NATIVE-HOST.md) — Linux + systemd (повний сценарій зі скриптом)
- [DEPLOY.md](./DEPLOY.md) — Docker prod, KeenDNS, backup
- [README.md](../README.md) — огляд

Якщо з’явиться окремий Windows installer у репо — його буде згадано тут; зараз **офіційний** one-shot install-скрипт лише Linux.
