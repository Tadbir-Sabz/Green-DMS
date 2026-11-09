# TASK-PM-01C — Operational Domain Security and Data-Integrity Model

**Status: PROPOSED security target plus implemented-baseline evidence.** This document does not approve business policy, register a domain authority, create IAM permissions, change RLS/RBAC, or claim domain-level database enforcement. PM-B1–PM-B8 remain **OPEN / NOT APPROVED**.

Baseline: PR #14 head `19b7611cb8ce5534709245486e48b4814deb5bd0`; PM-01B fail-closed implementation is preserved. No PM-01C source, migration, grant, policy, OpenAPI or workflow change was made.

> خلاصه فارسی: امنیت فعلی شرکتـمحور و بستهشدن ایمن دامنه حفظ میشود. احراز هویت، مجوز مرکزی، GUC نشست، RLS شرکت، تراکنش مشترک و تاریخچه مرکزی پیادهسازی شدهاند. هویت دامنه، انتساب کاربر به دامنه، مجوز دامنهای، RLS دامنهای و تاریخچه عضویت فقط «پیشنهاد نیازمند مصوبه» هستند و هیچ شواهد اجرایی دیتابیسی برای آنها ادعا نمیشود.

## 1. Non-negotiable invariants

1. Company identity comes from the authenticated session, never from request body/query/header.
2. A domain UUID is an untrusted reference until a server-side authority resolves it.
3. Company RLS is necessary but never sufficient for domain authorization.
4. Domain-scope assignment is explicit, same-company, revocable/expirable and action-specific.
5. Read, write and history endpoints have independent authorization decisions.
6. Every relevant service write boundary revalidates authorization inside the shared transaction before mutation.
7. Cross-company and cross-domain access fail closed. Missing mandatory context fails closed.
8. Local domain availability cannot override central product lifecycle.
9. Membership and domain identity history are immutable snapshots; current-value joins must not rewrite historical meaning.
10. No broad grants, RLS weakening, superuser/BYPASSRLS runtime, client-trusted permission array or fake domain mapping is permitted.

## 2. Enforcement-boundary matrix

| Boundary | Required control | Implemented on PM-01B SHA | Requires approved business contract | Executable evidence status |
|---|---|---|---|---|
| Authentication | Bearer verification plus live session/user/account/lock checks in `AuthGuard` | **IMPLEMENTED** | No | Existing auth/API suites and PM-01A/PM-01B CI |
| Company isolation | `AuthContext.companyId` from session; tenant GUCs set transaction-locally; `fn_current_company_id()` fail-closed; company RLS/FORCE | **IMPLEMENTED** | No | PM-01A/PM-01B native PostgreSQL CI; `0041`/`0047` |
| Central RBAC | `PermissionsGuard` plus DB-resolved `CatalogAccess.assert` | **IMPLEMENTED** | No for existing central writes | PM-01B DB-free unit tests; PM-01A native tests |
| Domain context validation | Required UUID-shaped `x-domain-id`; malformed/missing returns 400 | **FOUNDATION IMPLEMENTED** | No | `domain-catalog-foundation.test.ts` 10/10 |
| Domain identity resolution | Server-side `resolveDomain` with same-company descriptor and action context | **NOT IMPLEMENTED**; only `OPERATIONAL_DOMAIN_AUTHORITY` interface exists | **YES — PM-B1/B3/B4** | UNVERIFIED |
| Actor-to-domain assignment | Explicit same-company assignment, revocation, validity window, delegated identity if approved | **NOT IMPLEMENTED** | **YES — PM-B3/B4 + IAM** | UNVERIFIED |
| Action-specific authorization | Separate `list_domains`, `resolve_domain`, `read_membership`, `read_history`, `manage_membership` technical capabilities | Interface/gate only; no real provider | **YES — IAM/security approval of exact permission vocabulary** | UNVERIFIED |
| Cross-company protection | Reject provider descriptor with foreign `company_id`; RLS company check | Gate logic + company RLS implemented; domain table does not exist | Domain tables require PM-B1 | DB-free tests for gate; domain DB tests BLOCKED |
| Cross-domain protection | No membership row or history from another domain visible without explicit approved role | Fail-closed 503 avoids all data | **YES — PM-B3/B4/B8** | UNVERIFIED |
| Read authorization | Domain list, current domain, member list, product membership, history each separately authorized | All reads fail closed | **YES — PM-B3/B6/B8** | UNVERIFIED |
| Write authorization | Add/change/remove membership check provider, central RBAC, transaction context and domain scope | All writes fail closed before mutation | **YES — PM-B4/B5** | UNVERIFIED |
| Transaction-level revalidation | Provider authorization checked before and inside `CatalogAccess.write` transaction | Gate recheck logic implemented with mock provider in unit test; real provider absent | **YES — real provider contract** | Unit evidence only; no DB domain write |
| DB RLS | Existing company RLS remains; proposed domain RLS per membership/history/assignment table | Company RLS IMPLEMENTED; domain RLS NOT IMPLEMENTED | **YES — approved schema/migration** | Company RLS previously CI-tested; domain RLS UNVERIFIED |
| History access/audit | Immutable `0060` central history; proposed domain membership history with snapshot | Central history IMPLEMENTED; domain history NOT IMPLEMENTED | **YES — PM-B7/B8 + retention policy** | Central select-only/runtime-role tested; domain history BLOCKED |
| UI permission/privacy | Persian RTL blocked state with permission/loading/error/empty states | **IMPLEMENTED** | Functional domain UI requires PM-B3/B4/B5/B6/B8 | jsdom 5/5 and existing 4/4 |
| Downstream consumers | No inventory/procurement/sales/distribution/warehouse/pricing execution from Product Master | **OUT OF SCOPE / NOT IMPLEMENTED** | Separate owner/module gates if ever integrated | UNVERIFIED |

## 3. Current implemented flow versus target flow

### Current PM-01B flow, enforced

1. `AuthGuard` verifies live session and builds `AuthContext` containing company/user/roles/permissions but no domain identity.
2. `PermissionsGuard` enforces existing `master.product.view` or `master.product.update`.
3. `DomainCatalogGate.requireDomainContext` rejects missing/malformed domain context with 400.
4. With no registered `OPERATIONAL_DOMAIN_AUTHORITY`, `requireAuthority()` throws 503. No provider query, product query, membership query or history query runs.
5. Domain write endpoints enter `CatalogAccess.write`, which DB-resolves central permission and sets transaction-local company/user GUCs; the gate recheck is inside that transaction in the provider-present test path and then throws 503 before any mutation.
6. The UI renders the real decision/technical-contract status; no fake domain selector or membership switch exists.

### Target flow, only after owner approval

1. Approved authority provider resolves `domainId` to a stable same-company descriptor.
2. IAM/security-approved actor-to-domain assignments and action-specific permissions are resolved server-side.
3. Read and history endpoints filter by authorized domain scope and approved privacy matrix.
4. Write endpoints open the existing shared transaction, revalidate central permission and domain authorization inside it, perform an atomic membership mutation, and write immutable before/after history in the same transaction.
5. Company RLS plus tested domain RLS enforce database boundaries under `dms_app`; runtime-role tests prove no broad grant.
6. Cross-domain comparison/audit endpoints use approved role/field matrices and log access events.
7. Consumers still use explicit domain context; missing context never falls back to company-wide or all-domain availability.

## 4. Controls that can remain/advance now without owner approval

These are technical engineering controls, not business rules:

- Keep all PM-01B domain endpoints fail-closed.
- Keep `available:false` and 503 responses; do not simulate success.
- Keep mandatory domain-context validation and standard error envelope.
- Keep the unregistered provider interface as an integration seam; do not bind any implementation.
- Keep existing `AuthGuard`, `PermissionsGuard`, `CatalogAccess`, tenant GUC cleanup, `dms_app` RLS, central product history and grants unchanged.
- Keep documentation, Mermaid diagrams, owner decision package, dependency graph and traceability current.
- Keep UI honest: loading, permission, empty, error/retry, blocked states, Persian RTL, no fabricated domain data.
- Add documentation-only consistency checks and git integrity checks; no speculative table, permission or workflow.

## 5. Controls blocked until approved business contracts exist

- A single authoritative operational-domain registry and stable identifier.
- Domain lifecycle states/transitions and retirement behavior.
- Domain list/search permissions and field-level visibility.
- Central-versus-domain authority matrix and actor-to-domain assignment.
- Domain-scoped IAM permission names, wildcard behavior, delegation, revocation/expiry.
- Membership states, transitions, reason/version, duplicate/concurrency semantics.
- Visibility matrix for not-yet-registered products and cross-domain history.
- Domain membership tables, FKs, uniqueness, indexes, domain-aware RLS policies/grants and rollback migration.
- Immutable membership history and domain identity snapshots.
- Functional read/write/history APIs, domain selector, status controls, and consumer cutover.

## 6. Data-integrity requirements after approval

| Requirement | Why | Required acceptance evidence |
|---|---|---|
| `unique(company_id, domain_id, product_id)` conceptual constraint | Duplicate membership must not create ambiguous availability | Native duplicate/concurrency tests |
| Composite same-company FKs or equivalent enforced ownership | FK existence alone is not tenant authorization | Cross-company insert/select rejection under `dms_app` |
| Optimistic `row_version` and 409 conflict | Concurrent local changes must not silently overwrite | Concurrent update tests |
| Atomic membership mutation plus history | No partial membership/audit state | Transaction rollback and trigger/history assertion |
| Immutable domain identity snapshot | Retirement/rename/remap must not rewrite history | No-rewrite and retention tests |
| Central lifecycle dominance | Local available cannot revive blocked/discontinued/deleted product | Central-stop tests across two domains |
| No automatic all-domain fan-out | Central active must not imply universal availability | Product active, A available, B absent/unavailable tests |
| Domain-aware RLS under runtime role | Service checks alone are insufficient | `dms_app` SELECT/INSERT/UPDATE/DELETE and FORCE RLS tests |
| Additive migration up/down/up | No historical migration/data rewrite | Isolated disposable PostgreSQL/PostGIS job |
| Privacy-filtered error responses | 403/404 must not leak foreign existence | Unauthorized cross-domain/cross-company HTTP tests |

These are **requirements**, not claims. No domain-specific database test was executed in PM-01C.

## 7. Evidence and honest limitations

- Executable company-level RLS/history/runtime-role evidence exists from PM-01A/PM-01B: final native PostgreSQL jobs reported **47 files / 1029 tests passed**, no skipped/pending line, on the PM-01B SHA.
- PM-01B DB-free gate tests cover missing context, no authority, action-specific provider resolution, cross-company descriptor denial, unauthorized/foreign filtering, service write rollback and RBAC metadata.
- Domain-level RLS, membership FK/uniqueness, concurrency, retirement retention, cross-domain history privacy and consumer enforcement have **no executable evidence** because the business contract and schema do not exist.
- No production/shared DB was contacted. No broad permission was introduced. No independent QA/Agent-2 review or manual visual/accessibility proof was performed for PM-01C.

## 8. Security verdicts

- Existing company/RBAC/central-history controls preserved: **PASS**.
- PM-01B fail-closed domain boundaries preserved: **PASS**.
- Target security model documented consistently with implementation: **PASS WITH FINDINGS**.
- Domain-level RLS/history/consumer enforcement evidence: **UNVERIFIED**.
- Business approval and activation of domain-aware security: **BLOCKED**.
- No weakening of RLS/RBAC: **PASS**.
