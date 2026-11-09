# TASK-24Z — implementation checkpoint / independent audit request

**Self-assessment: FAIL — acceptance gates remain open. Not release approval.**

Baseline: `5650daf1f28997775c7b97be6bf74b22bf7e0731`.
Implementation SHA: the commit containing this report (resolve with
`git log -1 --format=%H -- apps/api/src/modules/rules-engine/approval-policy.ts`).
Branch: `arena/1246108f-green-dms`. PR #13 remains open. No merge or deployment.

## Changes and mandatory TASK-24Y regression targets

| Finding | Implementation / evidence | Status |
|---|---|---|
| A-1: disconnected start/binding | `submitForApproval`, three domain `request-approval` routes; OPS-1/2/3 and NC-A1/A2 HTTP tests | Focused tests pass in sandbox; independent verification required |
| D-1: consume before transition | `common/transaction.ts`, `consumeApprovedBinding`, domain repositories accept the same runner; NC-D1 rollback/retry and NC-C2 concurrent execution | Partially verified; explicit injected DB-transition failure still needed |
| C-1: single policy winner | `composeApprovalPolicy`, all-stage persisted snapshot chains; NC-C2 proves the second policy is required at runtime | Partial: distinct-person counts, deny model, richer adversarial domain tests remain open |
| B-1: unassigned step | Submission rejects unassigned steps; decision authorization fails closed | Assigned role with zero eligible members still needs submission validation/test |
| B-2: delegation | Company/operation/domain/time validation at decision time; NC-D2/D3/D4 | Focused tests pass; independent scope matrix required |
| F-1: destructive creator rollback | 0053 down archives creators, up restores; refuses populated approval structures before destructive DDL | Sales creator and refusal tests pass; populated purchase creator and audit-meta round-trip still need explicit coverage |
| G-1: deterministic date | Shared Tehran date helper and boundary tests; no relaxation of backdate validation | Partial: all legacy pricing tests not yet made deterministic |
| G-2/T-1: API contract | Canonical decision endpoint; OpenAPI regenerated; route drift 264/264 | Static check passes; pricing exception consumer regression is open |
| H-1/H-2: fingerprint and capability coverage | `entity-fingerprint.ts`, server-derived state, runtime comparison, parent+line locks, NC-H1/H2; capability matrix | Partial: safe resubmission and complete approved-state definition still need work |

## Reproducible commands and observed results

Run in a disposable environment only. Tests create/drop fixed `greendms_*` databases.
Do not supply a production/shared database URL.

```sh
npm ci
npx tsc -p apps/api/tsconfig.json --noEmit
npx tsc -p apps/web/tsconfig.json --noEmit
node scripts/contract-drift.mjs
npm run test -w apps/web
# With disposable PostgreSQL including PostGIS/btree_gist, Redis and MinIO:
NODE_ENV=test npx vitest run --root apps/api \
  test/task24z-approval-lifecycle.api.test.ts \
  test/task24y-approval-engine.api.test.ts \
  test/rules-engine-behavior.test.ts \
  test/task24z-migration-rollback.api.test.ts
NODE_ENV=test npx vitest run --root apps/api
```

Observed locally:
- API and web typechecks: exit 0.
- Contract drift: 264 documented / 264 implemented, no missing/extra operations.
- Web: 52/52 across 7 files.
- Final full API attempt: **1214 passed, 37 failed, 66 skipped**, 12 failed files / 66.
- Within that full run: lifecycle 35/35; legacy approval engine 27/27;
  rules behavior 27/27; rollback 4/4 (**93 focused tests**).
- Earlier focused run before adding rollback-refusal test: 92/92; retained as
  historical evidence, not mislabeled as final.

### Infrastructure qualification (important)

Local DB: embedded PostgreSQL 18.6, port 55432, disposable test databases only.
It lacks PostGIS and btree_gist. Tests ran in `/tmp/audit24y`, a source mirror
with **sandbox-only altered migrations**: geometry/geography text domains and
null spatial functions, GiST/exclusion substitutes. Repository migrations were
not replaced by these substitutes. `/tmp/pgshim/psql` is a Node shim rather than
libpq psql. Redis and MinIO were unavailable.

These substitutions are **not production-equivalent evidence**. Spatial,
exclusion-constraint, credential-hygiene, queue and storage failures are not
passes. Clean migration/security acceptance requires the real CI stack.

Evidence summaries and failure sections are committed in `evidence/task24z/`.
The full API failure log contains real unresolved pricing failures, including
pricing exception decisions calling the removed legacy route, and order/pricing
409 responses. Do not classify these as infrastructure-only without diagnosis.

## Remaining blockers and audit instructions

Agent-2: independently verify all TASK-24Y findings above as mandatory regression
targets; do not accept this checkpoint based on green focused tests alone.

1. Diagnose/fix pricing exception integration and remaining regression failures.
2. Snapshot chains now persist all composed stages. Verify eligibility per stage,
   provenance/history display, snapshot immutability, stage deduplication and
   distinct-person semantics. A repeated role must not silently lose required steps.
3. Add explicit DB-transition fault injection and lock/race tests beyond the
   existing business failure/retry/concurrent HTTP controls.
4. Provide safe resubmission after rejected/changed approval without deleting
   historical bindings or decisions. Current binding uniqueness limits this.
5. Verify requester identity against actual entity creator, including delegated
   and legacy-null-creator cases; fully validate domain/risk source ownership.
6. Complete Persian RTL approval UX audit. Existing sales/return submit buttons
   are not evidence of a complete workflow UI; purchase-order web page is absent.
7. Run real extension-enabled migration up/down/up with populated sales AND
   purchase creators, preserved decisions/meta, indexes, constraints and FKs.
8. Finish all-date determinism and the final CI gate.

Original Agent-2 audit was referenced in prior session context as
`/home/user/AUDIT-TASK-24Y-AGENT2-REPORT.md`, but is **not present in this checkout**.
It was not deleted or rewritten in this continuation; recovery of that original
artifact is outstanding. This report is not a substitute for it.

## CI

Before this checkpoint, remote branch HEAD equaled the baseline. `gh pr checks 13`
showed baseline Playwright E2E failing, other listed jobs passing. Those results
**do not validate this implementation**. Final checkpoint CI must be read from
its exact SHA after push; status currently UNVERIFIED.

Checkpoint implementation SHA: `a74b8e199564c68b2061e1ab760fa160e3ba63f4`.
Migration CI for this SHA was queued at observation:
https://github.com/Tadbir-Sabz/Green-DMS/actions/runs/42574029038
Evidence-only follow-up commits do not change the tested implementation.
