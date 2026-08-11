# KeenDNS + Windows native host («Мій дім»)

Типовий прод-сценарій: **ноутбук Windows** без Docker, стек через Scheduled Task, доступ з інтернету через **KeenDNS**.

Приклад домену: `dim.properservice.keenetic.pro`.

Пов’язано: [NATIVE-HOST-WINDOWS.md](./NATIVE-HOST-WINDOWS.md), [DEPLOY.md](./DEPLOY.md) §6, [SECURITY-CHECKLIST.md](./SECURITY-CHECKLIST.md).

---

## 1. Що має працювати на ноуті

```text
npm run install:native:win   # один раз: Task DAH-Native-Stack, MinIO, build, migrate
npm run start:native:win     # ручний старт
npm run status:native:win    # порти / health / task
npm run update:native:win    # оновлення + restart
npm run backup:native        # pg_dump без Docker
npm run smoke:native:win     # smoke після змін
```

| Компонент | Порт | Публікувати назовні? |
|-----------|------|----------------------|
| nginx (UI + `/api` proxy) | `WEB_PORT` (3000) або 443 (TLS) | **Так** (через Keenetic port forward) |
| Nest API | 3001 | **Ні** (лише localhost / через nginx) |
| PostgreSQL | 5432 | **Ні** |
| MinIO | 9000 / 9001 | **Ні** |

---

## 2. Мережа: LAN + KeenDNS

1. **Статична IP** ноутбука (DHCP reservation на Keenetic).
2. Keenetic → **KeenDNS** → ім’я на кшталт `dim.properservice.keenetic.pro`.
3. **Port forward** на IP ноутбука:
   - **HTTP зараз:** зовнішній `80` → ноут `WEB_PORT` (напр. `3000`), **або** зовнішній `3000` → `3000`.
   - **Пізніше HTTPS:** `80` + `443` → ноут `80`/`443` (якщо nginx з TLS).
4. **Не** пробрасувати `5432`, `9000`, `9001`, `3001`.

Hairpin NAT: з Wi‑Fi будинку часто зручніше ходити на KeenDNS-ім’я; якщо не резолвиться — локальний `http://<IP-ноутбука>:3000`.

---

## 3. `.env` для публічного HTTP (поточний стан)

Поки **немає TLS**, використовуйте `http://` (не `https://`), інакше cookies/PWA ламаються.

```env
# DB / S3 — localhost (не hostname postgres/minio з Docker)
DATABASE_URL=postgresql://dah:...@127.0.0.1:5432/dah
REDIS_URL=none
S3_ENDPOINT=http://127.0.0.1:9000

# Публічний URL (приклад)
DOMAIN=dim.properservice.keenetic.pro
APP_URL=http://dim.properservice.keenetic.pro
CORS_ORIGIN=http://dim.properservice.keenetic.pro
NEXT_PUBLIC_API_URL=http://dim.properservice.keenetic.pro/api

# Поки HTTP — не вмикати secure cookie
# COOKIE_SECURE=true

NODE_ENV=production
JWT_SECRET=...довгий_випадковий...
```

Після зміни **`NEXT_PUBLIC_*`** обов’язково:

```powershell
npm run build
# або
npm run update:native:win
```

(статичний export підставляє URL на етапі build.)

---

## 4. Оновлення без простою «навмання»

```powershell
cd C:\path\to\DAH

# 1) git pull / copy коду — вручну
# 2) install → generate → build → migrate → restart
npm run update:native:win

# лише rebuild + migrate + restart (без npm install)
$env:SKIP_INSTALL = "1"
npm run update:native:win
```

Перед migrate скрипт намагається зробити **pre-update dump** у `backups\pre-update\` (потрібен `pg_dump` у PATH / PostgreSQL bin).

Перевірка:

```powershell
npm run status:native:win
npm run smoke:native:win
# з телефону: http://dim.properservice.keenetic.pro
```

---

## 5. Резервні копії (без Docker)

```powershell
# native-only (рекомендовано на цьому хості)
npm run backup:native

# auto: Docker якщо є, інакше native
npm run backup:win
```

Потрібно: **`pg_dump.exe`** (інсталятор PostgreSQL for Windows зазвичай кладе його в `C:\Program Files\PostgreSQL\<ver>\bin` — додайте в PATH).

Опційно файли MinIO: `mc.exe` у PATH або `tools\mc.exe`.

Marker: `backups\last-backup.json` (health / `/admin/ops`).

Рекомендація: раз на тиждень копіювати `backups\` на OneDrive / зовнішній диск (офсайт).

In-app weekly dump (worker) теж пише в `BACKUP_DIR` — переконайтесь, що worker запущений (`status:native:win`).

---

## 6. Безпека периметра (docs — firewall install **не** змінюємо автоматично)

- На Keenetic назовні **лише** порт(и) на nginx.
- `3001` / Postgres / MinIO — не в internet.
- Змініть seed / `SUPER_ADMIN_*` / `JWT_SECRET` перед відкриттям в інтернет.
- Не лишайте Swagger увімкненим (`SWAGGER_ENABLED`).
- Повний список: [SECURITY-CHECKLIST.md](./SECURITY-CHECKLIST.md).

Ноутбук:

- Живлення від мережі; **не засинати** на AC (Параметри → Живлення).
- UPS бажано.
- Поясніть мешканцям: «сервер організації = ноутбук; уночі/під час сну може бути офлайн» (у UI є NetworkStatusBanner).

---

## 7. HTTPS (opt-in, коли будете готові)

Зараз типово **лише HTTP**. TLS **не** вмикається за замовчуванням.

### 7.1. Сертифікати

- [win-acme](https://www.win-acme.com/) (Let's Encrypt) → PEM у `infra\certs\fullchain.pem` + `privkey.pem`
- або скопіювати cert вручну в `infra\certs\`

### 7.2. Увімкнути nginx :443

```powershell
# один раз (install перерендерить conf)
powershell -File infra\scripts\install-native-windows.ps1 -SkipBuild -SkipMigrate -EnableTls -Domain dim.properservice.keenetic.pro

# або env для start stack:
# DAH_ENABLE_TLS=1 у .env + certs у infra/certs (або SSL_CERT_DIR)
```

Keenetic: проброс **443** → ноут **443**.

### 7.3. `.env` після TLS

```env
APP_URL=https://dim.properservice.keenetic.pro
CORS_ORIGIN=https://dim.properservice.keenetic.pro
NEXT_PUBLIC_API_URL=https://dim.properservice.keenetic.pro/api
COOKIE_SECURE=true
```

Потім `npm run update:native:win` (rebuild web).

Self-signed на телефонах часто **ламає PWA і Web Push** — краще Let's Encrypt.

---

## 8. Швидкий чекліст «з нуля до мешканців»

```text
[ ] Node 20+, PostgreSQL service Automatic, .env на 127.0.0.1
[ ] npm run install:native:win
[ ] npm run smoke:native:win
[ ] Статична IP + KeenDNS + port forward (не 5432/9000/3001)
[ ] APP_URL / CORS / NEXT_PUBLIC_API_URL = http://dim... + rebuild
[ ] Login з телефону (мобільні дані, не лише Wi‑Fi)
[ ] npm run backup:native — є backups\<ts>\
[ ] Оновлення: npm run update:native:win
[ ] (пізніше) TLS + COOKIE_SECURE
```

---

## 9. Типові збої

| Симптом | Дія |
|---------|-----|
| KeenDNS «не відкривається» | Ноут offline/sleep; port forward; `status:native:win` |
| UI є, API 502 | `npm run start:native:win`; логи `logs\native-windows\api.err.log` |
| Login / CORS з телефону | `NEXT_PUBLIC_API_URL` і `CORS_ORIGIN` = публічний host + rebuild |
| Після update 502 | `npm run restart:native:win` або `update:native:win` ще раз |
| backup:native fail | `pg_dump` у PATH; Postgres running |
| PWA не ставиться | Потрібен валідний HTTPS (не self-signed) |

Команди stop/restart:

```powershell
npm run stop:native:win
npm run start:native:win
# або
npm run restart:native:win
```
