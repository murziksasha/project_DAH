# Оновлення до Phase 4

Коміти поверх тегу `phase3`. **Міграцій БД немає**, нових env немає.

## 1. npm audit = 0
Додано вузькі `overrides` у кореневий `package.json`:
- `@nestjs/cli` → `glob@^14.0.6`;
- `exceljs` → `uuid@^11.1.1` (CJS; перевірено генерацію xlsx).

Після оновлення: `npm audit` → 0 вразливостей.

## 2. RBAC: решта @Roles → permissions
Нові permissions у `@dah/shared`:
- `manage_communications` — board і chairman (SPEC/03:12, 36–37);
- `read_audit` — auditor і chairman (SPEC/03:15);
- `platform_admin` — тільки super_admin (SPEC/03:9).

Що переведено:
- 37 обробників (Journal, Audit, Mail, Meetings, Meters, Backups, Copilot, Reminders, періоди, шаблони документів, approve/reject реєстрацій, опитування);
- `@Roles` у контролерах: 41 → 12.

Diff ефективної матриці (`docs/api/rbac-effective.json`) = 0: доступ ні для кого не змінився.

Лишились на `@Roles` набори без точного відповідника в SPEC або в permissions:
- оновлення будинку і налаштувань (board + chairman + super_admin);
- рахунок і квитанції квартири (без super_admin; SPEC/03:9 — «без фін. операцій»);
- черга заявок з accountant;
- голосування та завантаження файлів з resident;
- глобальний пошук і портфель.

## 3. Prisma: генератор `prisma-client`
- Генератор `prisma-client-js` (deprecated) замінено на `prisma-client` (`moduleFormat = "cjs"`).
- Клієнт генерується в `apps/api/src/generated/prisma` (у `.gitignore`) і компілюється разом з API.
- Імпорти: `src/prisma/client.ts` замість `@prisma/client` (82 файли).
- **Перед `tsc` / `jest` потрібен `npm run db:generate -w @dah/api`.** Скрипти `build`, `typecheck` і `check` уже роблять це самі; Dockerfile api — теж.

## 4. OpenAPI: схеми відповідей
- `apps/api/scripts/response-schemas.ts` виводить схему відповіді з реального TypeScript-типу, який повертає кожен обробник, і вставляє її в `docs/api/openapi.json`.
- Покрито 267/267 операцій. Явні `@ApiOkResponse` мають пріоритет.
- `npm run openapi:check` ловить розходження між кодом і документацією.
- `@dah/api-client` перегенеровано. У web з'явився тип `ApiResponse<'/path', 'get'>`; 62 GET-виклики в 30 файлах використовують згенеровані типи.

## Кроки оновлення
1. Застосуйте патч, потім `npm ci`.
2. `npm run build` (генерує Prisma Client і CSP).
3. Docker: `npm run update:prod`. Native: скрипт оновлення native.
4. Нічого міняти в `.env` не потрібно.
