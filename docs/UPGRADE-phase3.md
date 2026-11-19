# Оновлення до Phase 3

Коміти поверх тегу `phase2`. Нових міграцій БД **немає** (схема не змінювалась); змінено лише конфіг Prisma.

## 1. RBAC (M15)
- Новий permission `finance_admin` (`@dah/shared`), видається ролям `chairman` і `accountant`.
- Board **може** затверджувати списання боргу (`POST /api/accounting/write-offs/:id/approve`), але maker-checker лишається: свій запис затвердити не можна.
  - Обґрунтування: SPEC/05:290 (`manage finance`) і SPEC/03:12 (board = «Фінанси»).
- Board **не може** робити коригування, закриття року та анулювання переказу. Це закрито permission `finance_admin`.
  - Обґрунтування: SPEC/03:97/108, «Анулювання витрат/платежів», board ❌.
- 110 обробників переведено з `@Roles` на `@RequirePermissions`. Ефективна матриця доступу не змінилась.
- Ефективна матриця доступу лежить у `docs/api/rbac-effective.json`; `npm run openapi:check -w @dah/api` перевіряє, що вона актуальна.

## 2. CSP без 'unsafe-inline' для скриптів (L7)
- `npm run build -w @dah/web` має `postbuild`. Він рахує sha256 усіх inline-скриптів у `out/` і пише `apps/web/.csp/nginx-csp.conf` та `csp-hashes.json`.
- **Docker:** образ web копіює `nginx-csp.conf` у `/etc/nginx/dah-csp/`. Edge nginx (`infra/nginx/nginx*.conf`) більше не ставить власний CSP, а `proxy_buffer_size` збільшено до 32k, бо заголовок має ≈8 КБ. **Оновлюйте edge-конфіг разом з образом web.**
- **Native (Linux/Windows):** `dah-native.conf.in` і `dah-windows.conf.in` включають `@@DAH_ROOT@@/apps/web/.csp/*.conf`. Після оновлення перегенеруйте конфіг nginx інсталятором і зробіть `nginx -s reload`.
- Перевірка в реальному браузері: `CHROME_PATH=/usr/bin/google-chrome npm run test:csp -w @dah/web`.

## 3. Публічні endpoints
- `POST /api/kep/sessions/:id/complete`:
  - прапорець перевіряється до звернення до БД;
  - підпис і сертифікат від клієнта ігноруються;
  - відповідь містить лише `{sessionId,status,signed}`.
- `GET /api/identity/mock/authorize`:
  - сторінка віддається лише для увімкненого mock IdP поза production;
  - `redirect_uri` має бути http(s) з origin `APP_URL` або `IDENTITY_REDIRECT_URI`;
  - сторінка має CSP;
  - кількість pending-state обмежено 10 000.
- `GET /api/auth/apartments`:
  - будинки з `registrationEnabled=false` не показуються;
  - invite-код порівнюється за сталий час.
- Нові env:
  - `IDENTITY_ALLOW_MOCK` (типово дозволено поза production; `false` вимикає mock);
  - `REGISTRATION_REQUIRE_INVITE` (`true` вимикає реєстрацію без коду).

## 4. Журнал як SoT
- `POST /api/journal/sot {buildingId, enabled, force?, reason?}` доступний ролям chairman, accountant і super_admin.
  - Увімкнення можливе лише після серії `JOURNAL_SOT_STREAK_DAYS` (типово 30) днів readyForSot. Інакше повертається 409.
  - `force` дозволено лише super_admin із причиною (≥10 символів); такий запис потрапляє в аудит.
  - Вимкнення (відкат) дозволено завжди.
  - Дані не видаляються, записи й далі dual-run.
- `PATCH /api/building/settings {journalSot:true}` підпорядковується тій самій перевірці.
- `GET /api/journal/sot-readiness` тепер повертає ще `journalSot` і `envOverride`.
- Env `JOURNAL_SOT=true|false`, як і раніше, перевизначає налаштування для всієї інсталяції.

## 5. Web і @dah/api-client
- Web залежить від `@dah/api-client`. Образ web збирає цей пакет.
- Тіла запитів login, register, forgot/reset і change-password перевіряються за OpenAPI DTO на етапі `typecheck:web`.

## 6. Prisma 7
Див. окремий розділ «Prisma 7» нижче.

## Prisma 7 (окремий коміт)
- Версія: `prisma` / `@prisma/client` / `@prisma/adapter-pg` **7.10.1**. Генератор `prisma-client-js` залишено, тому імпорти `@prisma/client` не змінювались. Перехід на `prisma-client` — окремий крок у майбутньому.
- `url` прибрано з `schema.prisma`. CLI читає `DATABASE_URL` з `apps/api/prisma.config.ts`; Docker-образ api копіює цей файл.
- Runtime: `PrismaService` використовує `PrismaPg` (`src/prisma/prisma-adapter.ts`). Параметри пулу відповідають Prisma 6:
  - `connection_limit`: типово num_cpus×2+1;
  - `connect_timeout` / `pool_timeout`: 5 с;
  - `schema=` передається в search_path.
  Ці параметри вирізаються з URL перед передачею в node-postgres.
- Prisma 7 **не читає .env сам**. Скрипти `db:migrate` і `db:migrate:dev` уже використовують `dotenv -e ../../.env`. Якщо викликаєте `npx prisma …` вручну, експортуйте `DATABASE_URL`.
- `prisma migrate dev` більше не запускає seed і generate автоматично. Seed: `npm run db:seed -w @dah/api`.
- SSL: node-postgres перевіряє сертифікати суворіше, ніж Prisma 6. Для самопідписаного сертифіката задайте `NODE_EXTRA_CA_CERTS` або `sslmode` у URL.
- Міграцій схеми немає. `npm audit` після оновлення: 0 high, 0 critical; лишились 5 moderate, з них 2 у production-залежностях.

## Кроки оновлення
1. `git pull` (або застосуйте патч), потім `npm ci`.
2. `npm run build` — збирає api-client, згенерує Prisma Client і CSP.
3. Docker: `npm run update:prod` (або перезберіть образи api і web та оновіть edge nginx-конфіг одночасно). Native: запустіть скрипт оновлення native і перегенеруйте конфіг nginx.
4. За бажанням додайте в `.env` `REGISTRATION_REQUIRE_INVITE=true` і `IDENTITY_ALLOW_MOCK=false`.
5. Перевірте в браузері, що в консолі немає CSP-помилок, а `/api/health/ready` повертає 200.
