# TASK-PM-02 — Product Master Core Development Resumption (PM-02-B1)

**Agent:** Agent-1 (implementation and tests). Independent Agent-2 review was not requested: this increment does not change a security/authorization acceptance gate for the blocked domain model; it adds a fail-closed boundary and a read-only projection.
**UTC date:** 2026-11-11 (sandbox UTC clock at final verification). Arena session metadata reports 2026-11-07; the commit SHA, GitHub/CI timestamps and the exact-final-SHA check runs are the authoritative evidence anchors.
**Repository:** `Tadbir-Sabz/Green-DMS` · **Branch:** `arena/be5eaff3-green-dms` · **PR #14:** `OPEN / DRAFT`, base `main`.
**Required starting / baseline SHA:** `c382d6a822fdf52b711f168f1778443a70194a24`.
**Final PM-02 SHA and exact-final-SHA CI IDs:** recorded in the PR #14 body and the final chat report, not hardcoded in this self-referential tree (same convention as `TASK-PM-01D-M4-K_IMPLEMENTATION.md`). `evidence/task-pm-02/VERIFICATION.txt` and `VERIFICATION.json` carry the durable local command/result ledger.

---

## 1) Scope, durability and boundaries

Before any modification, `git fetch origin arena/be5eaff3-green-dms` completed; repository, branch, local HEAD, `origin/arena/be5eaff3-green-dms`, `git ls-remote`, the GitHub branch ref and PR #14 head all equaled `c382d6a822fdf52b711f168f1778443a70194a24`. PR #14 was `OPEN / DRAFT` with base `main`; body 64,938 chars / 69,638 bytes / sha256 `b49df47b871679775c44a763704886a8c3bf4955bbcc18bc4607571f08c993da`; worktree 0 porcelain lines; `git diff --check EXIT=0`. A verifiable pre-change backup was created at `/home/user/pm02-backup/`, `/home/user/pm02-backup.tar.gz` (sha256 `3deb84dd66de0f250e22a3d6886d095e538133e4cc95a30a70d49737cd69ebc2`) with 2,826 tracked files, `repo.bundle`, PR/branch snapshots and 2,837 checksum entries; 0 copied-file mismatches.

No force-push, `--force-with-lease`, destructive reset, rebase or history rewrite was used. Only ordinary pushes were used. PR #14 readiness was not changed; no merge, approval, release, deployment, production database/infrastructure/secret, external service, deployment configuration or CI trigger change was made. No historical M4 verdict was changed and M4 acceptance work was not repeated. No production-readiness claim is made.

## 2) Actual implementation map and capability selection

`TASK-PM-02_IMPLEMENTATION_MAP.md` is the concise, code-verified map: what exists/works, what is partial, what is missing, what is blocked by owner decisions, and what can proceed. `TASK-PM-02_OWNER_DECISION_REGISTER.md` is the compact PM-B1..PM-B8 / Q1..Q5 register plus the exact G-03 two-person investigation.

**Selected highest-value capability with approved semantics and no unresolved owner decision:** `PM-02-B1 — Central/domain separation boundary + explicit domain-scope projection`.

Rationale: domain registry/identity (PM-B1), membership/availability (PM-B5), lifecycle (PM-B2), central-vs-domain authority (PM-B4) and domain-specific auditing/authorization are all blocked by explicit owner decisions. Implementing any of them would invent semantics. The two requirements that are already approved and completely independent are:

1. **Domain membership must never be silently treated as a global product property.** Before PM-02, `ValidationPipe({whitelist:true})` silently stripped unknown JSON keys, and `validateImport` silently ignored unknown CSV headers; a client could send `domain_status`, `domain_id` or `available_in_domain` to a central product write and the request would succeed with the domain property dropped — i.e. domain state was silently equated with a global product property.
2. **Do not introduce global activation as a substitute for domain-specific activation.** `product.status` is a central lifecycle; no read path stated that domain availability is a separate, currently unresolved layer.

PM-02 makes both invariants machine-enforced and user-visible, with no domain table, no domain state machine, no permission vocabulary and no provider registration. This is measurable functioning code, not an audit document set.

## 3) Exact capabilities, files and migrations

### 3.1 New server code

| File | Role |
| --- | --- |
| `apps/api/src/modules/master-data/product-domain-boundary.ts` | Pure DB-free contract: normalized English/Persian domain-owned token set, key-only recursive scanner with bounded depth/keys/array length, CSV **header-row-only** scanner, and one stable Persian `BadRequestException` envelope (`domain_property_rejected`, `domain_context_not_supported`). Values are never scanned, so a product named «شیر دامنهدار» is valid. |
| `apps/api/src/modules/master-data/domain-boundary.guard.ts` | `CanActivate` guard placed **after** `AuthGuard`/`PermissionsGuard` and **before** pipes, so it sees the raw body/query/CSV before whitelist stripping. Rejects domain-owned keys, domain CSV headers and `x-domain-id`. Audits `domain_boundary_rejected` with actor/company/surface/field names only (no values, no client `request_id`); because guards run before `TenantInterceptor`, the audit uses a dedicated transaction with transaction-local `app.company_id`/`app.user_id` GUCs so `audit_log` RLS sees the correct tenant. Audit failure never changes the fail-closed rejection. |
| `apps/api/src/modules/master-data/product-domain-scope.service.ts` | Authorized read projection. Revalidates `master.product.view` from the database via `CatalogAccess.assert`, selects `status` with explicit `id`, `company_id` and `deleted_at is null` predicates, returns `scope:'central'`, `domain_context/domain_membership/domain_availability:'unresolved'`, `available:false`, `state:'domain_identity_unresolved'`, `central_status_is_domain_availability:false`, the eight owner decision IDs and a Persian message. Central `status` is **never** used to derive availability. Audits `domain_scope_read`. |
| `apps/api/src/modules/master-data/product-domain-scope.controller.ts` | `GET /products/{id}/domain-scope` with `AuthGuard + PermissionsGuard + DomainBoundaryGuard`, `@RequirePermissions('master.product.view')`, `@RequestMetaParam`. |

### 3.2 Modified server wiring

- `apps/api/src/modules/master-data/product.controller.ts` — `DomainBoundaryGuard` on `POST /products`, `PATCH /products/{id}`, `DELETE /products/{id}`.
- `apps/api/src/modules/master-data/product-import.controller.ts` — same guard on `POST /products/import/validate` and `POST /products/import/commit` (CSV header check).
- `apps/api/src/modules/master-data/master-data.module.ts` — registers `ProductDomainScopeController` (before `ProductController`), `ProductDomainScopeService`, `DomainBoundaryGuard`. **`OPERATIONAL_DOMAIN_AUTHORITY` remains unregistered.**

Bulk maintenance was intentionally **not** changed: it already rejects `domain`, `domain_id`, `availability`, `factor_to_base` etc. with its own `protected_field` contract and existing tests assert that exact code. No unrelated refactoring was performed.

### 3.3 API contract and client

- `packages/contracts/openapi.yaml` — new `GET /products/{id}/domain-scope` (200/400/401/403/404) with Persian description; new `ProductDomainScope` schema with `const` invariants; two new stable error codes documented in `Error.code`. Result: 202 paths / 285 operations / 154 schemas / 3 webhooks (was 201/284/153/3).
- `packages/api-client/src/schema.ts` — regenerated with `npm run generate -w packages/api-client` (+92 lines); no manual edit.

### 3.4 Persian-first RTL UI

- `apps/web/src/app/products/[id]/catalog-evidence.tsx` — `DomainIntegrationStatus({productId})` now calls `/products/{id}/domain-scope`. Two distinct panels: «وضعیت مرکزی کالا (سراسری شرکت)» with the central status badge, and «عرضه در دامنه عملیاتی» with «تعیین نشده» and the server message. Explicit sentence: «فعال بودن مرکزی بهمعنای عرضه در تمام دامنهها نیست». Loading / error / retry / empty / permission-safe states; **no checkbox, selector, switch or fabricated membership**. Owner decision count is displayed with `<bdi>`.
- `apps/web/src/app/products/[id]/page.tsx` — passes `productId={id}`.
- `apps/web/src/app/products/domain-integration/page.tsx` — Persian paragraph explaining the server-side boundary and `x-domain-id` rejection.
- `apps/web/src/app/products/import/page.tsx` — Persian note that domain membership/availability/activation/ID columns (e.g. «دامنه», «وضعیت عرضه», `domain_id`) are refused before any write because domain availability is not a global product property.

### 3.5 Migrations

**None added.** The capability uses existing `product`, `audit_log`, RBAC and immutable `product_catalog_history`; no new table, column, index, grant, RLS policy, `SECURITY DEFINER`, role or backfill. `npm run test:migrations` still performs a 64-migration up/down/up with exactly 1029 identical objects.

## 4) Architectural decisions and rationale

| Decision | Rationale |
| --- | --- |
| Guard, not DTO validator | Nest guards run **before** `ValidationPipe`; a class-level validator sees a whitelisted object from which unknown keys have already been removed. Only a guard can reject rather than silently drop. |
| Guard order `AuthGuard, PermissionsGuard, DomainBoundaryGuard` | Only authenticated, authorized requests reach the boundary logic; audit rows have a server-verified actor/company and unauthenticated requests cannot spam audit writes. |
| Explicit GUC transaction for guard audit | `TenantInterceptor` runs after guards; without transaction-local tenant GUCs the `audit_log` RLS INSERT would be denied. `withTransaction` + `set_config(..., true)` keeps the GUC scoped to one transaction and never leaves a tenant-tainted pooled connection. |
| Key-only scanning, bounded | Prevents false positives on legitimate Persian product names/descriptions; caps depth (4), keys (200), array items (100), CSV characters (1 MiB) and reported fields (20). |
| `unresolved` string, not `null` or a fabricated state | Avoids inventing PM-B5 membership states and avoids a nullable contract that a client could misread as "absent". `available:false` is a readiness flag, **not** a statement that the product is unavailable in any domain. |
| Keep 400/503 fail-closed domain routes unchanged | `DomainCatalogGate` remains unregistered; the new 200 endpoint is a *central* projection, not a domain workflow. A valid-looking `x-domain-id` is refused on central operations (400) rather than silently scoping them. |
| No global activation substitute | `central_status_is_domain_availability:false` is an explicit machine-readable invariant; blocked/discontinued central statuses still produce `unresolved` domain fields, never `unavailable`. |
| Preserve D4/G-03 untouched | `product-sensitivity.ts`, all `confirm_sensitive` guards, all approval tables and all `approval_binding` operations are unchanged. No two-person semantics were invented, weakened or bypassed. |

## 5) Tests and actual results

All commands were run from `/home/user/Green-DMS`. Local PostgreSQL 16.2 trust-auth at `127.0.0.1:55432` is **not** CI- or production-equivalent; Redis `ECONNREFUSED 127.0.0.1:6379` and PG teardown `57P01` idle-client notices are known non-failures also recorded in earlier milestones.

| # | Command / suite | Baseline | Final | Verdict |
| --- | --- | --- | --- | --- |
| 1 | `npm run typecheck` (contracts, api-client, api, web) | 5/5 EXIT=0 | 5/5 EXIT=0 | **PASS** |
| 2 | `npm run openapi:check` | 201 paths / 284 ops / 153 schemas / 3 webhooks | 202 / 285 / 154 / 3 | **PASS** |
| 3 | `node scripts/contract-drift.mjs` | 0 code-only, 0 spec-only, 0 enum, 0 required | 0 / 0 / 0 / 0 | **PASS** |
| 4 | `node scripts/check-test-partition.mjs --check` | 81 files, EXIT=0 | 85 files, EXIT=0, declared == computed | **PASS** |
| 5 | DB-free API unit (`vitest run $(check-test-partition --print unit)`) | 26 files / 339 tests | **29 files / 363 tests** | **PASS** |
| 6 | `npm run test:web` | 17 files / 88 tests | **18 files / 94 tests** | **PASS** |
| 7 | `npm run build` (root) | EXIT=0 | EXIT=0 | **PASS** |
| 8 | `npm run test:migrations` (64 up/down/up) | n/a | EXIT=0, exactly **1029 identical objects** | **PASS** |
| 9 | `git diff --check` | EXIT=0 | EXIT=0 | **PASS** |
| 10 | Selected native-PostgreSQL Product Master regression: `products.api.test.ts`, `product-catalog-foundation.test.ts`, `product-bulk-maintenance.api.test.ts`, `product-export.api.test.ts`, `product-master-core.test.ts`, `product-master-security.test.ts`, `product-domain-boundary.api.test.ts` | n/a | **7 files / 85 tests PASS** | **PASS** |
| 11 | `contract.api.test.ts` (real app route coverage + AJV response-shape validation) | n/a | **1 file / 80 tests PASS** | **PASS** |

New focused suites (all PASS):

| Suite | Count | Coverage |
| --- | --- | --- |
| `apps/api/test/product-domain-boundary-unit.test.ts` | **7/7** | Positive central payload; negative English/camelCase/Persian domain keys; boundary nested objects/arrays/depth/key caps/CSV BOM/quotes/header-only; cross-domain dedup; stable Persian error envelope. |
| `apps/api/test/product-domain-boundary-guard.test.ts` | **8/8** | Positive pass without mutation/audit; negative body/CSV/query/header; boundary data-cell «دامنه» allowed; cross-domain nested dedup; fail-closed even when audit rejects; transaction-local GUCs and rollback verified. |
| `apps/api/test/product-domain-scope.test.ts` | **9/9** | Positive projection; blocked/discontinued central states still unresolved; negative invalid UUID (400), viewer denied (403), missing product (404); cross-company query predicates; header cannot alter result; audit record; route RBAC + guard metadata; `OPERATIONAL_DOMAIN_AUTHORITY` still unregistered. |
| `apps/api/test/product-domain-boundary.api.test.ts` | **12/12** | **Real HTTP + disposable native PostgreSQL**: 200 projection; blocked central lifecycle no domain state; `domain_id` create rejected with no row persisted; nested `domain_availability` rejected; Persian column in PATCH rejected and product unchanged; English/Persian CSV headers rejected; valid CSV + «دامنه» data cell accepted; `x-domain-id` 400; viewer 403; foreign-company product 404; malformed id 400; `audit_log` rejection row with actor and no raw value. |
| `apps/web/src/app/products/[id]/catalog-evidence.test.tsx` | **7/7** | Central/domain separation rendering, no fake controls, blocked central state, error/retry, honest empty state. |
| `apps/web/src/app/products/domain-integration/page.test.tsx` | **5/5** | Existing screen plus boundary note + `x-domain-id` assertion. |
| `apps/web/src/app/products/import/page.test.tsx` | **3/3** (new) | Persian note, permission state without request, server `domain_property_rejected` surfaced instead of silent stripping. |

New or rewritten focused test cases: **43** — 24 new DB-free API (7 + 8 + 9), 12 new native-DB HTTP, 4 rewritten `catalog-evidence` web tests (replacing 1 old domain test), and 3 new `import` web tests; plus one strengthened assertion in the existing 5-test `domain-integration` suite. Full-suite growth matches exactly: DB-free API unit 26 files / 339 → 29 files / **363** (+24), web 17 files / 88 → 18 files / **94** (+6 = 3 new import + 3 net in `catalog-evidence`). The 12 native-DB HTTP tests live in the separate DB-backed partition, so they are not included in the 363.

## 6) Exact-final-SHA CI

The exact final commit SHA, its 8/8 check-run IDs and 4/4 workflow-run IDs, and `gh pr checks 14` result are recorded in the PR #14 body and the final chat report after the ordinary push, following the repository's established self-reference convention. No earlier-SHA green is transferred; no workflow was edited or re-run to manufacture green. `evidence/task-pm-02/VERIFICATION.json` records the durable local ledger; the final GitHub state is verified by the five-way SHA agreement (local HEAD, `origin/arena/be5eaff3-green-dms`, `git ls-remote`, GitHub branch ref, PR #14 head).

## 7) Remaining owner decisions, blockers, limitations and unverified areas

- **BLOCKED / OPEN / NOT APPROVED:** PM-B1..PM-B8 (domain identity, lifecycle, list permissions, central/domain authority, membership states, absent-product visibility, retirement history, cross-domain visibility); Q1..Q5 (whole-file import atomicity and its retry/audit/status vocabulary); G-03 Product Master two-person binding. Exact questions, interpretations, alternatives, consequences, recommendations and proceed/isolate answers are in `TASK-PM-02_OWNER_DECISION_REGISTER.md`.
- **BLOCKED:** TASK-PM-01E additive domain migrations, provider binding, actor-domain assignment, domain RLS/permissions, membership/history persistence, domain API/UI activation, downstream consumer cutover.
- **UNVERIFIED:** real production topology/roles/PostGIS+password-auth CI equivalence for the new endpoint (local PG16.2 is trust-auth; Redis is absent); manual visual/responsive/RTL/accessibility/console review of the new panels; G-03 Product Master approval semantics; whole-file import semantics; independent Agent-2 acceptance review; full Product Master business acceptance. No claim of full Product Master acceptance or production readiness is made.
- **NOT AUTHORIZED:** merge, approval, release, deployment, production/shared DB change, PR readiness change. Readiness is not authorization.
- **Scope limits of this increment:** the boundary refuses domain-owned **names**; it is not a semantic validator of an approved domain model (none exists). The `domain-scope` projection is read-only and central; it does not implement membership, activation or availability. Bulk maintenance retains its existing `protected_field` code; adding the new guard there would have changed an established contract and broken its tests, so it was deliberately left intact.

## 8) Verdicts and one recommended next increment

| Area | Verdict |
| --- | --- |
| PM-02-B1 implementation, API/UI/contract consistency | **PASS** |
| Server-side authorization, tenant/cross-company isolation, auditability of the new boundary | **PASS** (native PostgreSQL HTTP evidence; local trust-auth limitation disclosed) |
| Positive / negative / boundary / cross-domain test coverage | **PASS** |
| No migration, no domain semantics invented, D4/G-03/M4 untouched, PR #14 OPEN/DRAFT | **PASS** |
| Exact-final-SHA CI | **recorded in PR #14 body and final chat report** (five-way SHA agreement verified after push) |
| Full Product Master acceptance | **BLOCKED** |
| Production deployment | **NOT AUTHORIZED** |

**One recommended next increment:** `TASK-PM-02-B2 — owner-approved operational-domain authority spike`, i.e. obtain written PM-B1/PM-B2/PM-B4 decisions plus IAM/security sign-off, then implement a company-scoped additive registry and actor-to-domain assignment with RLS/least-privilege grants and up/down/up evidence. Only after that should membership/availability (PM-B5/B6/B7/B8) and the blocked 400/503 endpoints be activated. It must not begin before explicit approval evidence exists, and it must not weaken the PM-02-B1 separation boundary.

---

## 9. TASK-PM-02-B2 — decision package + fail-closed read-surface parity

**This is NOT the §8 owner-approved authority spike.** A fresh inspection of the
durable GitHub state at baseline `dad4ce8a41b66fedd06ef66b5bbfa25e4e86d31a`
confirmed the decision gate is still failed closed: PR #14 reviews `0`, review
comments `0`, one non-approval independent-review request, unrelated issues
`#11`/`#12`, no tracked owner decision or IAM/Security sign-off, no approval in
`git log --all`. PM-B1..PM-B8, Q1..Q5 and G-03 remain `OPEN / NOT APPROVED`.
Accordingly no registry, lifecycle, assignment, membership, migration, RLS,
domain API or UI activation was implemented.

**Deliverable 1 — decision package.** `TASK-PM-02-B2_OWNER_DECISION_PACKAGE.md`
consolidates the exact unresolved questions, alternatives, advice-only
recommendations, consequences, precisely blocked implementation elements and
required acceptance evidence for PM-B1 (identity), PM-B2 (lifecycle) and PM-B4
(authority/assignment), plus the signed seven-column artifact that unblocks them.
It is a decision request, not an approval.

**Deliverable 2 — independent, non-gated engineering.** The approved
central/domain separation boundary from B1 covered writes, import validate/commit
and `domain-scope`, but not central READ surfaces. Because `validationPipeOptions`
uses `whitelist: true` without `forbidNonWhitelisted`, a `?available=true` or
`?domain_id=…` key on a read was silently discarded and an unchanged FULL central
page/CSV returned to a caller believing it had requested domain-scoped data —
most serious on `GET /products/export`. B2 attaches the SAME
`DomainBoundaryGuard` (after `AuthGuard, PermissionsGuard`) to
`GET /products`, `GET /products/{id}`, `GET /products/export` and
`GET /products/import/report/{id}`. It rejects domain-owned query keys and any
`x-domain-id` header with `400` before pipes, audits key names only, and fails
closed if auditing fails. Domain-context routes in `CatalogFoundationController`
that deliberately read `@Headers("x-domain-id")` are intentionally NOT guarded —
no blanket rejection. No new domain identity, membership, availability, state,
permission or authority is created.

Contract/client: documented `400` on `/products/import/report/{id}`, added the
B2 boundary note to `Error.code`, regenerated `packages/api-client/src/schema.ts`
deterministically. Counts unchanged: 202 paths / 285 operations / 154 schemas /
3 webhooks; drift 0/0/0/0; partition 86 files, computed == declared.

Tests: 6 new DB-free guard cases, a new 4-case structural parity suite
(`product-domain-boundary-read-parity.test.ts`, unit-classified), 7 new real-HTTP
cases on `product-domain-boundary.api.test.ts`. Local results — focused unit
3/25, full unit partition 30/373, web 18/94, boundary HTTP 1/19, targeted DB
regression 7/146, migrations up/down/up 1029 identical objects,
typecheck/OpenAPI/drift/partition/root build/`git diff --check` all PASS. Full DB
run: 51/55 files and 1092/1109 tests green; the 4 failing files / 17 tests
(`customers`, `geofences`, `tours`, `postgres-init-role`) were reproduced
identically on the pristine baseline via a reversible `git stash` and are local
PostGIS/trust-auth environment artefacts, not B2 regressions.

| Area | Verdict |
| --- | --- |
| Owner decisions PM-B1/B2/B4 (and B3/B5–B8, Q1–Q5, G-03) | **BLOCKED** |
| Registry / lifecycle / assignment / membership / migrations / domain RLS / domain APIs / UI activation | **BLOCKED** — deliberately not implemented |
| Decision package, gate inspection, backup integrity, read-surface parity, contract/client/test consistency | **PASS** |
| Production topology/PostGIS+password-auth equivalence, manual RTL/a11y/console, independent Agent-2 review, raw per-test CI logs | **UNVERIFIED** |
| Full Product Master acceptance | **BLOCKED** |
| Production deployment | **NOT AUTHORIZED** |

**One recommendation (unchanged):** obtain the signed PM-B1/PM-B2/PM-B4 package
with IAM/Security sign-off and approved examples before any domain-authority
implementation; then add the company-scoped registry, lifecycle and actor-domain
assignment with domain-aware RLS and up/down/up evidence, and only afterwards
activate membership/availability and the blocked 400/503 endpoints. Do not weaken
the B1 separation boundary or the B2 read-surface parity.
