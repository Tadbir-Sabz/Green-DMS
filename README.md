# GreenDMS — سامانه فروش و پخش مویرگی

A multi-tenant **Distribution Management System (DMS)** for sales and capillary
distribution (پخش مویرگی) in the Iranian market: sales orders, tours and field
visits, inventory and transfers, AR/AP/treasury/GL finance, a rules engine, live
GPS tracking, Moadian e-invoicing, and Persian (RTL, Jalali calendar) UIs.

> **Status:** backend (`apps/api`) and web (`apps/web`) are the active, tested
> surfaces. The three Android apps (`android/apps/*`) are present but **do not
> yet build** — see `ANDROID_STEPS_PRIORITY.md`.

> **Product direction:** the canonical, evidence-driven module roadmap and
> completion policy are maintained in [`PRODUCT_ROADMAP.md`](./PRODUCT_ROADMAP.md).
> Read it before planning or starting new product-module work.

---

## Monorepo layout

```
apps/
  api/          NestJS 12 REST API (TypeScript) — the system of record
  web/          Next.js 16 + React 19 + Tailwind 4 admin app (Persian, RTL)
packages/
  contracts/    OpenAPI 3 document (openapi.yaml) — the single source of truth
  api-client/   TypeScript client generated from the contract (openapi-fetch)
android/
  apps/         salesman, distributor, telesales (Kotlin/Compose — WIP)
  client/       generated Kotlin API client
migrations/     33 numbered up/down SQL pairs (PostgreSQL + PostGIS), 152 tables
scripts/        migrate, seed, OpenAPI lint, client generation, contract drift
docs/           design report, deployment guides, assets
```

The API and the web client are both driven by `packages/contracts/openapi.yaml`.
`scripts/contract-drift.mjs` fails CI if the server's real routes and the
contract diverge (currently **103 paths / 160 operations / 67 schemas**, fully
aligned).

## Stack

- **API:** NestJS 12, TypeScript, PostgreSQL 16 + PostGIS, Redis, MinIO/S3
- **Web:** Next.js 16 (App Router), React 19, Tailwind 4, TanStack Query,
  recharts, self-hosted Vazirmatn font, Jalali date handling
- **Contract:** OpenAPI 3 + `openapi-typescript` / `openapi-fetch`
- **Node:** >= 20

## Quick start (local)

```bash
# 1. Install dependencies (also builds the shared packages via `prepare`)
npm ci

# 2. Configure environment
cp .env.example .env        # then edit DATABASE_URL, JWT_SECRET, etc.

# 3. Start infrastructure (Postgres/PostGIS, Redis, MinIO)
docker compose up -d postgres redis minio

# 4. Create the schema and load demo data
npm run db:migrate
npm run db:seed-demo

# 5. Run the apps (in separate terminals)
npm run dev:api             # http://localhost:4000/api/v1
npm run dev:web             # http://localhost:3000
```

The web app calls the API under the `/api/v1` prefix. By default the base URL is
**relative** (same-origin) and the Next server proxies `/api/*` to the backend
(`API_PROXY_TARGET`, default `http://127.0.0.1:4000`). So the browser never
assumes the API sits on its own `localhost` — which is what breaks login behind a
reverse proxy / preview URL / remote host — and no CORS is required. To call an
API on a **separate origin** directly instead, set `NEXT_PUBLIC_API_URL` at
**build** time (it is inlined into the browser bundle); the proxy is then unused.

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev:api` / `dev:web` | Run the API / web app in watch mode |
| `npm run build` | Build packages, then API, then web |
| `npm run build:packages` | Build `contracts` and `api-client` (run by `prepare`) |
| `npm run typecheck` | Typecheck packages, API, and web |
| `npm run test` | Run API + web test suites |
| `npm run test:api` / `test:web` | Run only the API / web tests |
| `npm run openapi:check` | Validate `openapi.yaml` |
| `npm run clients:generate` | Regenerate the TypeScript/Kotlin clients |
| `npm run db:migrate` / `db:rollback` / `db:status` / `db:reset` | Manage migrations |
| `npm run db:seed-demo` | Seed demo data |
| `npm run test:migrations` | Verify every migration applies and rolls back |

`node scripts/contract-drift.mjs` compares the API's registered routes against
the OpenAPI document (`--allow-drift` to report without failing).

## Testing

- **Web** (`apps/web`): Vitest + Testing Library (unit/component). No database
  required — `npm run test:web`.
- **API** (`apps/api`): Vitest. Each test file **self-bootstraps** a throwaway
  PostGIS database and applies all migrations in one transaction via the `psql`
  CLI, so it needs a reachable PostgreSQL server and a `psql` binary:
  - `DATABASE_URL` — a **superuser** connection string (the tests `CREATE
    DATABASE` from it)
  - `PSQL` — path to the `psql` executable (defaults to a Windows path; set it
    to `psql` on Linux/macOS)

  Tests run sequentially (`fileParallelism: false`) to stay under
  `max_locks_per_transaction`.

## Deployment

- `docker-compose.yml` runs the full stack (postgres, redis, minio, api, web).
  The web defaults to a **relative** API base and the Next server proxies
  `/api/*` to the `api` container (`API_PROXY_TARGET=http://api:4000`), so it
  works for local and remote deploys without CORS or a browser-side host
  assumption. `NEXT_PUBLIC_API_URL` (a build-arg, inlined into the web bundle)
  overrides this to call a separate API origin directly.
- `.env.production.example` documents every variable the code actually reads
  (API, web, SMS, Moadian, PSP, storage). Copy and fill it for production.
- See `docs/deploy/PRODUCTION_DEPLOYMENT.md` and `docs/deploy/CHECKLIST.md`.

## Conventions

- Money and other exact decimals cross the API as **strings** (numeric) to avoid
  float precision loss; the web formats them with Persian digits.
- Dates are stored Gregorian and displayed in the **Jalali** calendar.
- Multi-tenancy is enforced per-request via a tenant-aware connection pool and
  Postgres GUCs (`apps/api/src/database/`).
- Access control is RBAC: permissions are seeded in migration `0022` and
  checked by API guards and the web `RoleGuard` / nav filtering.
