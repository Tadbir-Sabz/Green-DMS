# TASK-PM-02-B2 — Consolidated owner-decision package
### Operational Domain Authority, Registry & Membership

**Status: BLOCKED / OPEN / NOT APPROVED.** This is a decision *request*, not a
decision, approval, deferral-by-authority, or implementation. It consolidates
the three gating owner questions (PM-B1, PM-B2, PM-B4) that stand between the
current fail-closed system and any operational-domain authority, plus the exact
evidence required to unblock them. No PM-B1..PM-B8, Q1..Q5 or G-03 item is
closed, signed, owned by a named individual, or executed as policy here.

> خلاصه فارسی: این سند پرسشهای دقیق و حلنشدهٔ PM-B1 (هویت دامنه)، PM-B2 (چرخهٔ
> حیات) و PM-B4 (اختیار و انتساب) را همراه گزینهها، توصیهها، پیامدها، عناصر دقیقاً
> مسدودشده و شواهد پذیرش لازم، در یک بستهٔ کوتاه گردآوری میکند. هیچ مصوبه، امضا،
> شناسهٔ دامنه، مجوز، مهاجرت، عضویت یا نمونهٔ اجرایی ساخته نشد. رجیستری، چرخهٔ
> حیات، انتساب، عضویت، RLS و فعالسازی API/UI دامنهای تا تصویب کتبی مالک و تأیید
> IAM/امنیت **مسدود** میماند.

---

## 0. Why implementation is gated (verified evidence, not assumption)

Scope of this task is `TASK-PM-02-B2 — Operational Domain Authority, Registry &
Membership`. The PM-01B/PM-01C/PM-01D decision gate is a hard precondition
(`TASK-PM-01B_DOMAIN_OWNER_DECISIONS.md` §2/§4, `TASK-PM-01D_OWNER_DECISION_CLOSURE.md`,
`PRODUCT_MASTER_TARGET_DESIGN.md` §F). A fresh, exhaustive search of the durable
state at the B2 baseline commit `dad4ce8a41b66fedd06ef66b5bbfa25e4e86d31a` found
**no written approval**:

| Channel inspected | Result |
|---|---|
| PR #14 reviews / review comments | `0` / `0` |
| PR #14 issue comments | `1` — an independent read-only review *request*, explicitly "This request is not an approval." |
| GitHub issues (all states) | `#11`, `#12` only — unrelated TASK-23R partition follow-ups |
| All tracked `docs/product-inventory/*.md` | PM-B1..PM-B8, Q1..Q5, G-03 all `OPEN / NOT APPROVED`; every `تصویب/مصوب` phrase describes a *future hypothetical* ("پس از مصوبه") |
| `git log --all` / `git ls-files` for approval or sign-off artifacts | no product-owner answer, approval reference, accountable signatory, IAM/Security sign-off, acceptance example, or cutover/backfill policy |
| `TASK-PM-02_IMPLEMENTATION.md` §8 | recommends a B2 spike **after** explicit approval evidence; a recommendation is not an approval |

Therefore, per PM-01B §4, the following **must not be implemented** until the
artifact in §3 exists: domain registry and mapping, lifecycle/state machine,
actor-to-domain assignment, central/domain authority matrix, membership and
availability, additive migrations, domain-aware RLS / least-privilege grants,
domain-scoped permission vocabulary, domain APIs, and Persian RTL activation of
blocked domain UI. `OPERATIONAL_DOMAIN_AUTHORITY` stays unregistered and
`DomainCatalogGate` stays fail-closed (`available:false`, `503` on
`requireAuthority()`/`blocked()`).

Silence, existing tests, historical recommendations, B1 implementation, and a
review *request* are not approvals. Stage counts in the approval engine are not
two natural persons; `pricing_domain`, `approval_policy.domain_id`,
`approval_request.entity_domain_id`, branch/area/warehouse/company and labels
are **not** approved operational catalog-domain identity.

---

## 1. The three gating decisions

### PM-B1 — Domain identity and ownership

- **Exact unresolved question.** What *exactly* is an operational product-catalog
  domain? What stable, company-scoped ID/code/name identifies it? Who owns it?
  May any existing object be reused, or must an explicit audited mapping be
  created? (PM-01B §2; closure doc §PM-B1.)
- **Alternatives.**
  (a) A **new, explicit, company-scoped authoritative registry** with an audited
  mapping to approved organizational objects;
  (b) a **verified semantic equivalent** of an existing object plus a signed,
  audited equivalence/mapping contract;
  (c) **derive** domains implicitly from `branch` / `sales_area` / `warehouse` /
  `company` / `pricing_domain` / labels.
- **Recommendation (advice only).** (a). (c) is explicitly forbidden by the task
  because it silently equates distinct business objects; (b) is acceptable only
  with a signed equivalence proof that does not exist today.
- **Consequences.** A wrong ID/mapping can create cross-domain or cross-company
  access, rewrite immutable history when an identifier changes, and make
  `product.id` appear to be domain-scoped. Identifiers must be server-issued and
  company-scoped; a client-supplied UUID is never proof of identity.
- **Precisely blocked implementation elements.** `product_domain` registry table
  and additive migration; `domain_id` foreign keys from any membership table;
  mapping/backfill routines; `resolve`/`list` provider implementations; domain
  identity fields in `AuthContext` or OpenAPI/client schemas; cross-company and
  cross-domain registry tests; any domain selector in the UI.
- **Acceptance evidence required.** Written choice with rationale; domain
  definition; stable-ID/code rules; signed mapping matrix; explicit
  backfill / no-backfill + cutover policy; cross-company rejection examples;
  IAM/Security sign-off.

### PM-B2 — Domain lifecycle

- **Exact unresolved question.** Which lifecycle states exist (enabled /
  disabled / suspended / retired / blocked)? Which transitions are legal, who
  may perform them, and with what version/optimistic-concurrency rule? Do retired
  domains remain readable, and what happens to existing memberships and in-flight
  operations? (PM-01B §2; closure doc §PM-B2.)
- **Alternatives.**
  (a) An **explicit, versioned state machine with an approved transition table**;
  (b) a single boolean `is_active` (as `pricing_domain` uses for pricing scope);
  (c) an **implicit** status derived from other fields or from central
  `product.status`.
- **Recommendation (advice only).** (a). (b) cannot express retirement vs.
  temporary disable and has no approved semantics for Product Master; (c)
  collides with the approved invariant that central active ≠ domain availability.
- **Consequences.** A bad transition can make a retired domain writable again or
  revive stale assignments; a mutable status join can silently rewrite historical
  meaning. `pricing_domain.is_active` is a pricing flag and is not substitutable.
- **Precisely blocked implementation elements.** Domain status/state columns and
  enums; transition endpoints and guards; activation/suspension/retirement
  workflows; optimistic-lock/`row_version` rules; lifecycle-aware membership
  validity and history display; retention rules; transition/concurrency tests.
- **Acceptance evidence required.** Signed state/transition/permission table;
  version rules; effect on in-flight operations; post-retirement read rules;
  rollback and transition tests; process/domain-owner + governance + Security
  (and data-retention owner if applicable) sign-off.

### PM-B4 — Central vs. domain management authority and actor assignment

- **Exact unresolved question.** Who may create/retire domains, assign and revoke
  users, and manage memberships centrally vs. locally? Is domain-scoped
  delegation allowed, and does it require second-person approval? What is the
  authoritative source of actor-to-domain assignment, and what is the
  missing-context / stale-assignment / fail-closed rule? (PM-01B §2; closure doc
  §PM-B4.)
- **Alternatives.**
  (a) A **split central/domain authority matrix** with explicit, revocable,
  expiring actor-domain assignments and IAM-approved scoped permissions;
  (b) **central-only** authority (no domain delegation);
  (c) **domain-only/local** authority.
- **Recommendation (advice only).** (a), with an explicit fail-closed rule for
  missing or stale context and IAM/Security sign-off. (b)/(c) are legitimate
  owner choices but must be written down; they cannot be inferred.
- **Consequences.** Without explicit assignment, old access survives role or
  location changes; `master.product.view` / `master.product.update` must never be
  implicitly promoted to "manage domain membership". Company RLS is necessary
  but not sufficient for domain authorization.
- **Precisely blocked implementation elements.** Authority matrix and
  `authorize` resolver; actor-to-domain assignment table/source; assignment and
  revocation endpoints; delegation/expiry rules; any new domain-scoped permission
  codes or `AuthContext` fields; server-side membership writes guarded by domain
  authority; least-privilege grants; missing-context, stale-assignment and
  revalidation-in-transaction tests.
- **Acceptance evidence required.** Signed authority matrix; assignment source;
  revocation/expiry rules; explicit fail-closed behaviour; IAM/Security +
  governance + domain/process-owner sign-off (plus Compliance if sensitive
  approval is required).

---

## 2. Decisions that remain blocked but are not gating the first increment

`PM-B3` (domain listing/search permissions and field visibility), `PM-B5`
(membership create/remove/deactivate state machine), `PM-B6` (visibility of
products not yet in a domain), `PM-B7` (immutable domain-identity snapshots in
membership history), `PM-B8` (cross-domain detail/history visibility), `Q1..Q5`,
`G-03` (any Product Master two-person approval binding), and `TASK-24Z`
unique-approver/snapshot/deny policy all remain **OPEN / NOT APPROVED**. Full
Product Master acceptance is **BLOCKED**; production deployment is
**NOT AUTHORIZED**. None may be inferred from pricing/approval infrastructure or
from the number of approval stages.

---

## 3. The exact artifact that unblocks implementation

One row per decision, in a written, referenced, signed owner-decision document
(columns borrowed verbatim from `TASK-PM-01D_OWNER_DECISION_CLOSURE.md` §approval
table):

| decision ID | document number/date | organizational approval reference | chosen option | approved examples | IAM/Security sign-off | acceptance evidence |
|---|---|---|---|---|---|---|

Each row must additionally carry: the rationale, the accountable owner role and
named signatory, the security/privacy consequences accepted, the
migration/cutover/backfill policy, and the concrete acceptance tests. Until that
artifact is present in the durable GitHub state (tracked doc, PR review/approval,
or issue), the §0 block list is absolute. This document, B1/B2 tests, and any
recommendation are *inputs* to that decision — never substitutes for it.

---

## 4. What this B2 pass actually changed (independent, non-gated work)

Only fail-closed **parity** of the already-approved central/domain separation
boundary on existing central **read** surfaces — no domain semantics invented:

- `DomainBoundaryGuard` added to `GET /products` (list), `GET /products/{id}`
  (detail), `GET /products/export` (CSV) and `GET /products/import/report/{id}`.
  Previously the global `ValidationPipe` (`whitelist:true`, no
  `forbidNonWhitelisted`) silently stripped an unknown `?available=true` /
  `?domain_id=…` key, so a caller could receive an unchanged **full central**
  page/CSV while believing it had asked for domain-scoped data. The guard runs
  before pipes and rejects such keys and any `x-domain-id` header with a stable
  `400` (`domain_property_rejected` / `domain_context_not_supported`), key-only
  audit, and fail-closed behaviour if audit fails.
- Domain-context routes (`operational-domains/current`,
  `products/:id/domain-membership`, etc.) that intentionally read
  `@Headers("x-domain-id")` and fail closed via `DomainCatalogGate` are
  **deliberately not** given this guard — no blanket rejection.
- `packages/contracts/openapi.yaml`: documented `400` on
  `/products/import/report/{id}` and a note in the `Error.code` PM-02 boundary
  section; `packages/api-client/src/schema.ts` regenerated deterministically
  (openapi-typescript 7.13.0).
- Tests: DB-free guard unit cases for read-shaped requests, a DB-free structural
  parity suite (`apps/api/test/product-domain-boundary-read-parity.test.ts`), and
  real-HTTP / native-PostgreSQL negative + positive cases on all four read
  surfaces.

**Not changed / not created:** no migration, table, column, enum, seed, grant,
RLS policy, role, `OPERATIONAL_DOMAIN_AUTHORITY` provider, domain permission,
assignment, membership, lifecycle, availability, backfill, cutover, domain API,
or domain UI activation; no weakening of `DomainCatalogGate`, D1–D5, D4/G-03,
§E, migrations `0060..0064`, or the PM-02-B1 separation boundary. PR #14 remains
`OPEN / DRAFT`; no merge/approve/release/deploy.

---

## 5. Verdicts

| Area | Verdict |
|---|---|
| Owner decisions PM-B1 / PM-B2 / PM-B4 (and PM-B3/B5–B8, Q1–Q5, G-03) | **BLOCKED** (no written approval or IAM/Security sign-off) |
| Registry / lifecycle / assignment / membership / migrations / domain RLS / domain APIs / UI activation | **BLOCKED** — deliberately not implemented |
| B2 baseline durability, backup integrity, approval-evidence inspection | **PASS** |
| Fail-closed read-surface parity, contract/client consistency, guard ordering, no blanket rejection | **PASS** (local static + DB-free + native-PostgreSQL HTTP evidence) |
| Full Product Master business acceptance | **BLOCKED** |
| Production deployment | **NOT AUTHORIZED** |
| Production topology / PostGIS + password-auth equivalence; manual RTL/a11y/console; independent Agent-2 review; raw per-test CI logs | **UNVERIFIED** |

No B2 gate `FAIL`: the only local full-suite failures (4 files / 17 tests in
`customers`, `geofences`, `tours`, `postgres-init-role`) were reproduced
**identically on the pristine baseline** and are local-environment artefacts
(missing PostGIS geometry, trust-auth accepting a wrong password), not B2
regressions.

---

## 6. One recommendation

Obtain the signed §3 package for **PM-B1, PM-B2 and PM-B4** together with
IAM/Security sign-off and accepted examples before any domain-authority work.
Only then implement the company-scoped additive registry, lifecycle and
actor-to-domain assignment with domain-aware RLS/least-privilege grants and
native up/down/up evidence; only after that should membership/availability
(PM-B5–B8) and the blocked 400/503 endpoints be activated. This must not weaken
the PM-02-B1 separation boundary or the B2 read-surface parity.
