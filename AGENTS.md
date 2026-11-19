# Working in project_DAH

**Мій дім** is a self-hosted platform for Ukrainian homeowners’ associations (ОСББ) and management companies (УК). Use the Ukrainian product name in user-facing copy and the existing `@dah/*` names in code.

## Where to make changes

- `apps/api` contains the NestJS API and background worker. The Prisma schema, migrations, and seed are in `apps/api/prisma`.
- `apps/web` contains the Next.js PWA. Admin and resident routes live under `src/app`, reusable components under `src/components`, and browser end-to-end tests under `e2e`.
- `packages/shared` contains permission definitions and document template types used across workspaces. Check these definitions when changing roles or template fields.
- `packages/money` provides arithmetic in integer kopiiky. Use its conversion helpers where an API, database field, or display expects hryvnia.
- `packages/api-client` contains the shared API client. `packages/native-cli` and `infra` contain native host tooling and deployment scripts.

Keep tenant and building scope explicit when changing data access. A disabled organization blocks access for its members, including existing sessions. For authorization changes, consult the [role model](SPEC/03-roles-and-access.md) and [organization types](SPEC/12-organization-types.md).

## Local development

Run npm commands from the repository root. CI uses Node.js 22 and installs the locked workspace dependencies with `npm ci`.

For a fresh checkout, copy `.env.example` to `.env` and follow the [README](README.md) for database setup and demo data. With Docker available, `npm run dev` stops the containerized application services, starts PostgreSQL and MinIO, and launches the API and web development servers locally.

## Checking changes

| Command | What it checks |
| --- | --- |
| `npm run check` | Builds shared dependencies, generates the Prisma client, type-checks the API and web app, and runs workspace unit tests. |
| `npm test` | Runs the API unit suite. |
| `npm run test:e2e` | Runs API integration tests. Set up the dedicated `dah_test` database first. |
| `npm run test:e2e:web` | Runs Playwright against a running API and web app with seeded demo data. |

See the [testing guide](SPEC/10-testing.md) for database and browser setup.
