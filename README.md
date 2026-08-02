# Мій дім — платформа для ОСББ та УК

Self-hosted кабінет для **ОСББ** і **управляючих компаній (УК)**: фінанси, внески, прозорість, PWA, multi-building.

> Технічний каталог/пакети можуть називатися `project_DAH` / `@dah/*` — **продуктова назва**: **Мій дім**.

## Швидкий старт (Docker)

```bash
cp .env.example .env
docker compose up -d
```

- **PWA / Web**: http://localhost:8080
- **API**: http://localhost:3001/api
- **Swagger**: http://localhost:3001/api/docs (**Мій дім API**)
- **MinIO Console**: http://localhost:9001

Після першого запуску API застосує міграції. Заповніть демо-дані:

```bash
docker compose exec api npx ts-node prisma/seed.ts
```

## Демо-облікові записи

| Email | Пароль | Роль |
|-------|--------|------|
| chairman@osbb.local | password123 | Голова / керівник |
| accountant@osbb.local | password123 | Бухгалтер |
| auditor@osbb.local | password123 | Ревізійна комісія |
| resident@osbb.local | password123 | Мешканець |

Демо-організація: `orgType = osbb`. Super-admin може створити **УК** на `/admin/tenants`.

## Локальна розробка

```bash
npm install
docker compose up -d postgres redis minio minio-init
cp .env.example .env
```

Далі: `npm run dev` (або окремо `dev:api` / `dev:web`). Документація: [SPEC/](./SPEC/).

## Організації

| Тип | Код | Призначення |
|-----|-----|-------------|
| ОСББ | `osbb` | Самоуправління співвласників |
| УК | `management_company` | Управляюча компанія, портфель будинків |

Деталі: [SPEC/12-organization-types.md](./SPEC/12-organization-types.md).

Поточна версія: **1.8.0** — [CHANGELOG.md](./CHANGELOG.md), [SPEC/](./SPEC/).
Конструктор квитанцій / звітів: `/admin/document-templates`.
