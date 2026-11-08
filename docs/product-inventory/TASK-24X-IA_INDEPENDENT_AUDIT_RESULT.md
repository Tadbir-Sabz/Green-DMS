# TASK-24X-IA — Independent Security & Financial Integrity Audit

**Auditor:** Agent-2 (independent, read-only)
**Subject:** TASK-24X remediation (A-1, B-1, C-1, MEDIUM)
**Repository:** `Tadbir-Sabz/Green-DMS` · **PR:** #13 (OPEN)
**Audited SHA:** `531729c6f84ae703372f35ae1c063469f128de65`
**Code-equivalent SHA:** `cdd2ef79aeb9069d38da77cecff1f1469b7a2c2b`
**Date:** 2026-11-08

---

## 0. Verdict

> ## **PASS WITH FINDINGS — safe to merge as a security improvement, with 2 pre-merge fixes recommended and G-03 explicitly NOT closed.**

All four remediations are **substantively implemented and independently reproducible**. I
verified each with executable evidence, not by reading Agent-1's report. I also re-introduced
each vulnerability as a **negative control** to prove the tests still catch them.

Three findings warrant attention before this is called "done", none of which is a
regression introduced by TASK-24X:

| # | Finding | Severity | Blocks merge? |
| --- | --- | --- | --- |
| F-1 | Racing loser gets `400 order_save_failed` instead of documented `409` | MEDIUM | No — but ship a follow-up |
| F-2 | Failed approval-chain creation leaves an orphan `margin_exception` row + `500` | MEDIUM | No — but ship a follow-up |
| F-3 | 8 tables carry `approval_request_id` with **no approval gating at all** | **HIGH** | No (pre-existing), but G-03 must stay open |
| F-4 | `master-data/pricing.service.ts:188` still uses UTC date for margin checks | MEDIUM | No — narrow residual |
| F-5 | `approval_request` has no `company_id`; isolation is join-dependent | LOW | No — defence-in-depth |

**Merge recommendation: APPROVE with follow-ups.** TASK-24X materially improves security.
Merging it is safer than not merging it. It must **not** be described as closing G-03.

---

## 1. Baseline verification

| Check | Result |
| --- | --- |
| Repository | `https://github.com/Tadbir-Sabz/Green-DMS.git` ✓ |
| Branch | `arena/1246108f-green-dms` ✓ |
| Remote HEAD | `531729c6f84ae703372f35ae1c063469f128de65` ✓ |
| PR #13 | OPEN, head = `531729c`, base = `main` ✓ |
| Local working tree (audit clone) | clean before and after ✓ |

**The task named `cdd2ef7` as expected HEAD. Actual HEAD is `531729c`.** I established
content equivalence rather than stopping:

```
$ git diff --name-only cdd2ef7 531729c
docs/product-inventory/TASK-24X_REPORT.md      ← documentation only
$ git diff --name-only 43ec3b7 531729c
(none)
```

**Conclusion:** `43ec3b7` → `531729c` touches **only documentation**. All code, tests,
migrations and contracts are byte-identical to the CI-verified state. The audit is valid.

**Commit graph `669c92f..531729c`** — all ancestors verified:

```
531729c docs: fix markdown formatting in report          (docs only)
3433398 docs: pin final HEAD SHA                         (docs only)
3ca101a docs: record final CI run IDs                    (docs only)
cdd2ef7 docs: TASK-24X final report                      (docs only)
43ec3b7 docs: architecture, migration safety, audit req  (docs only)
b998261 merge: TASK-24V/24W (669c92f) + TASK-24X         ← merge, not rebase
336d750 docs: carry TASK-24V/24W evidence
c0041ef feat(rules-engine): G-03 decision guards
e9115e7 feat(sales): A-1 idempotency + business date
c3a9472 feat(pricing): fail-closed margin-approval flow
2557a11 feat(pricing): promotion engine schema
```

`git merge-base --is-ancestor` confirms `669c92f`, `d12dc2e`, `b998261`, `cdd2ef7`, `43ec3b7`
are **all ancestors** of HEAD. **No history was rewritten and no work was lost.** The
divergence was resolved by merge, not force-push — correct procedure.

---

## 2. A-1 — Order idempotency

### 2.1 Architecture (independently traced)

There is exactly **one** `insert into sales_order` in the codebase
(`order.repository.ts:431`). Both creation routes converge on it through the same lock:

```
apps/api/src/modules/sales/order.service.ts:124-127
  if (!dto.request_id) return this.createLocked(...);
  return this.creationLock.withRequestLock(dto.request_id, () => this.createLocked(...));

apps/api/src/modules/sales/sales-chain.service.ts:150  (conversion)
  return this.creationLock.withRequestLock(id, () => this.convertLocked(...));
```

The conversion path calls `OrderService.create()`, which re-enters the same lock — handled
by explicit reentrancy detection. I verified the mechanism:

| Property | Evidence |
| --- | --- |
| Lock runs on the **request's leased client**, not a second checkout | `order-creation-lock.ts:79-83` via `tenantStorage.getStore()?.client` |
| Reentrant per async context | `heldInContext` (AsyncLocalStorage) + `heldByClient` (WeakMap) |
| Unlock always in `finally` | `order-creation-lock.ts:120-140` |
| Commit precedes unlock | `order.repository.ts:463` commits, then releases; lock released after `work()` resolves |
| Key namespace | `request:<uuid>` hashed via `hashtextextended` |

### 2.2 DB backstop — verified against the catalog, not the source

```
CREATE UNIQUE INDEX uq_sales_order_request_active ON public.sales_order
  USING btree (request_id)
  WHERE ((request_id IS NOT NULL)
     AND (status <> ALL (ARRAY['cancelled'::text,'rejected'::text])))
```

I inserted rows **directly into the database**, bypassing the application entirely:

| Operation | Result |
| --- | --- |
| 1st active order for a request | allowed |
| **2nd active order, same request** | **blocked — `23505 uq_sales_order_request_active`** |
| `cancelled` sibling for same request | allowed ✓ (re-conversion stays possible) |
| `rejected` sibling for same request | allowed ✓ |

**The index is a genuine independent backstop** — it protects even non-application writers.

### 2.3 Negative controls (the tests actually catch regressions)

| Control (harness copy only) | Result |
| --- | --- |
| Remove the direct-create lock wrapper | **A1-3 fails** ✓ |
| Remove the unique index from the migration | **A1-5 fails** ✓ (A1-3 still passes — lock alone suffices) |
| Disable the C-1 chain guard + null-approval guard | **12 tests fail** ✓ |

This is the strongest evidence that the tests are not decorative.

> **Notable:** with the index removed, the *concurrency* test still passed. The lock is
> doing the real work on the happy path; the index only manifests when the lock is
> bypassed. Agent-1's claim that the index is "the DB backstop" is correct, but the
> concurrency tests do not prove it — I had to test the index directly.

### 2.4 Isolation and NULL semantics

- `findOrderIdByRequestId` scopes by `join customer_request → branch.company_id` ✓
- NULL `request_id` orders are excluded by the partial predicate → unaffected ✓
- A1-8 (cross-company) passes and asserts no order links to the foreign request ✓

### 2.5 FINDING F-1 — undocumented error on the index path (MEDIUM)

`order.service.ts:546-566` (`mapOrderError`) handles `uq_sales_order_client`,
`uq_sales_order_doc`, `23503`, `23514` — but has **no branch for
`uq_sales_order_request_active`**. It therefore falls through to:

```ts
return badRequest('order_save_failed', 'خطای غیرمنتظره در ذخیره سفارش.');
```

I verified the raw DB raises `23505 / uq_sales_order_request_active`, so **any write that
reaches the index without first passing the application guard returns `400
order_save_failed`**, not the documented `409 request_already_converted`.

- **Impact:** low for the normal path (the guard normally answers first, returning 409).
  It matters for retries after partial failure and for any future write path.
- **Not a security defect** — the order is still *blocked*. It is a **contract/documentation
  defect**: `openapi.yaml` documents `request_already_converted` as a 409 that will not occur.
- **Fix:** add the constraint branch mapping to `409 request_already_converted`.

---

## 3. B-1 — Pricing parity

### 3.1 The original discrepancy, reproduced

The audit claimed: quote with promotions disabled = **1090**, order = **981**.
Test `B1-2` replays that exact input (`apply_promotions: false` in the body) and asserts
both paths now return **981**. `B1-1` asserts quote = simulate = order = 981 with the
setting on; `B1-3` asserts all three = 1090 with the setting off. All pass.

### 3.2 The enforcement point is real

There is exactly **one** decision point (`pricing-engine.service.ts:605`):

```ts
apply_promotions: settings.apply_promotions_on_orders && input.apply_promotions !== false
```

The company setting is a hard **AND**-guard: a client can only ever turn promotions
*off*, never *on*. `quoteWithPolicy` passes a literal `apply_promotions: true` and the
order path (`quoteForOrder`) supplies **no** `apply_promotions` at all — I confirmed with
`grep` that `apps/api/src/modules/sales/*.ts` never sets it.

### 3.3 Bypass paths checked

| Vector | Result |
| --- | --- |
| `apply_promotions` in the order body | field no longer exists in `CreateOrderDto`; stripped by whitelist |
| `apply_promotions` in the quote body | ignored; company setting wins (B1-2) |
| `coupon_codes` on orders | passed through, but cannot re-enable promotions when the setting is off |
| Alternate pricing endpoint | `quoteForOrder` is the only caller used by orders |
| Simulation writing business documents | **verified**: simulate writes only `price_simulation_log`; `commitUsage` is never called on that path |

`whitelist: true` is set in `validation.ts:61`; `forbidNonWhitelisted` is **not** — so unknown
fields are silently dropped rather than 400. That is deliberate (backwards-compatible) and
**does not permit bypass**, since the decision ignores request input entirely.

### 3.4 Verdict B-1: **PASS**

---

## 4. C-1 — Approval fail-closed

### 4.1 Independent verification

Only **one** `insert into margin_exception` exists (`pricing-engine.repository.ts:650`), so
there is no alternate writer that skips the guard.

| Scenario | Observed |
| --- | --- |
| No active chain | `409 approval_chain_required`, **0 rows** (C1-1) |
| Chain with zero steps | `409 approval_chain_empty`, **0 rows** (C1-2) |
| Valid chain | exception created with non-null `approval_request_id` (C1-3) |
| Historical row with null approval id | cannot be approved → `409 approval_request_missing` (C1-4) |
| Self-approval | blocked twice: route guard, then `second_person_required` (C1-5) |
| Cross-company | not visible (C1-6) |

The SQL itself double-guards: `decideMarginException` requires `status='pending'`
**and** `requested_by <> $4` in the `WHERE` clause — so even a race cannot self-approve.

### 4.2 Negative control

Disabling both the chain guard and the null-approval guard fails **12 tests** (C1-1, C1-4,
the new fail-closed test, and 9 downstream pricing tests). **The security control is
genuinely load-bearing.**

### 4.3 FINDING F-2 — orphan row and wrong status when chain creation fails (MEDIUM)

The exception row is inserted and **committed** *before* the approval request is created.
The compensation is a separate, best-effort update:

```ts
const id = await this.repo.insertMarginException({...});   // own transaction, committed
try { const requested = await this.rules.createApprovalRequest(...); }
catch (err) { await this.repo.abandonMarginException(...); throw err; }
```

I forced a failure with a `BEFORE INSERT` trigger on `approval_request`:

```
AUDIT-PROBE http: 500 internal_error
AUDIT-PROBE rows before/after: 0 → 1   orphan(approval_request_id null): 1
```

**Two defects:**
1. The client receives **`500 internal_error`**, not the documented `409
   approval_request_failed`. The `catch` rethrows the raw DB error instead of mapping it.
2. A `margin_exception` row **persists** with `approval_request_id = null`.

**Severity assessment — reduced but not dismissed.** The row is set to `status='cancelled'`
(not `pending`), and the price effect only reads `status='approved'`
(`pricing-engine.repository.ts:352`). So it **cannot** authorize a price. It is an
**auditability and error-contract defect**, not an authorization bypass. C-1's core claim
("no sensitive exception proceeds without valid authorization") **holds**.

**Fix:** wrap insert + approval-request creation in one transaction, or map the failure to
`409 approval_request_failed`.

### 4.4 Verdict C-1: **PASS**, with F-2 as a follow-up

---

## 5. Tehran business date

I tested the boundaries directly (deterministic instants, not machine-local):

| Input (UTC) | `businessDateOf` | Correct? |
| --- | --- | --- |
| `2026-06-15T20:29:00Z` | `2026-06-15` | ✓ (23:59 Tehran) |
| `2026-06-15T20:29:59Z` | `2026-06-15` | ✓ |
| **`2026-06-15T20:30:00Z`** | **`2026-06-16`** | ✓ exact midnight |
| `2026-06-15T20:31:00Z` | `2026-06-16` | ✓ |

Also verified: `toBusinessDate('2026-06-15T21:30:00Z') === '2026-06-16'` (the original bug
would have produced `2026-06-15`); strict `isBusinessDate`; month/year/leap shifting;
`businessDaysBehind`; and **TZ-independence** (setting `TZ=Pacific/Kiritimati` and
`TZ=Pacific/Niue` produced identical results).

Audit timestamps in `rules-engine.service.ts` use full ISO instants (`timestamptz`), which
is correct — an instant needs no business date.

### 5.1 FINDING F-4 — one residual UTC date on a financial path (MEDIUM)

```
apps/api/src/modules/master-data/pricing.service.ts:188
  pricingDate: (item.valid_from ?? new Date().toISOString().slice(0, 10)).slice(0, 10),
```

This is the **price-list-item write path** → `assertMarginForPriceWrite`. When `valid_from`
is omitted, the margin policy is evaluated for the **UTC** date. In the 20:30–24:00 UTC
window this selects the wrong day, so a policy that changes at Tehran midnight could be
applied to the wrong day's check. Every other path uses `this.today()` →
`businessToday()`. Narrow, but it is exactly the class of bug MEDIUM was meant to eliminate.
Also residual (lower impact, outside the pricing path): `bi/forecast.ts:35`,
`tracking.service.ts:195` (route-plan date).

**Fix:** replace with `businessToday()` in the three sites.

### 5.2 Verdict MEDIUM: **PASS WITH FINDINGS (F-4)**

---

## 6. Migration 0052 safety

Independently reproduced on a database migrated to `0051` with **fabricated duplicates**
(two `approved` orders sharing one `request_id`):

| Step | Observed |
| --- | --- |
| Apply 0052 on dirty data | **aborts** with `P0001`, names the offending UUID |
| Orders after the failed migration | **2 — unchanged** |
| Indexes after the failed migration | **`[]` — no partial structure left** |
| After cancelling one order | migration **succeeds** |
| 2nd active order after migration | **blocked by `23505`** |
| `down` | drops both indexes; **no data change** |

The abort message is actionable and contains the full list of affected request UUIDs.
**No financial record is deleted, merged or mutated.** The `begin/raise/commit` structure
makes the failure atomic.

**Verdict: PASS.** Residual note: `down` removes the constraint without repairing duplicate
data (documented, acceptable — it is a structural rollback only).

---

## 7. CI evidence (verified per-commit, not taken on trust)

| Commit | Workflow | Run | Result |
| --- | --- | --- | --- |
| `531729c` (HEAD) | CI | `42492964483` | ✅ success |
| `531729c` | migrations up/down/up | `42492964482` | ✅ success |
| `531729c` | release-image | `42492964488` | ✅ success |
| `531729c` | **e2e** | `42492964480` | ❌ **failure** |
| `cdd2ef7` | CI | `42492535499` | ✅ success |
| `cdd2ef7` | **e2e** | `42492535505` | ❌ failure |

Job-level detail on `531729c` (CI `42492964483`): Static checks ✅, Unit ✅,
**Integration (Postgres)** ✅, Integration (MinIO) ✅, credential hygiene ✅.

### E2E failure is genuinely pre-existing — confirmed by comparable evidence

| SHA | e2e result | Failing step |
| --- | --- | --- |
| `669c92f` (pre-TASK-24X) | **failure** | `assert MinIO resolved (BLOCKED gate)` |
| `cdd2ef7` | failure | `assert MinIO resolved (BLOCKED gate)` |
| `531729c` | failure | `assert MinIO resolved (BLOCKED gate)` |

The **same step in the same workflow** fails identically before and after the remediation.
It fails at image resolution, before the stack starts — it never reaches application code.
This is an environment/infrastructure gate, **not** a regression from TASK-24X.

**Not marked as passed.** E2E coverage does not exist for this work.

### Local execution (my own, independent)

Run in an isolated clone with a real PostgreSQL 18 server:

| Suite | Result |
| --- | --- |
| `pricing-engine.api.test.ts` | **48/48** |
| `task24x-remediation.api.test.ts` | **25/25** |
| `task24w-conversion-and-parity.api.test.ts` | **21/21** |
| `orders.api.test.ts` | **15/15** |
| `rules-engine-behavior.test.ts` | **27/27** |
| **Total** | **136/136** |

**Stated limitation:** my sandbox has no PostGIS package. I substituted a `geography` text
domain and `st_x/st_y` functions **in the throwaway harness copy only**, never in the repo.
No audited assertion depends on PostGIS. **CI with real PostGIS is the authoritative
result**, and it passed.

---

## 8. G-03 — residual gaps (must stay open)

I explicitly did **not** accept Agent-1's characterization. Independently classified:

| Gap | Status | Evidence |
| --- | --- | --- |
| **Notifications** | ❌ absent | `grep` for outbox/smtp/sms in rules-engine/pricing: only rule *effects* named `notify`/`send_sms`, no delivery. Approvers are never told a request awaits them. |
| **Expiration** | ❌ absent | no `expires_at`/TTL on `approval_request`. A pending request can be approved months later. `margin_exception.valid_until` limits *use*, not *decision*. |
| **Delegation** | ❌ absent | no delegation/substitution model; an approver on leave blocks the chain indefinitely. |
| **Company association** | ⚠️ **weak (F-5)** | `approval_request` has **no `company_id` column**. Isolation depends entirely on `join approval_chain ac ... where ac.company_id = $2`. `getApprovalRequest` does this correctly, but `listApprovalDecisions(requestId)` has **no company predicate** and is safe only because callers look up the request first. Fragile, not exploitable today. |
| **Sensitive operation integration** | ❌ **largely absent (F-3)** | See below. |
| **Approval history / auditability** | ⚠️ partial | `approval_decision` rows exist with `decided_at`; no append-only guarantee, no export, no "who was asked" record. |

### FINDING F-3 — `approval_request_id` is unimplemented on 8 of 9 tables (HIGH)

Column exists on: `sales_order`, `customer_price`, `margin_exception`, `purchase_order`,
`purchase_request`, `return_request`, `tour`, `price_change_log`.

I searched for **every write** to that column:

```
apps/api/src/modules/sales/order.repository.ts:60   ← SELECT only
apps/api/src/modules/pricing/...                    ← margin_exception only
```

**No code ever populates `approval_request_id` for `sales_order`, `customer_price`,
`purchase_order`, `purchase_request`, `return_request` or `tour`.** Therefore those
operations have **no approval gating whatsoever** — the schema *suggests* an approval
architecture that does not exist. This is pre-existing, but it is exactly the
"G-03 remains open" claim, now with a precise scope.

**Only `margin_exception` is actually fail-closed.** One sensitive operation of nine.

---

## 9. Assessment of the four remediations

| Finding | Verdict | Basis |
| --- | --- | --- |
| **A-1** idempotency | **PASS** (F-1) | lock on leased client, reentrancy, partial unique index verified by direct DB write; negative controls fail as expected |
| **B-1** pricing parity | **PASS** | single AND-guard decision point; 1090/981 reproduced; no client bypass; simulation writes only its log |
| **C-1** fail-closed | **PASS** (F-2) | one insert path; guards load-bearing (12 tests fail when removed); orphan cannot authorize |
| **MEDIUM** business date | **PASS WITH FINDINGS** (F-4) | boundaries exact; TZ-independent; one residual UTC site on a financial path |

### Assessment of Agent-1's test changes

| Change | My assessment |
| --- | --- |
| `pricing-engine.api.test.ts` now creates a real approval chain; adds fail-closed test; adds `pe_chain_approver` | **Legitimate and strengthening.** The old test encoded the vulnerability (created an exception with no chain). Attempting to assert the old 201 would have re-opened C-1. |
| `migrations-security.test.ts` `51 → 52` | **Legitimate** — migration 0052 exists. |

I re-derived the negative control myself: re-introducing either vulnerability fails 10–12
tests. **No weakening found.**

---

## 10. Reproducible evidence index

| Claim | Command / artifact |
| --- | --- |
| Content equivalence of doc commits | `git diff --name-only cdd2ef7 531729c` |
| Single order insert path | `grep -rn "insert into sales_order" apps/api/src` |
| Index definition | `select indexdef from pg_indexes where indexname='uq_sales_order_request_active'` |
| Index blocks non-app writer | direct `insert into sales_order` with duplicate `request_id` → `23505` |
| Lock removal ⇒ A1-3 fails | disable `withRequestLock` in `order.service.ts:124` |
| C-1 load-bearing | disable both guards in `pricing-engine.service.ts` → 12 failures |
| F-1 raw error | `23505 / uq_sales_order_request_active`, no mapping in `mapOrderError` |
| F-2 orphan row | `BEFORE INSERT` trigger on `approval_request` → `500`, 1 orphan row, `cancelled` |
| F-3 ungated tables | `grep` for `approval_request_id` writes: only `margin_exception` |
| F-4 residual | `master-data/pricing.service.ts:188` |
| Date boundaries | `businessDateOf` at 20:29 / 20:30 / 20:31 UTC |
| Migration abort | apply 0052 with duplicates → `P0001`, 0 partial indexes, rows intact |
| E2E pre-existing | runs `42469193099` (669c92f) and `42492964480` (531729c), same failing step |

---

## 11. Merge recommendation

**APPROVE to merge** — with the following conditions on the record:

1. **Do not claim G-03 is resolved.** Only `margin_exception` is fail-closed; 8 further
   tables are ungated (F-3). Keep G-03 open as a tracked finding.
2. **File follow-ups** for F-1 (map `uq_sales_order_request_active` → `409`), F-2
   (transactional exception creation / map to `409 approval_request_failed`), and F-4
   (`businessToday()` in `master-data/pricing.service.ts:188`).
3. **Do not use the E2E job as a merge gate** until the MinIO resolution gate is fixed —
   it has failed identically since before this work.
4. A merge must not be described as "verified by Agent-2"; this report verifies the
   *implementation*, and the follow-ups above remain open work.

**Is this genuinely safe to merge?** Yes. Every change reduces risk relative to `669c92f`:
order duplication is now prevented by two independent layers, pricing can no longer be
steered by request body, and margin exceptions can no longer bypass approval. The findings
are about completeness and error semantics, not about the fixes being wrong or exploitable.

---

## 12. Auditor's declaration

- **Read-only.** No commit, push, merge, reset, clean, rebase or deployment was made.
- The real repository was **not modified**: it remains at `d12dc2e` locally, and
  `origin/arena/1246108f-green-dms` remains `531729c6f84ae703372f35ae1c063469f128de65`.
- All experiments ran in a **separate clone** (`/tmp/audit24x`) with a **throwaway database**.
  Every source file was restored and verified byte-identical to HEAD afterwards.
- I did not rely on Agent-1's report for any verdict; each claim above was re-derived from
  code, catalog state, or executed behaviour.
- Where I could not reproduce the production environment (PostGIS), I said so and deferred
  to CI rather than claiming a local pass.
