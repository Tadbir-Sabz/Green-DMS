# TASK-PM-01B — Operational Domain Identity & Product Domain Catalog Membership

**Status:** independent technical foundations delivered; authoritative domain contract **BLOCKED**; overall Product Master business acceptance **BLOCKED**.

Baseline for this task: PR #14 head `eb23347421d00525e72d57766bf0ef5fc288f9af` (`eb23347`), base merge commit `6b4429ba7e55f7e02f407e63f2b2b2e197fad1fa`. No PM-01A capability was restarted or reimplemented. No migration, deployment, merge or production/shared-service change was made.

## 1. Fresh full-repository finding

Whole-repository source/migration/auth/API-contract inspection found **no authoritative operational product-catalog domain model**. Evidence is recorded in `TASK-PM-01B_DOMAIN_OWNER_DECISIONS.md`:

- `pricing_domain` (`0049`) is a company-scoped **pricing-policy** scope limited to `channel`, `area`, `branch`; `price_list.domain_id`, `promotion.domain_id` and `promotion_evaluation.domain_id` reference it. Its comments, grants and permissions are pricing-specific.
- `approval_policy.domain_id`, `approval_delegation.domain_id` and `approval_request.entity_domain_id` (`0053`) are untyped UUIDs with no FK to a domain registry. `TASK-24Z_OWNER_DECISION_REGISTER.md` D01 and `TASK-24Z_POLICY_ELIGIBILITY_CLOSURE.md` P3 explicitly leave business ownership/mapping open.
- `AuthContext` contains only `userId`, `sessionId`, `companyId`, `username`, `roles`, `permissions`. There is no domain identity, actor-to-domain assignment or domain-scope resolver. `fn_current_company_id()` and existing RLS enforce company isolation only.
- `branch`, `sales_area`, `warehouse`, `company` and user-defined labels have separate semantics. None was repurposed.
- `0005`, `0046`, `0047` and `0060` contain central Product Master data and immutable catalog history, but no `product_domain_*` membership table or domain registry.

**Decision:** do not reuse `pricing_domain` or approval scopes; do not create a competing registry, hardcode domain IDs, backfill all active central products, or fabricate tenant mappings.

## 2. Owner decisions separated from technical work

`TASK-PM-01B_DOMAIN_OWNER_DECISIONS.md` records all eight required decisions as **OPEN**, with accountable owner roles, consequences and acceptance evidence:

| ID | Required owner decision |
|---|---|
| PM-B1 | Domain identifier and ownership |
| PM-B2 | Lifecycle and enabled/disabled semantics |
| PM-B3 | Listing/search permissions |
| PM-B4 | Central versus domain-level management authority |
| PM-B5 | Product membership creation, removal and deactivation |
| PM-B6 | Visibility of products not yet registered in a domain |
| PM-B7 | Historical membership retention when a domain is retired |
| PM-B8 | Cross-domain product detail/history visibility |

Recommendations are explicitly not approvals. The document separates these business decisions from ten safely implementable technical boundaries. No permission vocabulary, domain status, membership state or approval policy was invented.

## 3. Implemented independent foundations

### API and service boundary

- New `DomainCatalogGate` in `apps/api/src/modules/master-data/domain-catalog.contract.ts` defines a narrow future provider contract (`listDomains`, `resolveDomain`, `authorize`), plus decision/technical status. **No provider is registered** in `MasterDataModule`; a static unit test proves it.
- `OPERATIONAL_DOMAIN_AUTHORITY` is an injection symbol only, not a registry. `available` remains `false` even if a future provider is injected until membership persistence is implemented; the refusal code distinguishes `domain_identity_unresolved` from `domain_catalog_not_implemented`.
- Domain reads (`/operational-domains`, `/operational-domains/current`, `/operational-domains/:domainId/products`, `/products/:id/domain-membership`, `/products/:id/domain-membership/history`) fail closed before any product/membership query. No membership rows or domain descriptors are returned.
- Domain writes (`POST /operational-domains/:domainId/products`, `PATCH`/`DELETE /operational-domains/:domainId/products/:productId`) validate mandatory domain context, require provider resolution/authorization, reuse `CatalogAccess.write` with DB-resolved `master.product.update`, recheck the provider inside the shared transaction, then throw 503 before any write. There is no commit and no partial mutation.
- All new endpoints reuse `AuthGuard`, `PermissionsGuard` and existing `master.product.view`/`master.product.update` permissions. No `domain.*` permission was invented. Missing/invalid `x-domain-id` is a 400; absent authority is a 503; provider denial is 403; a foreign-company descriptor is 403. No client UUID alone grants identity.
- Existing `/product-domain-integration` now returns the owner-decision register, technical prerequisites and doc link while keeping `available:false`. Existing `/products/:id/domain-catalog` remains 503.
- No change was made to existing RLS policies, `dms_app` grants, `CatalogAccess`, tenant GUC cleanup, central product writes, import, packaging or history triggers.

### Contract and client

- `packages/contracts/openapi.yaml` gained seven new fail-closed route definitions, explicit 400/401/403/404/503 semantics, required `x-domain-id` header parameters, `DomainOwnerDecision`, `DomainCatalogContractStatus`, `DomainCatalogUnavailable`, and a shared `ServiceUnavailable` response.
- `packages/api-client/src/schema.ts` was regenerated from OpenAPI with `npm run generate -w packages/api-client`. Contract drift and OpenAPI validation are clean.

### Persian RTL UI foundations

- New `/products/domain-integration` page is Persian-first, `dir="rtl" lang="fa"`, responsive with flex/grid and no overlapping controls. It clearly separates central SKU lifecycle from domain availability, lists the eight owner decisions from the real API, lists technical prerequisites, and marks the five workflow capabilities as blocked.
- It includes permission, session-loading, API-loading, empty, error/retry and read-only states. There is no fake domain selector, membership switch, invented domain ID, sample product or simulated completed workflow.
- Product detail’s `DomainIntegrationStatus` links to the new page and shows the real decision count when supplied. Product list links to the new page for viewers.
- jsdom tests assert no checkbox, combobox, textbox or fabricated domain data, and exercise permission/loading/error/retry/empty states.

## 4. Migration and database evidence

- **No new migration was added or required.** There is no approved domain identity, lifecycle, membership state, permissions or privacy contract; adding a table would create a competing registry or invent business rules.
- Existing `0060_product_catalog_history.up.sql`/`.down.sql` and all previously applied historical migrations are unchanged. No existing PM records or history were modified, backfilled or deleted.
- No production or shared database was contacted. This sandbox has no local PostgreSQL/psql/docker service. Membership-specific native PostgreSQL/PostGIS, runtime-role RLS, FK/uniqueness, up→down→up, concurrent membership and historical-retention tests are therefore **BLOCKED**, not passed.
- The final pushed SHA is exercised by the repository’s existing isolated CI migration up→down→up job and native PostgreSQL job for all previously implemented DB-backed regressions. Those jobs do **not** prove unimplemented membership persistence.

## 5. Local validation (exact commands)

All commands below ran from `/home/user/Green-DMS` after `npm ci --no-audit --no-fund` (607 packages). Exit codes are recorded.

| Command | Result | Exit |
|---|---|---|
| `node scripts/check-test-partition.mjs` | partition OK; 22 DB-free unit files; new test correctly classified DB-free | 0 |
| `npm run typecheck` | packages, API and web clean | 0 |
| `npx tsc -p apps/api/tsconfig.json --noEmit` | clean | 0 |
| `npm run openapi:check` | **194 paths / 277 operations / 137 schemas / 3 webhooks** | 0 |
| `node scripts/contract-drift.mjs` | 277 spec operations = 277 code operations; 0 enum/required drift | 0 |
| `git diff --check` | clean | 0 |
| API DB-free unit suite (`cd apps/api && files=$(node ../../scripts/check-test-partition.mjs --print unit) && ../../node_modules/.bin/vitest run $files`) | **22 files / 321 tests passed** | 0 |
| `npm run test:web` | **12 files / 70 tests passed** | 0 |
| `npm run build` | API, packages and Next.js web build clean; `/products/domain-integration` generated | 0 |
| Focused `vitest run test/domain-catalog-foundation.test.ts` | 10/10 passed | 0 |
| Focused `vitest run src/app/products/domain-integration/page.test.tsx 'src/app/products/[id]/catalog-evidence.test.tsx'` | 9/9 passed | 0 |

No local skips were accepted. New tests include: no registered authority; 8 owner decisions; all reads fail closed with no DB transaction; missing/malformed context 400; provider resolution and action-specific authorization; cross-company descriptor rejection; unauthorized/foreign domain filtering; service write-boundary authorization recheck and rollback; canonical permission denial; controller RBAC metadata; and UI blocked/permission/loading/error/empty states.

## 6. Remaining findings and honest verdicts

**Owner decisions:** PM-B1 through PM-B8 remain **OPEN**. TASK-24Z D01–D07 remain separate open gates where relevant; no named signatory or approval evidence was supplied.

**Technical findings:** no authoritative provider is registered; no domain membership table/history/API workflow exists; no domain-scoped IAM vocabulary or actor assignment exists; no domain-level RLS policy can be tested without an approved registry; no domain-aware consumer cutover, concurrency, duplicate prevention or domain retirement retention test can be meaningfully run. Manual visual/RTL/accessibility browser proof and independent Agent-2 review remain **UNVERIFIED**. No exhaustive security/load proof is claimed. Existing PM-01A import concurrency/whole-file atomicity findings remain unchanged.

- **Independent technical foundations:** **PASS WITH FINDINGS** (local checks and isolated CI regressions green; foundations deliberately blocked).
- **Operational domain-aware Product Catalog membership workflow:** **BLOCKED** (owner decisions and approved authority absent).
- **TASK-PM-01B overall delivery:** **PARTIAL**.
- **Overall Product Master business acceptance:** **BLOCKED**.

No merge, deploy, protected-branch, production infrastructure or shared-service change was performed. PR #14 remains the traceable delivery location; the exact final tested SHA and CI evidence are recorded in its body and the final report.
