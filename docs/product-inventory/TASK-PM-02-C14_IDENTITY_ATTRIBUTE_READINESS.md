# TASK-PM-02-C14 — Product Identity & Attribute Integrity Readiness

**Status:** Planning package only. No business decision is approved by this document. No production behavior, schema, data, RLS, constraints, imports, or normalization rules are changed.

| Item | Value |
|---|---|
| Main baseline | `d14395a323d6dd04c91dc28aeab222b4b9690f68` |
| Included implementation baseline | C11 `205e914930f203f620576cfbdd47755559e4849a`, C12 `ca2382315c758e211d463d2b73c3eb51974b487d`, C13 `6293a57e4b01032e511f6372e2fc35c1252b4018` |
| Repository | `Tadbir-Sabz/Green-DMS` |
| Execution scope | Documentation and implementation-readiness design |
| Windows verification | Owner has explicitly deferred it for now. Status remains **UNVERIFIED**, not PASS; it is not a blocker for this planning package. |
| Real organizational data | **BLOCKED** until an authorized, isolated, enforceably read-only copy exists |
| Production activation | **NOT AUTHORIZED** |

## 1. Purpose and decision

C11–C13 have produced a useful candidate identity engine, collision ledger, normalization profiles, shared cross-field comparison spaces, migration simulation, and redaction controls. They are still isolated under `experimental/`; merging their code does not activate them.

The next step must not be another broad audit. It must turn the existing evidence into a bounded, owner-reviewable implementation plan for two connected integrity concerns:

1. **D1 — Product identity consistency:** decide the comparison and uniqueness semantics before changing any stored identity, index, or scan behavior.
2. **D4 — Required product attributes across the lifecycle:** close the confirmed gap where required-attribute checks are not consistently applied to create, import, category reassignment, and other lifecycle entry points.

C14 is a preparation and decision-closure phase. It does not approve the recommendations below and does not activate candidate code.

## 2. Evidence baseline and facts that must remain intact

The following are recorded findings, not assumptions to be re-proven by another generic audit:

- C10 could not inspect real organizational data. Its zero collision counts are structural zeros, not evidence of a clean catalog.
- C11 identified divergent normalization behavior and six unresolved owner decisions.
- C12 showed that independent field keys miss cross-field collisions and demonstrated a resumable, rollback-capable synthetic migration simulation. Its performance and rollback evidence is synthetic.
- C13 introduced a declarative 15-pair comparison contract and resolved the demonstrated alias/barcode CF-10 case in the candidate engine.
- C13's adversarial tests found and fixed a foreign-company `source_ref` exposure through `provenance`.
- C13 exposed the existing `SKU-9` / `sku-9` inconsistency: application comparisons treat them as equivalent while the current database uniqueness constraint is case-sensitive.
- C10 confirmed that required-attribute enforcement is lifecycle-incomplete: the attribute-value edit path checks required attributes, while product creation, CSV import, and category reassignment do not consistently enforce the same invariant. Bulk maintenance does not currently maintain attribute values.
- No category-to-attribute or family-to-attribute requirement mapping was found in the inspected baseline. Do not invent one or silently assume that a company-wide required attribute is category-specific.

Primary evidence:
- `TASK-PM-02-C10_REAL_DATA_IMPACT_ASSESSMENT.md`
- `TASK-PM-02-C11_NORMALIZATION_CONTRACT.md`
- `TASK-PM-02-C12_SHADOW_IDENTITY_MIGRATION.md`
- `TASK-PM-02-C13_CROSS_FIELD_IDENTITY_RESOLUTION.md`
- `evidence/task-pm-02/EVIDENCE-C13-DECISIONS.md`
- `TASK-PM-02_OWNER_DECISION_REGISTER.md`
- `TASK-PM-02_IMPLEMENTATION_MAP.md`

Historical evidence must remain append-only. Do not rewrite earlier task verdicts or retroactively label synthetic results as real-data results.

## 3. D1 — Decision closure package

All ten decisions below remain **OPEN / NOT APPROVED**. The recommendation is technical advice only.

| Decision | Recommended direction from existing evidence | Required owner clarification / consequence |
|---|---|---|
| D-C11-1 — barcode check digit | Validate GS1 check digits only; do not reject internal/other identifiers using GS1 rules | Owner must define how GS1 candidates are identified and which barcode kinds are subject to validation |
| D-C11-2 — alef variants | Preserve `آ`, `أ`, `إ`, and `ا` as distinct identity characters | Confirm that identity matching must not collapse these forms; optional search-only behavior is a separate policy |
| D-C11-3 — product-code case | Case-insensitive identity semantics, aligning application comparisons and database uniqueness | Approve the resulting collision policy for existing codes such as `SKU-9` / `sku-9`; requires real-data impact assessment and a separate schema/index migration gate |
| D-C11-4 — barcode hyphen | Treat hyphens as display separators in scan comparison while preserving leading zeros | Confirm compatibility with labels and existing warehouse/scanning practices |
| D-C11-5 — ZWNJ | For text comparison, treat ZWNJ as a space; retain explicit rejection in scan space until scan semantics are approved | Confirm whether the text equivalence is acceptable; do not silently strip ZWNJ from identifiers |
| D-C11-6 — search normalization | Use a shared SearchKey contract across web/API/mobile search | Approve the observable search behavior and coordinated client rollout |
| D-C12-1 — cross-company identity | Same textual identifier in different companies is allowed; do not introduce global collision constraints | Confirm that no group-wide shared catalog requirement exists |
| D-C12-2 — shared comparison spaces | Incorporate the comparison-space layer into the canonical C11 contract as a versioned successor | Approve contract versioning/documentation; no behavior activation is implied |
| D-C12-3 — uniqueness index strategy | Use a concurrent, staged index strategy after real-data assessment and conflict resolution | Approve only the migration strategy, not immediate index creation; index validity and rollback must be independently gated |
| D-C13-1 — comparable field pairs | Retain the explicit declarative pair matrix; undefined pairs remain non-comparable/error rather than guessed | Confirm the explicit comparison boundary and reject an all-fields-compare policy |

### 3.1 Required approval record

A decision is not approved merely because a recommendation appears in this document or a test passes. Each decision requires:

- Written owner selection of an option and rationale.
- Accountable owner role and approval reference; do not invent a named signatory.
- Acceptance examples, including positive, negative, and boundary cases.
- Security/IAM review where the decision affects company boundaries or permissions.
- A recorded compatibility and migration consequence.
- An explicit statement whether the decision authorizes design only, implementation, or a later production migration.

Until then, the candidate's `isApproved()` behavior remains fail-closed and all decisions remain OPEN.

## 4. D4 — Required-attribute lifecycle policy

### 4.1 Confirmed gap

The existing implementation does not enforce required attributes consistently across all product lifecycle entry points. The current edit-time check is not a lifecycle-wide guarantee.

The first implementation design must use one authoritative validation function over the **final proposed product state**, invoked consistently by every relevant write path. It must not duplicate slightly different required-attribute logic in controllers, CSV handlers, and category services.

### 4.2 Owner question that must be answered before schema design

What is the scope of a required attribute?

- **Option A — Company-wide:** a required definition applies to every product in that company.
- **Option B — Category-scoped:** requirements depend on the product's category and require an explicit category-to-attribute mapping and lifecycle semantics for category changes.
- **Option C — Family-scoped:** requirements depend on product family and require explicit family membership and mapping semantics.
- **Option D — Mixed policy:** company-wide defaults plus category/family overrides, requiring precedence, inheritance, and conflict rules.

The current evidence does not authorize choosing B, C, or D. No mapping table should be introduced until the owner selects the scope and examples.

### 4.3 Safe technical design independent of the final scope

Once the owner selects the scope, design a single pure validation contract that receives:

- Company and product identity.
- The final category/family context available to that operation.
- Applicable required definitions under the approved scope.
- The complete proposed attribute-value set.
- Operation context (create, update, import row, category reassignment, or another explicitly supported path).

It returns stable, field-addressable validation errors without persisting data.

The same contract must be called by:
- Product create.
- Product update when relevant identity/category/attribute state changes.
- Attribute-value create/update/delete.
- CSV import validation before each batch is committed.
- Category reassignment or category-tree merge where the applicable required set can change.
- Any future write path that changes the final product state.

Do not silently make bulk maintenance an attribute writer. If bulk maintenance later gains attribute support, it must call the same validator.

### 4.4 Required lifecycle semantics

The owner-reviewed design must explicitly answer:

- Can a product be created as a draft/incomplete record?
- At which transition must all required attributes be present?
- Can an existing product become invalid when its category or family changes?
- If a definition becomes required after products already exist, is activation blocked, grandfathered, or accompanied by a remediation workflow?
- Can an attribute value be cleared, and what happens if it is required?
- How are enum values, inactive definitions, and historical values handled?
- How does import report row-level errors while preserving the existing per-batch atomicity and idempotency contract?

Do not assume that every product must be complete at initial creation if the product workflow supports drafts. Do not weaken existing D4 sensitive-field authorization, confirmation, and audit requirements.

## 5. Authorized real-data assessment — prerequisites

C10's real-data gate remains blocked. No direct production connection is permitted.

A future assessment may proceed only when the owner supplies or authorizes a copy satisfying all of the following:

1. Documented source, owner authorization, snapshot timestamp, and approved purpose.
2. Isolation from production and all operational write paths.
3. A dedicated non-superuser role with `rolsuper=false`, `rolbypassrls=false`, no write/DDL privileges, and enforced read-only transactions.
4. Company/tenant RLS context tested using the actual assessment role.
5. Evidence that the assessment role cannot mutate data, bypass RLS, or access unrelated databases.
6. Sufficient data to evaluate the intended cases: multiple companies, product codes, aliases, barcodes, attribute definitions and values, category/family relationships where present.
7. Snapshot integrity hash and reproducible query set.
8. Redacted output: no raw personal or sensitive data in reports; cross-company values and provenance remain redacted.

If any condition is missing, stop before data queries and report the exact missing prerequisite. Do not search for alternate credentials, endpoints, backups, or production access paths.

## 6. Implementation sequence after decisions

The following are separate gates; passing one does not authorize the next.

| Gate | Work | Exit evidence | Explicitly not authorized |
|---|---|---|---|
| C14-A | Owner decision closure for the ten D1 decisions and D4 requirement scope | Signed/traceable decisions, examples, compatibility matrix | Production changes |
| C14-B | Implement and test a shared D4 lifecycle validator in an isolated development branch | Create/edit/import/category-change tests; per-batch atomicity and regression tests | Production migration/deploy |
| C14-C | Implement the approved identity contract in non-production code behind a disabled feature boundary | Contract tests, cross-field matrix, scan/search behavior tests, tenant isolation | Constraint/index activation |
| C14-D | Run authorized real-data shadow assessment | Collision ledger, impact counts, redacted provenance, manual-resolution queue | Automatic merge/delete/rewrite |
| C14-E | Prepare staged schema/index migration and rollback | Backup evidence, shadow index validation, lock/performance plan, rollback rehearsal | Production execution |
| C14-F | Separate owner authorization for production rollout | Explicit deployment/migration approval and operational plan | Any action beyond the approval's exact scope |

No automatic product merge, delete, alias rewrite, barcode rewrite, or irreversible normalization is permitted.

## 7. Required acceptance criteria for the next implementation task

### D1
- The same pair of values produces deterministic results independent of input ordering.
- Field-specific normalization and comparison-space normalization remain distinct and versioned.
- Every compared pair uses an explicit rule and both sides use the same comparison-space transform.
- Cross-company values and provenance cannot leak through any result field.
- Undefined field pairs cannot silently fall back to a guessed comparison.
- Existing `SKU-9` / `sku-9` behavior is covered by both application and database-level tests before any constraint change.

### D4
- One validator governs every supported lifecycle write path.
- Create, update, import, and category reassignment cannot disagree about required attributes.
- Import errors are deterministic and row-addressable; existing batch atomicity/idempotency behavior remains intact.
- Existing products and historical values are not silently rewritten.
- Any newly required definition has an explicit rollout/remediation policy.
- Existing sensitive-field RBAC, confirmation, audit, and company RLS boundaries remain enforced.

### General
- Persian-first RTL errors and operator guidance.
- Tests use isolated databases and the actual least-privilege runtime role for DB/RLS claims.
- No test result is inferred from a skipped suite or a missing `DATABASE_URL`.
- All evidence names the exact commit and environment.
- PRs remain unmerged until explicitly authorized by the owner.

## 8. Current disposition

- C11/C12/C13 candidate code remains experimental and inactive.
- The merge of PR #14 does not itself approve the ten open decisions.
- Windows-native C13 verification is deferred by owner instruction; record as UNVERIFIED, not PASS.
- Real-data assessment remains BLOCKED.
- D1 identity migration and D4 lifecycle behavior changes remain unapproved.
- This document is a planning baseline only; it creates no business policy and authorizes no production action.

## 9. Recommended next executable task

After the owner has reviewed the decision package, the next implementation task should be **C14-B: D4 Lifecycle Validator**, but only if the owner selects the required-attribute scope and supplies representative acceptance examples. It is a bounded, product-facing improvement and does not require activating C11–C13 normalization or uniqueness constraints.

If the D4 scope is not decided, continue with a code-level design and synthetic tests only; do not invent the missing business rule.
