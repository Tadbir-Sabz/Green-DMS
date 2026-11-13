# TASK-PM-01D — Decision Closure, Parallel Development and Implementation Evidence

**Status:** one independent Product Master vertical slice implemented; PM-B1–PM-B8 remain **OPEN / NOT APPROVED**. PM-01B fail-closed domain boundaries are preserved. No domain registry, domain ID, domain-scoped permission, actor assignment, membership table, lifecycle workflow, provider registration, migration, grant, RLS change or downstream consumer cutover was added.

Baseline: PR #14, branch `arena/be5eaff3-green-dms`, status `pr_open`, starting SHA `50ddb3418039410cf90c244b84cf51abdf254bb1`. The exact final commit SHA is recorded in PR #14 body and the final report; no file edit occurred between the last verification command and that commit.

## 1. Baseline verification

| Check | Result |
|---|---|
| Local `HEAD`, `origin/arena/be5eaff3-green-dms`, `FETCH_HEAD`, PR #14 `headRefOid` | All `50ddb3418039410cf90c244b84cf51abdf254bb1` — PASS |
| PR #14 | OPEN/draft, base `main`, head fixed session branch — PASS |
| Worktree before edits | Clean — PASS |
| PM-01A/PM-01B/PM-01C evidence, four standalone Mermaid diagrams, owner register, target design and spec | Present and non-empty — PASS |
| PM-B1–PM-B8 | All OPEN / NOT APPROVED in the live register and PM-01C package — PASS |
| Migrations | 60 up / 60 down; last is `0060`; no domain registry/membership/assignment table — PASS |
| OpenAPI and fail-closed boundary | 194 paths / 277 operations / 137 schemas / 3 webhooks; `DomainCatalogGate`, unregistered `OPERATIONAL_DOMAIN_AUTHORITY`, blocked routes and `available:false` intact — PASS |
| Authorization foundations | `CatalogAccess`, tenant GUCs, company RLS, select-only `product_catalog_history` grant intact — PASS |
| Baseline `gh pr checks 14` on starting SHA | 8/8 PASS (existing evidence, not repeated) |

A scripted baseline assertion exited 0 with `BASELINE_VERIFICATION=PASS`.

## 2. Parallel development assessment

| Candidate | Existing implementation status | Business value | Dependencies | Security implications | Implementation readiness | Can proceed without PM-B1–PM-B8 approval? |
|---|---|---|---|---|---|---|
| Global product identity and lifecycle | IMPLEMENTED: D1–D5, SKU/code uniqueness, optimistic version, soft deletion, status/base-UOM/tax explicit confirmation | High | Existing `0046`/`0047`, `CatalogAccess`, `0060` | Existing company RLS/RBAC and service transaction boundary | NO NEW WORK; do not duplicate | Yes, already implemented |
| Product attributes and classifications | IMPLEMENTED: attributes/variants, enum values, families/categories, non-destructive family lifecycle, aliases, relations, bundles | High | Existing Product Master APIs/UI | Existing `master.product.view/update`; immutable central history | NO NEW WORK; legacy unpaginated dropdown finding remains | Yes |
| Product search and filtering | IMPLEMENTED: text/alias/Latin search, status/category filters, keyset code ascending/descending, scan resolution | High | Existing product list and OpenAPI client | Company RLS and read permission | NO NEW WORK | Yes |
| Product evidence and history | PARTIAL: per-product immutable history exists; family/category events are persisted by `0060` but had no company-wide screen | High: audit/governance for central catalog changes | Existing `product_catalog_history`, `master.product.view` | Read-only, company RLS, service-level permission revalidation | READY — selected | Yes |
| Product import and validation | IMPLEMENTED per-batch atomicity, D4 denial, barcode rollback, idempotent sequential replay; concurrent same-key report race and whole-file multi-batch all-or-nothing remain findings | High | Native PostgreSQL concurrency tests and possibly explicit business semantics | Existing service authorization/transaction; concurrency business rule not approved | NOT SELECTED / BLOCKED for this milestone | Not safely as a small docs-free slice |
| Product APIs and integrations | IMPLEMENTED central OpenAPI/client; PM-01B domain paths fail closed | High | Contract drift and generated TS client | Existing route guards | Central contracts safe; domain activation BLOCKED | Yes for central; no for domain |
| Persian RTL UX improvements | IMPLEMENTED permission-aware product list/new/import/detail/settings/domain-decision screens; manual visual/RTL/a11y proof remains UNVERIFIED | Medium | Manual QA/browser evidence | Permission state and no fake controls | NOT SELECTED; no independent manual QA available | Not as an executable milestone |
| Existing central governance workflows | IMPLEMENTED settings create/rename/activate family, category creation, sensitive-change confirmation, history tab | High | Existing contracts only | Existing service guards and history | NO NEW WORK | Yes |

**Selected highest-value independent capability:** `TASK-PM-01D-M1 — Company-wide central catalog history explorer`. It closes a concrete PM-01A finding without duplicating the per-product history tab, requires no owner decision, uses the approved immutable central-history contract, and is a complete API + contract + UI + test slice.

## 3. Actual implementation delivered

### API and security boundary

- New `GET /product-catalog/history` in `apps/api/src/modules/master-data/catalog-foundation.controller.ts`.
- Read-only keyset pagination with `before`, `limit` (bounded 1–100), optional `entity_type` and `product_id` filters.
- `CENTRAL_CATALOG_HISTORY_ENTITY_TYPES` allowlists exactly the 11 central entity types hooked by migration `0060`: `product`, `product_category`, `product_family`, `product_alias`, `product_attribute_def`, `product_attribute_enum_value`, `product_attribute_value`, `product_relation`, `product_bundle`, `product_barcode`, `product_packaging`. No domain entity type is accepted.
- Controller retains `AuthGuard`, `PermissionsGuard` and `@RequirePermissions("master.product.view")`. The service additionally calls `CatalogAccess.assert(companyId, userId, "master.product.view")` so direct service calls revalidate the permission from the database.
- Query includes `company_id = $1` and the existing `p_product_catalog_history` company RLS applies through the tenant-aware pool/GUCs. The endpoint performs no write, opens no speculative transaction, adds no grant and changes no existing RLS policy.
- The existing per-product `GET /products/{id}/history` remains intact and now also returns `product_id::text` for schema consistency.
- PM-01B domain routes, `DomainCatalogGate`, `available:false`, 400/503 behavior and unregistered `OPERATIONAL_DOMAIN_AUTHORITY` are unchanged.

### Persian RTL UI

- New `/products/catalog-history` page in `apps/web/src/app/products/catalog-history/page.tsx`.
- Permission/loading/error/retry/empty states, filter form for central entity types and optional product UUID, keyset “older events”, refresh, before/after JSON details, actor/event/entity IDs, and a product-detail link when `product_id` exists.
- Explicit scope notice: only events from `0060` onward; no reconstructed history; no domain membership, pricing, inventory or financial evidence.
- Permission-gated link from `/products` to the new page.
- `<main dir="rtl" lang="fa">`, Persian labels, `fa-IR` date display, `bdi` and `dir="ltr"` for identifiers/JSON.

### Contracts

- `packages/contracts/openapi.yaml`: new path, query parameters, 200/400/401/403 responses; `ProductCatalogHistoryPage.items` now has optional nullable `product_id` and an `entity_type` enum matching the backend allowlist.
- `packages/api-client/src/schema.ts`: regenerated TypeScript client from the OpenAPI contract only. The tracked Android client was not regenerated because no Android consumer changed; this matches the existing PM-01B precedent.
- OpenAPI count after change: **195 paths / 278 operations / 137 schemas / 3 webhooks**. Contract drift is zero.

### Tests

- `apps/api/test/catalog-history-explorer.test.ts`: 5 DB-free tests for company scoping, central-only allowlist, keyset pagination, filter parameter binding, cursor/entity/ID validation, service-level permission denial, controller permission metadata and unregistered provider.
- `apps/web/src/app/products/catalog-history/page.test.tsx`: 6 tests for real API request shape, central entity rendering, product link, filter application, cursor pagination, error/retry, permission and session-loading states, and no domain options/checkboxes.

### Files changed

Modified: `apps/api/src/modules/master-data/catalog-foundation.controller.ts`, `apps/web/src/app/products/page.tsx`, `packages/contracts/openapi.yaml`, `packages/api-client/src/schema.ts`, `PRODUCT_ROADMAP.md`, `docs/product-inventory/TASK-PM-01B_DOMAIN_OWNER_DECISIONS.md`, `docs/product-inventory/TASK-PM-01C_DEPENDENCY_MATRIX.md`, `docs/product-inventory/TASK-PM-01_PRODUCT_MASTER_SPEC.md`.

Created: `apps/api/test/catalog-history-explorer.test.ts`, `apps/web/src/app/products/catalog-history/page.tsx`, `apps/web/src/app/products/catalog-history/page.test.tsx`, `docs/product-inventory/TASK-PM-01D_OWNER_DECISION_CLOSURE.md`, `docs/product-inventory/TASK-PM-01D_IMPLEMENTATION.md`.

Migration changes: **none**. `.github` workflow changes: **none**.

## 4. Verification ledger

All commands below exited 0 on the PM-01D working tree. Documentation/reconciliation edits were completed after the first broad verification run; a final post-edit verification command was then run after every source, contract, test and documentation edit. No tracked file edit occurred between that final verification command and the commit.

| Command | Result |
|---|---|
| Scripted baseline verification | `BASELINE_VERIFICATION=PASS`, exit 0 |
| `npm run openapi:check` | 195 paths / 278 operations / 137 schemas / 3 webhooks, exit 0 |
| `npm run generate -w packages/api-client` | TypeScript client regenerated, exit 0 |
| Focused API `npx vitest run --config vitest.config.mts test/catalog-history-explorer.test.ts` | 1 file / 5 tests passed, exit 0 |
| Focused web `npx vitest run src/app/products/catalog-history/page.test.tsx` | 1 file / 6 tests passed, exit 0 |
| `node scripts/check-test-partition.mjs` | 23 DB-free unit files, declared == computed, exit 0 |
| DB-free API partition via generated unit list | 23 files / 326 tests passed, exit 0 |
| `npm run test:web` | 13 files / 76 tests passed, exit 0 |
| `npm run typecheck` | packages/contracts, api-client, API and web all exit 0 |
| `node scripts/contract-drift.mjs` | 278/278 operations, zero code/spec/enum/required drift, exit 0 |
| `npm run build` | API/web/packages built; `/products/catalog-history` generated, exit 0 |
| `git diff --check` | exit 0 |
| Final post-edit verification: focused API + web tests, partition check, OpenAPI check, contract drift, typecheck and `git diff --check` | all exit 0; no tracked edits afterwards |

A failed first focused-web run was caused by a test fixture object spread order that overwrote `items` with the empty array; the test fixture was corrected and the rerun passed. This was a test-data defect, not a product-code defect.

No completed full CI or native PostgreSQL database suite was repeated locally. Source/contract changes justify observing the new SHA's GitHub checks after push; results are recorded in PR #14 body. No local PostgreSQL/psql/docker disposable database was created.

## 5. Security and data-integrity findings

- **PASS:** existing central RBAC, company RLS, tenant GUCs, immutable `0060` history and select-only runtime grant are preserved.
- **PASS:** new endpoint uses both route-level `master.product.view` and service-level DB-resolved revalidation; company is taken only from `AuthContext`, never from the client.
- **PASS:** explicit `company_id` predicate plus table RLS; keyset cursor is numeric and bounded `limit` prevents unbounded reads.
- **PASS:** central-only entity allowlist prevents future domain-membership rows from leaking into a global product-identity view; no domain-specific behavior is placed in global identity.
- **PASS:** no migration, no new grant, no provider binding, no domain permission code, no domain ID, no membership/assignment/lifecycle table, no backfill, no activation of blocked endpoints.
- **PASS WITH FINDINGS:** native PostgreSQL evidence for the new endpoint's company RLS is inherited from existing `0060`/`dms_app` tests but no endpoint-specific native test was added/run locally; manual visual/responsive/RTL/accessibility proof remains UNVERIFIED; independent Agent2 review remains UNVERIFIED.
- **BLOCKED:** domain-level DB enforcement, membership concurrency, domain-aware RLS and retirement/history retention remain blocked on PM-B1–PM-B8 approval evidence. No such enforcement is claimed.

## 6. Exact post-approval migration and authorization implementation sequence

**Do not execute any step below until explicit owner approval evidence exists.** Planned future filenames are listed for sequencing only; no SQL file is created now and exact columns/states/permission codes remain unapproved.

1. **Approval ledger:** record the authoritative decision document reference, chosen alternative for each PM-B decision, approved examples, migration/backfill policy, privacy matrix and acceptance criteria. Update `TASK-PM-01B_DOMAIN_OWNER_DECISIONS.md` from OPEN only with exact evidence.
2. **IAM/security freeze:** approve exact permission vocabulary, wildcard behavior, actor-domain assignment source, validity/revocation/expiry, delegation and action-to-permission matrix. Do not seed or infer any permission code before this step.
3. **Additive migration `0061_operational_domain_registry`:** one company-scoped authoritative registry with stable identity, approved lifecycle/version fields and an explicit audited resource-mapping table. Add same-company FKs, uniqueness, indexes, RLS policies and least-privilege runtime grants; provide `up` and `down`; do not modify `0001`–`0060`.
4. **Additive migration `0062_actor_domain_assignment`:** company + user + domain assignment with approved scope/validity/revocation semantics, same-company FKs, uniqueness, indexes, RLS and down migration.
5. **Additive migration `0063_product_domain_membership`:** canonical `product.id`, same-company domain/product FKs, unique `(company_id, domain_id, product_id)`, approved membership/local-availability states, reason, optimistic `row_version`, central-lifecycle dominance, indexes, RLS and down migration. No all-active fan-out or backfill without owner evidence.
6. **Additive migration `0064_product_domain_membership_history`:** immutable events with actor/time/action/before/after plus an approved immutable domain-identity snapshot and retention/display fields; same-company FKs, select-only runtime grant, RLS and down migration. Keep `product_catalog_history` untouched.
7. **Native migration gate:** isolated disposable PostgreSQL/PostGIS `up → down → up`, runtime-role RLS tests, FK/uniqueness/index checks, rollback of partial writes/history and cross-company negative tests. No production/shared DB.
8. **Provider binding:** only then bind an owner-approved implementation to `OPERATIONAL_DOMAIN_AUTHORITY`. Resolve domain server-side, authorize each action specifically, reject cross-company descriptors, and revalidate inside `CatalogAccess.write` before any membership write. Keep `product.id` as the sole central SKU.
9. **API/UI activation:** replace only approved 503 boundaries, regenerate OpenAPI and the TS client, add the Persian RTL domain workflow, and activate PM-B3/PM-B6/PM-B8 screens only if their privacy/permission decisions are approved. Keep unrelated central workflows unchanged.
10. **Integration acceptance:** two abstract approved domains sharing one central product; available in one and absent/unavailable in the other; duplicate/concurrency/409; unauthorized cross-domain/cross-company; missing context; deactivation and historical retention; no-rewrite after domain change; API contract and RTL UI behavior.
11. **Gate:** owner acceptance and a separate downstream consumer cutover decision. No merge/deploy/protected-branch change without explicit authorization.

## 7. Owner decisions still required and blockers

All eight decisions remain **OPEN / NOT APPROVED**; see `TASK-PM-01D_OWNER_DECISION_CLOSURE.md` for the concise Persian decision brief and abstract behavior examples. Hard blockers: PM-B1, PM-B4, PM-B5, plus PM-B2/PM-B7 for migration/history design. PM-B3, PM-B6 and PM-B8 can be resolved before API/UI activation rather than before an internal schema, but no deferral is approved by authority.

Remaining blockers: explicit owner decision evidence, IAM/security permission vocabulary, actor-domain assignment source, approved membership/lifecycle states, privacy/retention matrix, additive migration design, isolated native PostgreSQL tests, provider binding, and overall Product Master business acceptance.

## 8. Verdicts and recommended next task

- Baseline preservation: **PASS**.
- Independent central catalog history milestone: **PASS**.
- Automated focused/partition/web/typecheck/build/contract verification: **PASS**.
- Security and data-integrity boundaries preserved: **PASS WITH FINDINGS** (manual visual/a11y and endpoint-specific native evidence UNVERIFIED).
- PM-B1–PM-B8 decision closure: **BLOCKED** (owner-ready document prepared; no approval evidence).
- Domain registry/IAM/membership/lifecycle/API activation: **BLOCKED**.
- Domain-specific DB/RLS/concurrency/retention evidence: **UNVERIFIED**.
- Overall Product Master business acceptance: **BLOCKED**.

**Recommended next task:** `TASK-PM-01E — Owner-approved operational-domain authority implementation`, starting with step 1 of §6. It must not begin until explicit PM-B1–PM-B8 approval evidence and IAM/security sign-off exist. PM-01C's older “TASK-PM-01D” label referred to this current decision-closure/readiness work; the new implementation task is deliberately named TASK-PM-01E to avoid overwriting the completed PM-01D evidence.
