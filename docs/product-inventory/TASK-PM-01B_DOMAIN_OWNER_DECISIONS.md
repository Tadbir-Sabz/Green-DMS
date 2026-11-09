# TASK-PM-01B — Operational Domain owner-decision register

**Status: OPEN / owner approval required.** This document records the minimum unresolved business decisions. It is not an approval, a deferral, or a substitute for an authoritative registry. No decision below has been silently implemented. D1–D5 and the previously delivered central Product Master behavior remain unchanged.

## 1. Authoritative model inventory and rejection evidence

Whole-repository inspection found no proven authoritative **operational product-catalog domain** identity, lifecycle, actor assignment, or domain-management authorization contract.

| Candidate | Evidence | Decision |
|---|---|---|
| `pricing_domain` (`0049`) | Company-scoped, `is_active`, `row_version`, RLS by `company_id`; but its schema and migration comments define it as *“قلمروِ قیمتگذاری”* — a unit allowed to hold its own pricing policy. `kind` is restricted to `channel`, `area`, `branch`; `price_list.domain_id`, `promotion.domain_id` and `promotion_evaluation.domain_id` reference it. Its grants and permissions belong to pricing, not product-catalog membership. | **Rejected as product-catalog authority.** Reuse would silently equate a pricing-policy scope with an operational catalog domain, which the task explicitly forbids. |
| `approval_policy.domain_id`, `approval_delegation.domain_id`, `approval_request.entity_domain_id` (`0053`) | Untyped UUID columns with no FK to a domain registry. `TASK-24Z_OWNER_DECISION_REGISTER.md` D01 and `TASK-24Z_POLICY_ELIGIBILITY_CLOSURE.md` P3 state that business ownership/mapping is OPEN and that Product Master domain rollout is blocked until identity/mapping is agreed. | **Rejected.** Not an authoritative identity or lifecycle. |
| `branch`, `sales_area`, `warehouse`, `company`, user-defined labels | Separate business objects with their own schemas and semantics; no product-domain membership or authorization contract. | **Rejected.** Task explicitly forbids implicit equivalence. |
| `AuthContext` / JWT / RLS | `AuthContext` contains `userId`, `sessionId`, `companyId`, `username`, `roles`, `permissions` only. No domain identity, domain assignment, or domain-scope resolver exists. `fn_current_company_id()` enforces company RLS only. | **Missing domain context.** Company RLS is necessary but not sufficient for domain authorization. |
| Product Master schema | `0005`/`0046`/`0047`/`0060` contain central product identity and catalog history, but no `product_domain_*` membership table, no domain registry, and no domain-history relation. | **No existing membership model.** |

Existing `/product-domain-integration` therefore fail closed with `available:false`; `/products/:id/domain-catalog` returns 503 without membership data. No branch, pricing domain, approval scope, warehouse, company, or arbitrary UUID is treated as a domain.

## 2. Business decisions requiring explicit owner approval

Owner roles below are accountable functions, not invented named signatories. A product lead must nominate the actual decision makers and record approval evidence.

| ID | Required decision | Why it cannot be inferred | Affected owner role | Blocks | Acceptance evidence required |
|---|---|---|---|---|---|
| PM-B1 | **Domain identifier and ownership:** what exactly is an operational domain, what stable company-scoped ID/code/name identifies it, who owns it, and whether any existing object may be reused or must be explicitly mapped. | Pricing domains and approval UUIDs have different semantics; branch/area/company/warehouse are not equivalent without an owner rule. | Product governance + operational-domain owners + IAM/security | Domain registry/mapping, membership FKs, API identifiers | Approved examples, ownership boundary, stable-ID rules, mapping/backfill policy, cross-company test cases |
| PM-B2 | **Domain lifecycle:** enabled/disabled/retired states, who may change them, whether retired domains remain readable, and what happens to memberships and in-flight operations. | `pricing_domain.is_active` is a pricing flag, not an approved catalog-domain state machine. | Domain/process owners + security | Domain lifecycle API, membership validity, historical retention | State/transition table, uniqueness/version rules, retention examples, failure behavior |
| PM-B3 | **Domain listing and search permissions:** who may list/search domains and which fields are visible to central users, domain users, and read-only users. | Existing `master.product.view` and `pricing.*` rights are company-level, not proven domain-scope rights. | IAM/security + product/domain owners | Domain selector, list endpoints, not-yet-added browsing | Approved permission names/scopes, privacy rules, unauthorized-response tests |
| PM-B4 | **Central versus domain-level management authority:** who may create/retire domains, assign users to domains, manage memberships centrally, and manage them locally; whether domain-scoped delegation is allowed. | `AuthContext` has no domain assignments and no authority resolver. | IAM/security + governance | All write guards and service authorization | Approved authority matrix, actor-to-domain assignment source, missing-context/fail-closed rules |
| PM-B5 | **Membership creation, removal, and deactivation:** exact states (`absent`, `available`, `unavailable`, withdrawn/suspended), allowed transitions, reason requirements, optimistic concurrency, and whether approval is required. | The task states the invariant that central active ≠ all-domain availability, but does not approve transition semantics or approval wiring. | Product/domain owners + compliance if approval required | Membership writes, history, UI controls | Approved state machine, reason/version rules, duplicate/conflict behavior, approval decision if any |
| PM-B6 | **Visibility of products not yet registered in a domain:** who can browse central products absent from a selected domain, with which fields and privacy constraints. | Showing absence can reveal central catalog existence; hiding it may block legitimate administration. | Product/domain owners + privacy/security | Not-yet-added lists, central/domain detail views | Approved visibility matrix, field list, cross-domain/cross-company non-leak tests |
| PM-B7 | **Historical membership retention when a domain is retired:** whether membership/history rows keep a snapshot of domain identity and status, and how retired-domain references are displayed. | A mutable FK or current-value join would rewrite historical meaning after domain changes. | Governance + data retention owner | History schema, immutable provenance | Approved snapshot fields, retention period, display rules, no-rewrite tests |
| PM-B8 | **Cross-domain product detail and history visibility:** which central/domain roles may compare memberships or see history across multiple domains. | Domain autonomy and privacy are unresolved; company RLS alone does not decide domain boundaries. | Product/domain owners + privacy/security | History/detail endpoints and UI | Approved access matrix, field-level privacy, unauthorized-history tests |

**No recommendation in this register is executed as policy.** In particular, no permission codes, domain states, membership statuses, registry rows, backfill, or implicit all-domain fan-out have been introduced.

## 3. Technical decisions that can be implemented safely without owner approval

These are engineering boundaries, not business rules:

1. Keep `product.id` as the sole central SKU identity; never clone products per domain.
2. Keep all domain-aware endpoints fail-closed until an authoritative provider is approved and registered.
3. Define a narrow provider interface (`resolve`, `list`, `authorize`) but register **no implementation** in this task.
4. Reject missing/invalid domain context with an explicit 400; reject any valid-looking domain ID with 503 while no authority exists. Never accept a client UUID as proof of domain identity.
5. Reuse existing `AuthGuard`, `PermissionsGuard`, `CatalogAccess`, transactions, tenant GUCs, company RLS, and the standard error envelope. Do not add broad grants or weaken RLS.
6. Preserve immutable central history and existing `0060` evidence; do not backfill or fabricate membership history.
7. Use additive migrations only after PM-B1/B2/B4/B5/B7 are approved; include rollback and isolated native PostgreSQL/PostGIS up/down/up evidence.
8. Keep Persian RTL screens honest: show a blocked/decision-required state, loading/empty/error/retry/permission states, and no fake domain selector, memberships, or status switches.
9. Do not implement pricing, inventory, procurement, sales, distribution, warehouse, or approval-engine execution.
10. Keep one integrated PR on the fixed session branch; preserve all prior evidence.

## 4. Post-approval integration contract (not yet active)

An approved authority provider must supply all of the following before membership persistence is enabled:

- stable company-scoped domain identity and lifecycle;
- server-side actor-to-domain assignment and authorization resolution;
- list/search and resolve APIs with explicit permissions;
- membership state/transition and history semantics;
- privacy rules for absent products and cross-domain history;
- migration/cutover/backfill policy with signed examples.

Only then should `product_domain_membership` and its immutable history be added with same-company FKs, uniqueness, indexes, domain-aware RLS plus service authorization, and native up/down/up tests. Until then, DB-specific membership tests are **BLOCKED**, not passed or skipped.

## 5. TASK-PM-01C enrichment — decision-ready package, status unchanged

> خلاصه فارسی: TASK-PM-01C هشت تصمیم بالا را به بستهای قابلبررسی برای مالک تبدیل کرد؛ هیچکدام تأیید نشدهاند. هیچ نام فرد، امضا، شناسه دامنه، سیاست اجرایی یا مجوزی ساخته نشد. پیادهسازی PM-01B همچنان بسته و ایمن است.

**Approval status preservation:** PM-B1, PM-B2, PM-B3, PM-B4, PM-B5, PM-B6, PM-B7 and PM-B8 all remain **OPEN / NOT APPROVED**. No decision is marked approved, deferred by authority, signed, owned by a named individual, or executed as policy. The accountable roles from §2 remain unchanged.

The detailed nine-element decision package is `docs/product-inventory/TASK-PM-01C_OWNER_DECISION_PACKAGE.md`. For each decision it now supplies: current evidence and implementation constraints; the actual business question; two or three viable alternatives; a recommendation with architectural reasoning; security/privacy/operational/data-integrity consequences; dependencies on IAM, RLS, Product Master and other modules; migration and backward-compatibility implications; the exact accountable owner role; and acceptance evidence required before implementation.

| ID | PM-01C package location | Recommended alternative, recommendation only | Status |
|---|---|---|---|
| PM-B1 | Decision package §PM-B1 | Single explicit company-scoped authoritative registry with audited mappings | OPEN / NOT APPROVED |
| PM-B2 | Decision package §PM-B2 | Explicit versioned lifecycle state machine, owner-approved transitions | OPEN / NOT APPROVED |
| PM-B3 | Decision package §PM-B3 | IAM-approved domain-scoped permissions and field visibility matrix | OPEN / NOT APPROVED |
| PM-B4 | Decision package §PM-B4 | Split central/domain authority matrix with explicit actor-domain assignment | OPEN / NOT APPROVED |
| PM-B5 | Decision package §PM-B5 | Bounded membership state machine, no physical delete, immutable history | OPEN / NOT APPROVED |
| PM-B6 | Decision package §PM-B6 | Permissioned and field-filtered candidate-product visibility | OPEN / NOT APPROVED |
| PM-B7 | Decision package §PM-B7 | Immutable domain identity snapshot in membership history | OPEN / NOT APPROVED |
| PM-B8 | Decision package §PM-B8 | Role-based, field-filtered and audited cross-domain visibility | OPEN / NOT APPROVED |

Related PM-01C evidence: `TASK-PM-01C_ARCHITECTURE.md`, `TASK-PM-01C_SECURITY_MODEL.md`, `TASK-PM-01C_DEPENDENCY_MATRIX.md`, `TASK-PM-01C_ROADMAP_ADDENDUM.md`, and four standalone Mermaid diagram files. These documents describe a target state only. No PM-01C migration, code, OpenAPI change, permission seed, RLS policy, registry row, domain identity, lifecycle workflow or functional domain UI was added. The exact next implementation task is TASK-PM-01D in the dependency matrix and remains blocked until explicit owner approval evidence exists.
