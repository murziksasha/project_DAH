# DAH — специфікація проєкту

Ця папка містить технічну та продуктову документацію платформи **DAH** (self-hosted аналог [ДАХ](https://dah-online.com/) для одного ОСМД/ОСББ).

## Зміст

| Документ | Опис |
|----------|------|
| [01-overview.md](./01-overview.md) | Мета, scope MVP, ключові рішення |
| [02-architecture.md](./02-architecture.md) | Стек, структура monorepo, Docker, потоки даних |
| [03-roles-and-access.md](./03-roles-and-access.md) | Ролі, RBAC, матриця доступу |
| [04-data-model.md](./04-data-model.md) | Модель даних PostgreSQL (Prisma) |
| [05-api-reference.md](./05-api-reference.md) | REST API: ендпоінти та авторизація |
| [06-finance.md](./06-finance.md) | Фінанси: фонди, витрати, нарахування, платежі, FIFO |
| [07-communications.md](./07-communications.md) | Оголошення, заявки, опитування, Web Push |
| [08-resident-portal.md](./08-resident-portal.md) | Кабінет мешканця, прозорість, PWA |
| [09-operations.md](./09-operations.md) | Deploy, backup, аудит, безпека |
| [10-testing.md](./10-testing.md) | Стратегія тестування, команди, CI |
| [11-roadmap.md](./11-roadmap.md) | Завершені фази та можливий розвиток |

## Пов'язані документи

- [README.md](../README.md) — швидкий старт
- [docs/DEPLOY.md](../docs/DEPLOY.md) — production-розгортання
- [docs/TESTING.md](../docs/TESTING.md) — детальний гайд з тестів
- Swagger (runtime): `http://localhost:3001/api/docs`

## Версія

- **MVP:** v0.1.0
- **Останнє оновлення специфікації:** 2026-06-25
- **Модель tenancy:** single-tenant (1 Docker = 1 будинок)