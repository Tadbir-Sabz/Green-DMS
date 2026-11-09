# TASK-PM-01 — Product Master transition specification

**Status: PREPARED / DECISION-GATED, not implementation approval.** No source/schema change, new module rollout or production change in this task. Canonical scope: `PRODUCT_ROADMAP.md` §§5,8; approved Product Master decisions D1–D5 in `PRODUCT_MASTER_TARGET_DESIGN.md` §0 remain binding. That document's older implementation-status column is not a fresh inventory.

## 1. Existing foundations and architecture reconciliation

Targeted source review, not a new full audit:
- `0005_product_catalog` already provides company-owned product identity/category/brand, UOM/packaging and batch foundations.
- `0046_product_master` already adds family/signature, aliases, attribute definitions/enum values/SKU values, relations, catalogue bundles, typed barcodes, code generation, import and historical support. `0047_product_master_rls` supplies ownership/RLS hardening. Do **not** create these again merely because the older target labels them new.
- `product-catalog.controller.ts` already exposes family, alias, attribute, enum, relation, bundle and duplicate-check routes. Product CRUD, packaging, reference reads, import and corresponding repositories/services exist. Reuse them; feature existence alone is not end-to-end verification.
- `product-sensitivity.ts`/`product.service.ts` currently enforce RBAC plus explicit `confirm_sensitive` fallback for sensitive changes, with status privilege checks. This boolean is **not a second natural person's decision**. Green shared approval tests do not prove Product Master binding integration; do not remove fallback or claim integration without implementation/tests.
- No product-domain assortment/availability persistence or API was found in the targeted product code/migration search. Existing pricing `domain_id` fields are not an authoritative product-domain registry.

**Explicit reconciliation:** older target §A says branch-scoped catalog definition is out of scope. Retain one company catalog/SKU identity; add a distinct operational-domain availability/assortment layer. The user's current rule—one product may be active in A and absent/unavailable in B—is a required constraint, not an optional enhancement. This addendum supersedes any interpretation that company-wide `active` alone grants every domain access. It does not silently equate domain with branch or change the canonical phase order. Product/domain owners must approve concrete identity, autonomy and rollout choices below.

## 2. Domain model and module boundary

| Concept | Ownership and identity | Planned behavior / boundaries |
|---|---|---|
| Product/SKU | Company-owned `product.id`, unique company/code | Remains the sole SKU referenced by existing pricing, order, inventory and invoice FKs. No per-domain clones, tenant sharing or new financial identity |
| Classification | Existing company category hierarchy/brand/tax reference | Central catalog governance; no unapproved local tax/category override. Domain filters may reference central classifications; local merchandising classification is separate future design if required |
| UOM/packaging | Existing UOM catalogue and per-product packaging | Reuse current scopes, factor_to_base numeric(19,4), defaults and barcode relations; no domain-specific conversion/tax identity. Preserve exact approved financial rounding and snapshot behavior |
| Family/attributes/variants | Existing family + typed attribute model | Operational variant = independent SKU when price/stock/tax/barcode/lifecycle differs. Descriptive attribute does not automatically make SKU. Retain canonical normalization/signature uniqueness and referenced-axis immutability; verify actual implementation before extending |
| Central lifecycle | Existing active/blocked/discontinued/deleted state | Domain autonomy cannot revive centrally stopped/deleted product or rewrite historic facts. Keep current status privilege/confirmation controls until approved approval integration replaces/augments them |
| Operational domain | Authoritative company-scoped business domain, concrete mapping OPEN | Not automatically branch, warehouse, tenant or approval UUID. Reuse a registry only after ownership/semantics verified. A mapping to branch/area/etc must be explicit, company-safe and audited |
| Product-domain membership | Proposed relation between central SKU and domain | Absence of membership represents **absent from that domain**. Explicit membership can be available or unavailable; distinguish absent from suspended. Does not mean zero stock, missing price or central deletion |
| Effective availability | Derived, not a second product identity | Recommended rule: valid same-company domain + authorized actor + central product active + domain membership available; local availability cannot lift central restrictions. Owner approves exact lifecycle/legacy edge behavior before enforcement |

### Required examples (business invariant, no invented mapping)

1. Product P centrally active, domain A membership available, domain B no membership: P is available in A and **absent in B**. Never infer B availability from central active.
2. Same P, A available, B unavailable: show distinct local unavailability/reason to authorized operators; A remains unaffected.
3. Central P blocked/discontinued: domain available cannot grant use contrary to central lifecycle. Historical references remain intact.
4. Foreign-company domain/product/actor combinations: deny, not a fallback to company-wide/default domain.
5. A domain reorganization cannot silently change product SKU identity, already-confirmed documents, packaging factors or old approval decisions.

## 3. Central governance versus domain autonomy

**Central controls to preserve:** SKU/code/barcode identity, ownership, base UOM, variant axes, tax/compliance flags and central lifecycle. Approved sensitive-field D4 applies at service boundaries including import/bulk/packaging/jobs. D5 bundles remain catalogue-only until operational P5 design; domain “available” must not make bundles orderable.

**Recommended bounded local autonomy:** authorized domain operator can request/change assortment membership and local available/unavailable state/reason within their assigned domain, subject to approved sensitivity rules and central prohibitions. No implicit rights to edit central product, tax, units, policy, stock or price. Whether local changes require approval, who can publish and whether temporary windows are allowed remain explicit owner decisions, not code defaults.

Do not confuse:
- catalog existence with operational membership;
- availability with inventory balance, ATP, price eligibility or legal permits;
- product central stop with D05 approval-policy deny language;
- user data-scope assignment with business domain ownership;
- explicit confirmation with separate-person approval.

## 4. Proposed additive persistence (design only)

After identity decisions, prefer a minimal same-company model:

```text
operational_domain (or reuse a verified equivalent)
  id, company_id, code, name, lifecycle, row_version
  unique(company_id, code), unique(company_id, id)
  authoritative mappings to organizational objects: explicit, not free UUID inference

product_domain_availability
  company_id, domain_id, product_id
  state: available | unavailable     [proposed spelling; approve contract]
  reason, created_by/at, updated_by/at, row_version
  unique(company_id, domain_id, product_id)
  company-consistent FKs to domain and product (or equivalent enforced ownership)
```

- No row = absent; no automatic all-domain fan-out during product creation. Archived historical assignments remain auditable; choose an explicit withdrawal model rather than silently deleting history.
- Verify existing domain registry first; avoid duplicate sources of truth. Composite ownership constraints/validated equivalent and RLS required; FK existence alone is not tenant authorization.
- Keep source-of-truth small. Do not add domain-specific price lists, tax rules, procurement or inventory ledgers here.
- Use existing audit infrastructure for immutable before/after changes; if membership history requires temporal rows beyond existing audit, design it explicitly, not an unverified mutable `reason` as complete history.
- Add indexes for company/domain/state/product queries and active operator lookup after defining expected volumes. No unsupported capacity claim.
- Add migration up/down with exact loss consequences, same-company constraint tests and native runtime-role RLS checks. No backfill equating all central active products with available everywhere. Existing legacy data needs an owner-approved rollout policy; down must never rewrite existing documents or remove base product history.

## 5. Proposed API and operator journeys

Names below are **proposed, not existing endpoints**, subject to approved domain model and OpenAPI review:

| Contract surface | Behavior |
|---|---|
| Read domain registry / mappings | Only authorized company/domain scope, stable IDs; no cross-company resolution |
| `GET /products/{id}/domain-availability` | Authorized catalog/domain oversight; returns explicit memberships and effective central restriction, not universal availability |
| `PUT /products/{id}/domain-availability/{domainId}` | Authorized create/update of one membership with reason and expected row_version; stale change409; explicit actor and audit; approved sensitivity/approval boundary |
| `GET /operational-domains/{domainId}/products` | Domain-context operational listing; available vs unavailable filters require permissions; no row does not appear as implicitly available |
| Domain-context get/resolve | Never fall back to global product after a domain miss. Authorized administration may inspect absent/unavailable distinctly; unauthorized callers must not learn foreign catalog existence |

Retain existing company-catalog `/products` for authorized administration; it is not a domain-operational availability assertion. Do not silently change all current consumer behavior in a migration. Domain-aware consumers require explicit context, approved rollout and service-side integration at each relevant entry point; omitting context must not become a bypass after cutover. Never trust arbitrary caller domain without server ownership/actor-scope validation.

Operator UI: Persian RTL domain selector restricted to authorized scopes, central status visibly separate from local membership/state, clear absent/unavailable/blocked explanations; loading/empty/permission/error/stale/success states; mobile cards and accessible keyboard controls. No extra procurement/treasury/pricing screens. Do not display unauthorized product presence while explaining availability.

OpenAPI is canonical. Reuse generated TS/Kotlin clients and current error envelope; only additive routes/fields, document exact401/403/404/409 semantics and pagination. Contract assertions must cover actual DTO/runtime shape. No schema code generation or route added by this specification task.

## 6. Authorization, audit and transaction requirements

- Tenant context from verified identity; domain scope additionally verified. Company RLS remains necessary but is not sufficient for domain authorization.
- Catalog-view, domain-view, local-manage and central-manage rights must be distinct. Proposed permission codes need IAM approval, not assumed existing `master.product.*` expansion. No broad new rules.view grants to fix decider UX.
- No cross-company/domain assignment by changing path/body identifiers, no untrusted bulk-company field, no job/import bypass. Every supported path uses the same service guard and explicit actor context.
- Atomic change + audit (+ approval-binding consume only if approved integration requires it); optimistic version check and unique key protect simultaneous edits. Retrying must not create duplicate memberships or burn approvals. No transaction nesting on separate pools.
- If sensitive-change approval is selected: define supported product operation, persisted state/fingerprint, request/consume transaction and invalidation semantics. The current supported operation matrix covers sales order/return/purchase, not a proven product-sensitive binding. Shared0059 provenance is reusable but not sufficient integration.
- Audit company/domain/product, actor, delegated identity if applicable, prior/new state, reason, correlation, version and source (API/import/job). Preserve history when central classification, lifecycle or mappings change. No current-value joins that rewrite a confirmed document's product facts.
- Reuse attachments owner-scope, audit hooks, tenant-safe pool cleanup, identity permissions, import validation/idempotence and existing snapshot mechanisms. Preserve precision and positive/negative financial behavior; do not change rounding to a general half-up rule.

## 7. Owner decisions specific to Product Master

These are not approvals and do not replace D01–D07:

| ID | Required choice / recommended option | Authorized owner / affected start gate |
|---|---|---|
| PM-A | What exactly is operational domain and authoritative mapping? Recommend explicit company-scoped registry, reuse only if equivalent verified; never assume branch | Product governance + operational-domain owners + IAM; blocks domain persistence/runtime contract; related to D01 but not automatically same concept |
| PM-B | Legacy products and context-free consumers: which explicit memberships are migrated, who signs off and how does cutover fail safely? Recommend staged validated assignment/cutover, no automatic global active→all domains | Product/process owner + operations/security; blocks rollout, not catalog inventory |
| PM-C | Who may add, withdraw, locally suspend/reactivate and publish membership; is approval required and when? Recommend bounded local rights with central stop dominance and audited reasons; exact approval/escalation semantics chosen by owner | Product/domain owners + IAM/compliance; blocks write authority/approval integration |
| PM-D | How are in-flight documents affected by local/central changes or domain remapping? Recommend preserve historic snapshots and explicitly revalidate relevant unconsumed commitments at their supported boundary; no silent history reuse | Process/finance/product owners; blocks consumer enforcement/cutover |

The user has already required per-domain availability variation; PM-A–D cannot choose to replace it with one company-wide active flag. They specify how to implement it safely. No new pricing, procurement or treasury business policy is authorized.

## 8. Acceptance plan and bounded next implementation task

**TASK-PM-01A — Domain identity and product-assortment foundation**, after exit and PM-A–D gates relevant to each step:
1. Fresh gap inventory of existing0046/0047 code/UX/evidence; reuse catalog/UOM/attribute/variant/import features. Confirm no equivalent operational-domain relation exists elsewhere before migration.
2. Sign off domain identity/mappings and proposed API/RLS/permission contract. Document migration/cutover policy separately from implementation defaults.
3. Add minimal membership persistence/read/write domain-boundary service and its Persian admin slice. No finance/stock/pricing calculation changes. If approval is required for writes, implement the product-specific bridge first or keep writes disabled; do not bypass with UI confirmation.
4. Targeted unit/API/native PostgreSQL/PostGIS/runtime-role/contract/browser evidence:
   - P active in A, absent B; unavailable B distinct; central blocked cannot be locally revived.
   - Foreign company/domain IDs, unauthorized role, locked/revoked rights and omitted context rejected at actual consumer/service boundary.
   - Concurrent membership create/update409/idempotence, audit rollback on injected failure, successful retry; no partial state/history.
   - Existing SKU/code/barcode, UOM four-decimal conversion, variant uniqueness/immutability, import sensitive paths, snapshots and positive/negative financial regression remain intact.
   - Old documents unchanged after local availability, category, UOM, tax or domain mapping change; owner-defined in-flight behavior tested.
   - Persian desktop/mobile/keyboard journey with actual populated data and captured/classified console/network/screenshots; no invented bindings.
5. No deployment or global consumer cutover in PR13. Demonstrate only explicitly integrated boundaries; do not advertise operational enforcement for untouched consumers. Follow-up consumer adapters require owning-module scope and regression acceptance.

**Stop conditions:** no domain identity/rollout/authority decision, unresolved mandatory current-module exit boundary, missing independent review/gate disposition, or a failing isolation/financial invariant. Independently continue schema/contract discovery and nondependent acceptance specification; do not use stop conditions to block unrelated completed catalog capability.

**Definition of readiness:** current approval prerequisite accepted, named PM decisions recorded, additive contract/migration approved, bounded acceptance plan agreed. Until then this is an actionable specification, not permission to begin a broad implementation or a claim of Product Master completion.
