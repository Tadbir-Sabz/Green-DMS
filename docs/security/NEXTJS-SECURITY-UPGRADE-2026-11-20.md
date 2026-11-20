# Next.js Security Upgrade — 2026-11-20

TASK-GDMS-SECURITY-01 (Agent-1). Isolated remediation of the Next.js advisories
published on 2026-11-16/17/19. The original baseline checkout was not modified.

## Scope

| Item | Value |
| --- | --- |
| Baseline commit | `c2c0411e8d281225df84a78f358161fb4f376e7e` |
| Baseline branch / tag | `baseline/2026-11-20` / `baseline-2026-11-20` |
| Security branch | `security/nextjs-nov-2026` |
| Integration branch | `integration/security-nextjs-2026-11`, based on `origin/main` at `1a58aed5b5b7225a3d7d439043cacd09a0e51eef` (cherry-pick of `00c9096`; baseline commit `c2c0411` not included) |
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
| GHSA-mfr8-8qww-v76h | CVE-2026-119790 | 16.3.0–16.4.4 | 16.4.5 | Not present on inspected application code paths: no `use cache`, `unstable_cache()`, or root-param usage. |
| GHSA-vc7v-qv4w-wrv8 | CVE-2026-119351 | 16.2.0–16.4.4 | 16.4.5 | Not present on inspected application code paths: Cache Components / `use cache` are not enabled or used. |
| GHSA-7qx7-33qx-rqx2 | CVE-2026-119347 | 16.0.0–16.4.4 | 16.4.5 | No `next/image` import and no `images` config; the app uses plain `<img>`. The only SVG is the static app icon `apps/web/src/app/icon.svg`, which is served directly, not through the optimizer. `/_next/image` exists, but SVG optimization is disabled (`dangerouslyAllowSVG` defaults to false), so SVG requests through `/_next/image` return HTTP 400. Static `/icon.svg` requests are served normally. Endpoint still patched. |
| GHSA-f3mh-rxg3-f5g2 | CVE-2026-119346 | 16.0.0–16.4.4 | 16.4.5 | Not present on inspected application code paths: no Edge runtime routes, no `NextResponse`, no cookie/header mutation. |
| GHSA-pc58-hwjq-p385 | CVE-2026-119348 | 16.0.0–16.4.4 | 16.4.5 | Self-hosted, but no App Router route handlers forward upstream `Response` objects; `/api/*` is a `next.config.mjs` rewrite. |
| GHSA-rhh4-g77r-r9qj | CVE-2026-119349 | 16.0.0–16.4.4 | 16.4.5 | Not present on inspected application code paths: no `use cache` (and therefore no binary cache arguments). |
| GHSA-vvgp-ww4w-46vf | CVE-2026-119350 | 16.4.0–16.4.4 | 16.4.5 | Not present on inspected application code paths: `cacheComponents` is not enabled; no `generateStaticParams`. |

Reachability above is based on static code inspection only. It has not been
established through runtime exploit testing.

No application code changed to work around an advisory. The seven identified
Next.js advisories are remediated by the upgrade. No affected feature was found
on the inspected application code paths. Runtime exploit testing was not
performed.

## Changed files

- `apps/web/package.json` — `next` `^16.4.3` → `^16.4.6`.
- `package-lock.json` — 10 installed Next.js package entries changed (the `next`
  package, `@next/env`, and the eight `@next/swc-*` platform binaries), all
  `16.4.3` → `16.4.6`; the `apps/web` workspace dependency range for `next` also
  changed (`^16.4.3` → `^16.4.6`). No unrelated dependency was upgraded.

## Validation (security worktree)

| Gate | Command | Result |
| --- | --- | --- |
| Clean install | `npm ci` | PASS — 598 packages from the updated lockfile |
| Typecheck | `npm run typecheck` | PASS — packages, API and Web |
| OpenAPI lint | `npm run openapi:check` | PASS — 239 paths / 336 operations / 239 schemas / 3 webhooks |
| Contract drift | `node scripts/contract-drift.mjs` | PASS — 336/336 operations, 0 drift |
| Test partition | `node scripts/check-test-partition.mjs` (security worktree) | PASS — 131 test files, manifest == computed |
| Dead-code scan | `npm run dead-code:scan` (security worktree) | PASS — 0 orphans / 494 source files |
| Web unit tests | `npm run test:web` | PASS — 30 files / 167 tests |
| API unit tests | partition `unit` + Vitest | PASS — 62 files / 1009 tests (+1 skipped) |
| Production build | `npm run build` | PASS — Next.js 16.4.6, 59 static pages, exit 0 |

### Integration revalidation

The gates above were re-run on `integration/security-nextjs-2026-11`. Results
matched, with two exceptions in how the helpers had to be invoked. The committed
integration branch intentionally does not contain two baseline-only helpers:
`scripts/dead-code-scan.mjs` (and its `dead-code:scan` script) and the CRLF fix
in `scripts/check-test-partition.mjs`. Consequently:

- `node scripts/check-test-partition.mjs` does not pass natively on this CRLF
  checkout; the partition result was obtained with a temporary LF-tolerant copy.
- `npm run dead-code:scan` does not exist on this branch; the dead-code result
  was obtained with a temporary copy of the existing helper from the security
  worktree.
- Both temporary copies were deleted afterwards, and no baseline-only file
  entered the branch.
- These temporary validations are not equivalent to executing the two exact
  commands natively from the committed integration branch.

The independently verified CI finding is unchanged: `.github/workflows/ci.yml`
runs on `ubuntu-latest` with `actions/checkout@v4` and no CRLF override, so the
Windows CRLF issue does not currently block that CI workflow.

### Original `SecurityFatalError`

The baseline 16.4.3 build stopped on the first run with
`SecurityFatalError: Your version of Next.js is affected by a known security
vulnerability.` On 16.4.6 the production build completes on the first run with
no security nudge and no `SecurityFatalError`/`UpgradeNudgeError` in the log.

## npm audit

| Run | Total | Next.js present? | Remaining findings |
| --- | --- | --- | --- |
| Before (16.4.3) | 8 (4 moderate, 4 high) | Yes — 7 advisories | Production: `stream-json`, `minio`, `decode-uri-component`, `query-string`, `xlsx`. Development: `@nestjs/cli`, `minimatch`. |
| After (16.4.6) | 7 (3 moderate, 4 high) | **No** | Production: `stream-json` (moderate), `minio`, `decode-uri-component`, `query-string`, `xlsx` (high). Development: `@nestjs/cli`, `minimatch` (moderate). |

Limitations:

- `npm audit` is lockfile-based; it proves the affected package version is gone,
  not that a vulnerability is reachable or unreachable at runtime.
- It does not model deployment topology (reverse proxies, HTTP/1.1 pipelining,
  CDN, cache handlers), so reachability was assessed separately from the code.
- Dev-only findings are mixed with production findings; `npm audit --omit=dev`
  still reports 5 findings: the production `minio` chain (`minio`,
  `query-string`, `decode-uri-component`, `stream-json`) and `xlsx`.

## Remaining security concerns (not changed here)

- `xlsx@0.18.5` is flagged high with **no fix available** (`fixAvailable: false`).
  It should be tracked separately (replace/limit the export path, or vendor an
  approved patch).
- `minio` is flagged high and its suggested fix is `minio@7.1.3`, which is a
  **downgrade** from the installed `8.0.7` (npm marks it `isSemVerMajor`), not an
  upgrade; it was therefore not applied. The vulnerable transitive chain is
  `minio → query-string → decode-uri-component`. `stream-json@1.9.1` is also a
  production transitive dependency of `minio` (notification parsing), though the
  app never calls `listenBucketNotification`.
- `@nestjs/cli` / `minimatch` findings are development-time.
- Docker image references use floating tags, not digest pins: `node:22-alpine`
  (both `apps/api/Dockerfile` and `apps/web/Dockerfile`), `minio/minio` (the
  `docker-compose.yml` default), `postgis/postgis:16-3.4`, and `redis:7-alpine`.
  Pinning by digest would reduce supply-chain drift but is a separate change.

### Reachability of remaining audit findings

| Package | Scope | Evidence | Status |
| --- | --- | --- | --- |
| `xlsx@0.18.5` | production | Imported only in `apps/web/src/lib/export/index.ts` for client-side export. The prototype-pollution advisory `GHSA-4r6h-8v6p-xvw6` explicitly states that export-only workflows are unaffected; the ReDoS advisory `GHSA-5pgg-2g8v-p4x9` does not make that explicit exemption. The write-only path was assessed as not reaching the vulnerable parsing path; no fixed version exists. | Write-only confirmed by code inspection; runtime exploit testing was not performed. |
| `minio@8.0.7` | production | The application calls the documented MinIO client methods. MinIO's inspected code paths use `qs.stringify`; `decode-uri-component` was not found on those inspected paths. | Call sites confirmed by code inspection; runtime unverified. |
| `query-string@7.1.3` | production (transitive via `minio`) | Reached only through the `minio` chain above. | Assumed not reachable; runtime unverified. |
| `decode-uri-component@0.2.2` | production (transitive via `query-string`) | Not invoked on the inspected `minio` stringify paths. | Assumed not reachable; runtime unverified. |
| `stream-json@1.9.1` | production (transitive via `minio`) | Used by `minio` notification parsing; the app never calls `listenBucketNotification`. | Assumed not reachable; runtime unverified. |
| `@nestjs/cli`, `minimatch` | development | Absent from a production install (`npm audit --omit=dev` excludes them). | Not applicable at runtime. |

## Not executed (infrastructure unavailable)

- `integration-db` (PostgreSQL/PostGIS), `integration-storage` (MinIO),
  `test:migrations`, and Playwright E2E. No PostgreSQL on `127.0.0.1:5432`, and
  neither Docker nor `psql` is installed in this environment.
- Android builds (the baseline documents that they do not yet build).

These must run in CI or a host with the required services before production
release; they are not claimed as passing here.
