# Мій дім — специфікація проєкту

Технічна та продуктова документація платформи **«Мій дім»** — self-hosted кабінет для **ОСББ** і **управляючих компаній (УК)**: фінанси, нарахування, прозорість, PWA.

> Технічні імена репозиторію/пакетів (`project_DAH`, `@dah/*`) можуть лишатися legacy; **продуктова назва** — «Мій дім».  
> Комерційний сервіс [dah-online.com](https://dah-online.com/) — лише орієнтир за класом продукту, не бренд.

## Зміст

| Документ | Опис |
|----------|------|
| [01-overview.md](./01-overview.md) | Мета, scope, ОСББ і УК |
| [02-architecture.md](./02-architecture.md) | Стек, monorepo, Docker |
| [03-roles-and-access.md](./03-roles-and-access.md) | Ролі RBAC + labels ОСББ/УК |
| [04-data-model.md](./04-data-model.md) | Prisma: Tenant.orgType, multi-building |
| [05-api-reference.md](./05-api-reference.md) | REST API |
| [06-finance.md](./06-finance.md) | Фінанси |
| [07-communications.md](./07-communications.md) | Комунікації |
| [08-resident-portal.md](./08-resident-portal.md) | Кабінет мешканця, PWA |
| [09-operations.md](./09-operations.md) | Deploy, backup, безпека |
| [10-testing.md](./10-testing.md) | Тести, CI |
| [11-roadmap.md](./11-roadmap.md) | Roadmap |
| [12-organization-types.md](./12-organization-types.md) | ОСББ vs УК |

## Пов'язані документи

- [README.md](../README.md) — швидкий старт
- [docs/DEPLOY.md](../docs/DEPLOY.md) — production
- [docs/TESTING.md](../docs/TESTING.md) — тести
- Swagger: `http://localhost:3001/api/docs` (title: **Мій дім API**)

## Версія

- **Продукт:** Мій дім  
- **Код (package):** див. root `package.json`  
- **Останнє оновлення SPEC:** 2026-08-01  
- **Tenancy:** multi-tenant (`Tenant`) + multi-building; `orgType`: `osbb` \| `management_company`
