# Next.js Security Upgrade — 2026-11-20

TASK-GDMS-SECURITY-01 (Agent-1). Isolated remediation of the Next.js advisories
published on 2026-11-16/17/19. The original baseline checkout was not modified.

## Scope

| Item | Value |
| --- | --- |
| Baseline commit | `c2c0411e8d281225df84a78f358161fb4f376e7e` |
| Baseline branch / tag | `baseline/2026-11-20` / `baseline-2026-11-20` |
| Security branch | `security/nextjs-nov-2026` |
| Previous Next.js | `16.4.3` |
| New Next.js | `16.4.6` (current `latest`; no canary/prerelease) |
| React / React DOM | `19.3.1` / `19.3.1` (unchanged; already latest stable) |
| Node.js (validation env) | `22.23.5` (Next requires `>=20.9.0`) |

## Advisories and applicability

All seven advisories are fixed in **16.4.5**; 16.4.6 contains 16.4.5 plus the
16.4.6 backported bug fixes. npm's advisory range for this release line is
`16.0.0 - 16.4.4`, so 16.4.6 is outside the affected range.

| GHSA | CVE | Affected (16.x) | Patched | Exposure in this app |
| --- | --- | --- | --- | --- |
| GHSA-mfr8-8qww-v76h | CVE-2026-119790 | 16.3.0–16.4.4 | 16.4.5 | Not reachable: no `use cache`, `unstable_cache()`, or root-param usage. |
| GHSA-vc7v-qv4w-wrv8 | CVE-2026-119351 | 16.2.0–16.4.4 | 16.4.5 | Not reachable: Cache Components / `use cache` are not enabled or used. |
| GHSA-7qx7-33qx-rqx2 | CVE-2026-119347 | 16.0.0–16.4.4 | 16.4.5 | No `next/image`, no `images` config, no SVG assets; the app uses plain `<img>`. Endpoint still patched. |
| GHSA-f3mh-rxg3-f5g2 | CVE-2026-119346 | 16.0.0–16.4.4 | 16.4.5 | Not reachable: no Edge runtime routes, no `NextResponse`, no cookie/header mutation. |
| GHSA-pc58-hwjq-p385 | CVE-2026-119348 | 16.0.0–16.4.4 | 16.4.5 | Self-hosted, but no App Router route handlers forward upstream `Response` objects; `/api/*` is a `next.config.mjs` rewrite. |
| GHSA-rhh4-g77r-r9qj | CVE-2026-119349 | 16.0.0–16.4.4 | 16.4.5 | Not reachable: no `use cache` (and therefore no binary cache arguments). |
| GHSA-vvgp-ww4w-46vf | CVE-2026-119350 | 16.4.0–16.4.4 | 16.4.5 | Not reachable: `cacheComponents` is not enabled; no `generateStaticParams`. |

No application code changed to work around an advisory: upgrading is the complete
fix, and the currently used feature set was never affected at runtime.

## Changed files

- `apps/web/package.json` — `next` `^16.4.3` → `^16.4.6`.
- `package-lock.json` — only 10 Next.js package entries changed (the `next`
  package, `@next/env`, and the eight `@next/swc-*` platform binaries), all
  `16.4.3` → `16.4.6`. No unrelated dependency was upgraded.

## Validation (all executed in the isolated worktree)

| Gate | Command | Result |
| --- | --- | --- |
| Clean install | `npm ci` | PASS — 598 packages from the updated lockfile |
| Typecheck | `npm run typecheck` | PASS — packages, API and Web |
| OpenAPI lint | `npm run openapi:check` | PASS — 239 paths / 336 operations / 239 schemas / 3 webhooks |
| Contract drift | `node scripts/contract-drift.mjs` | PASS — 336/336 operations, 0 drift |
| Test partition | `node scripts/check-test-partition.mjs` | PASS — 131 test files, manifest == computed |
| Dead-code scan | `npm run dead-code:scan` | PASS — 0 orphans / 494 source files |
| Web unit tests | `npm run test:web` | PASS — 30 files / 167 tests |
| API unit tests | partition `unit` + Vitest | PASS — 62 files / 1009 tests (+1 skipped) |
| Production build | `npm run build` | PASS — Next.js 16.4.6, 59 static pages, exit 0 |

### Original `SecurityFatalError`

The baseline 16.4.3 build stopped on the first run with
`SecurityFatalError: Your version of Next.js is affected by a known security
vulnerability.` On 16.4.6 the production build completes on the first run with
no security nudge and no `SecurityFatalError`/`UpgradeNudgeError` in the log.

## npm audit

| Run | Total | Next.js present? | Remaining findings |
| --- | --- | --- | --- |
| Before (16.4.3) | 8 (4 moderate, 4 high) | Yes — 7 advisories | `@nestjs/cli`, `minimatch`, `stream-json`, `minio`, `decode-uri-component`, `query-string`, `xlsx` |
| After (16.4.6) | 7 (3 moderate, 4 high) | **No** | same non-Next packages |

Limitations:

- `npm audit` is lockfile-based; it proves the affected package version is gone,
  not that a vulnerability is reachable or unreachable at runtime.
- It does not model deployment topology (reverse proxies, HTTP/1.1 pipelining,
  CDN, cache handlers), so reachability was assessed separately from the code.
- Dev-only findings are mixed with production findings; `npm audit --omit=dev`
  still reports 5 findings, all from `minio` (direct/transitive) and `xlsx`.

## Remaining security concerns (not changed here)

- `xlsx@0.18.5` is flagged high with **no fix available** (`fixAvailable: false`).
  It should be tracked separately (replace/limit the export path, or vendor an
  approved patch).
- `minio` is flagged high and its suggested fix is a semver-major upgrade to
  `7.1.3`, outside this task's scope. The vulnerable transitive chain is
  `minio → query-string → decode-uri-component`.
- `@nestjs/cli` / `minimatch` / `stream-json` findings are development-time.
- Docker base image `node:22-alpine` and `minio/minio` use floating tags; pinning
  by digest would reduce supply-chain drift but is a separate change.

## Not executed (infrastructure unavailable)

- `integration-db` (PostgreSQL/PostGIS), `integration-storage` (MinIO),
  `test:migrations`, and Playwright E2E. No PostgreSQL on `127.0.0.1:5432`, and
  neither Docker nor `psql` is installed in this environment.
- Android builds (the baseline documents that they do not yet build).

These must run in CI or a host with the required services before production
release; they are not claimed as passing here.
