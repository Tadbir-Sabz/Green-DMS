# TASK-PM-02 — Actual implementation map (source-verified, not inferred)

**Status:** implementation map produced before code changes; PM-02-B1 was then implemented and tested.
**Baseline SHA:** `c382d6a822fdf52b711f168f1778443a70194a24`
**Branch:** `arena/be5eaff3-green-dms` · **PR #14:** `OPEN / DRAFT`, base `main`
**Scope rule:** every "missing / partial" statement below was checked against the code at the baseline SHA, not copied from a historical gap register. M4 acceptance work is not repeated and no historical M4 verdict is changed.

---

## 1. What already exists and works (verified)

| Layer | Verified source | State |
| --- | --- | --- |
| Central product identity & shared attributes | `product.repository.ts`, `product.dto.ts`, `product.controller.ts`, `product.service.ts`, migrations `0005`/`0046`/`0047` | Company-owned `product.id`, unique `(company_id, code)`, `status ∈ active/blocked/discontinued`, soft delete, optimistic `row_version`, D1–D5 fields. `company_id` only from session. |
| Central catalog relations | `product-catalog.controller.ts`, `product-master.service.ts` | Families, aliases, attribute defs/values, variant signature, relations, bundles (D5 catalogue-only), barcodes, packaging/UOM with 4-decimal factor. |
| Sensitive D4 boundary | `product-sensitivity.ts`, `product.service.ts`, `product-packaging.service.ts`, `product-master.service.ts`, `packaging.controller.ts`, `product-bulk-maintenance.types.ts` | `RBAC + confirm_sensitive + audit` on product update/create, packaging `factor_to_base`, bundle components and import rows. Bulk maintenance has an explicit protected-field deny list containing `domain`, `domain_id`, `availability`, `factor_to_base`, etc. |
| Central catalog evidence | `catalog-foundation.controller.ts`, `CENTRAL_CATALOG_HISTORY_ENTITY_TYPES`, migration `0060` | Immutable company-wide central history with an 11-type allowlist; per-product history; `/product-catalog/history`; Persian RTL explorer. Domain entity types are excluded. |
| Central import/export/bulk | `product-import.controller.ts`, `product-export.service.ts`, `product-bulk-maintenance.service.ts`, `0061`/`0062`/`0063` | Validate-before-persist CSV, per-batch atomicity/idempotency, bounded repeatable-read export, bounded 100-product/9-field bulk operation with preview/audit/reconciliation. |
| Tenant isolation, RBAC, audit | `identity-rbac/*`, `database/tenant-*`, `common/audit.service.ts`, `catalog-access.service.ts` | `AuthGuard` + `PermissionsGuard`, DB-revalidated `CatalogAccess.assert/write`, transaction-local tenant GUCs, company RLS, `audit_log` partitioning, Persian structured errors. |
| Fail-closed domain boundary | `domain-catalog.contract.ts`, `catalog-foundation.controller.ts` | `DomainCatalogGate` with an unregistered `OPERATIONAL_DOMAIN_AUTHORITY`, `available:false`, `DOMAIN_IDENTITY_UNRESOLVED`, explicit 400 for missing/invalid `x-domain-id`, 503 for any valid-looking domain UUID, no membership data. `pricing_domain`, approval `domain_id`, branch/area/warehouse/company are explicitly rejected as domain identity. |
| Persian-first web | `apps/web/src/app/products/**` | Product list/new/detail (9 tabs), import wizard, export, bulk maintenance, catalog history and domain-decision screens; RTL, permission/loading/empty/error/retry states; no fake domain selector or status switch. |

## 2. What is partial

| Area | Exact partial state |
| --- | --- |
| G-03 / two-person approval infrastructure | `approval_policy`, `approval_request`, `approval_step_def`, `approval_decision` immutability, `approval_binding` fingerprint/supersession/consumption, `policy_snapshot`, `self_approval_forbidden`, `second_person_required`, `consumeApprovedBinding` all exist for `pricing.margin_exception`, sales order/return and purchase order. **No Product Master operation is bound to it.** Product sensitive changes still use `RBAC + confirm_sensitive + audit` (one natural person), which is the approved pre-G-03 fallback, not second-person evidence. See `TASK-PM-02_OWNER_DECISION_REGISTER.md` §3. |
| Central/domain separation before PM-02 | The invariant was documented and partly enforced (bulk protected-field list; DTO whitelists silently strip unknown properties; CSV unknown headers silently ignored; `GET /products/{id}/domain-catalog` returns 503). There was no single explicit, audited, server-side rejection of domain-owned keys across central write surfaces and no positive read projection that states "central status is not domain availability". |
| Domain-aware UI | The product detail "عرضه در دامنه" tab showed only the generic `/product-domain-integration` refusal; it did not display the product's central lifecycle separately from an explicit unresolved domain state. |

## 3. What is missing (verified in current code)

- No `operational_domain` / `product_domain_membership` table, no domain registry, no additive migration for domain identity.
- No server-side actor-to-domain assignment, no domain scope in `AuthContext`, no domain-aware RLS policy and no domain-scoped permission vocabulary.
- No domain-specific availability, activation, lifecycle, reason, version or immutable membership history.
- No registered `OPERATIONAL_DOMAIN_AUTHORITY` provider; `master-data.module.ts` contains `DomainCatalogGate` but no `provide: OPERATIONAL_DOMAIN_AUTHORITY`.
- No domain selector, membership list/write controls, availability switch or cross-domain history UI.
- No downstream consumer cutover (pricing, inventory, orders) to domain availability.

**These are not claimed as regressions.** They are the exact owner-gated scope of PM-B1..PM-B8 / TASK-PM-01E.

## 4. What is blocked by explicit owner decisions

- **PM-B1..PM-B8** (domain identity/ownership, lifecycle, list permissions, central-vs-domain authority, membership state machine, absent-product visibility, retirement history, cross-domain visibility) — all `OPEN / NOT APPROVED`.
- **Q1..Q5** (whole-file import atomicity, partial success, retry vocabulary, file/batch status, audit/history semantics) — all `OPEN / NOT APPROVED`.
- **G-03 Product Master two-person binding** — operation matrix, identity/role vocabulary, fingerprint fields, invalidation/retry, audit contract and owner-approved policy are missing. Existing pricing/order bindings must not be reused speculatively.
- **TASK-PM-01E** registry/IAM/membership/migrations/API activation — all gated on the above plus IAM/security sign-off.

No approval record, signatory, resolution number, domain ID, permission code or seed row was supplied. Nothing above is inferred as approved.

## 5. What can safely proceed using approved requirements

| Approved requirement (source) | Independent implementation | PM-02 decision |
| --- | --- | --- |
| "domain-specific membership must never be silently treated as a global product property" (user constraint; `TASK-PM-01_PRODUCT_MASTER_SPEC.md` §2/§5; `PRODUCT_MASTER_TARGET_DESIGN.md` §TASK-24Z-EXIT-GATE) | Server-side, fail-closed rejection of domain-owned keys on central product create/update/delete and CSV import header validation, before DTO whitelisting; explicit rejection of `x-domain-id` on central operations; audited. | **SELECTED & IMPLEMENTED** |
| "do not introduce global activation as a substitute for domain-specific activation" | Authorized, read-only `GET /products/{id}/domain-scope` that reports central lifecycle facts and always returns `unresolved` domain context/membership/availability with `available:false` and an explicit invariant flag. No inference from `product.status`. | **SELECTED & IMPLEMENTED** |
| "Persian-first RTL, consistent API/UI, server-side authorization, auditability, positive/negative/boundary/cross-domain tests" | New OpenAPI path/schema + generated client, three web screens updated, 24 new DB-free API tests, 12 native-PostgreSQL HTTP tests, 6 new/changed web tests. | **SELECTED & IMPLEMENTED** |
| Additive migrations only when required | **No migration added.** The capability is a boundary + read projection over existing `product`, `product_catalog_history` and `audit_log`; no new table, grant, RLS policy or domain state. | **PASS** |
| Keep domain workflows fail-closed | `DomainCatalogGate` remains unregistered; 400/503 blocked routes unchanged; no membership persistence, no provider, no permission vocabulary. | **PASS** |

## 6. Deliberately not done in PM-02

No domain registry, membership table, lifecycle state machine, domain permission, actor assignment, domain RLS, backfill, downstream cutover, G-03 Product Master binding, whole-file import behaviour change, D1–D5 change, PR readiness change, merge/approve/release/deploy, production DB/infrastructure/secret change, or M4 verdict change. Full Product Master acceptance remains **BLOCKED**.
