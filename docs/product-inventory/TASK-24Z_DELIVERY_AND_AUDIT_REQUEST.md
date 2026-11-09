> **TASK-24Z-R1 update:** see the R1 section below. Earlier checkpoint counts
> and blockers are historical; do not use them as final R1 evidence.

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

# TASK-24Z-R1 — implementation and validation continuation

## Exact initial state

Initial local HEAD, remote branch and PR head all equaled
`60e3dd54ba7eec83a5426849a47e9ed82d230752`. Branch was
`arena/1246108f-green-dms`, worktree clean, PR #13 OPEN. Verified with
`git status --short`, `git log -1`, `git branch --show-current`,
`git ls-remote origin refs/heads/arena/1246108f-green-dms`, and
`gh pr view 13 --json state,headRefName,headRefOid` before edits.
No reset, force push, branch switch, merge, deployment or shared service changes.

Implementation commits: `2d9a51eb0f79ebc42dc2df7dd6ff270bf708b4cb`,
`e41f2b088a9c74c215920e42e8549773a3882018` (final executable code/test SHA).
Later evidence commits do not change executable code.

## Implemented fixes (not audit-only changes)

- **Pricing recovery:** fixed the remaining legacy decision consumer in the
  pricing regression suite to use the canonical HTTP endpoint and DTO; assigned
  its chain to the actual authorized approver role. Did not restore an allow-all
  step or weaken pricing/margin assertions. This fixes nine cascading failures,
  not nine unrelated business-rule changes. Pricing suite: 48/48 locally.
- **Resubmission:** additive migration 0055 adds `superseded_at`, removes global
  entity uniqueness, and enforces one unsuperseded, unconsumed binding per
  company/operation/type/entity. Historical bindings and decisions remain.
  Rollback refuses to discard populated supersession data.
- **Duplicate/concurrent submissions:** per-entity transaction advisory lock,
  locked entity/lines, locked prior requests/bindings, and duplicate response
  `409 approval_already_submitted`. No duplicate successful active submissions.
- **Changed document:** re-read under lock before storing fingerprint. A changed
  snapshot creates a new workflow and supersedes the old binding. Old decisions
  cannot authorize the new snapshot. Same valid pending/approved snapshot is
  not silently resubmitted. Consumed bindings are never reused.
- **Decision atomicity:** decision insertion and conditional request transition
  now share one transaction with a locked request. Request-transition failure
  rolls back the decision. Expiry is checked both before and under the lock.
- **Execution atomicity:** consumption and document transition remain one
  transaction. Execution shares the submission advisory key and locks. Expired
  approvals cannot execute.
- **Migration recovery:** 0053 creates the creator archive only when creator
  data actually exists. This preserves populated rollback safety while allowing
  empty full down/up to leave a genuinely empty schema. Added purchase creator
  round-trip assertions alongside sales creator assertions.
- **Persian order UX:** pending orders can submit again after rejection, expiry
  or a material change. Duplicate valid requests receive server validation;
  the UI button does not grant authorization or reopen a closed request.

## Explicit lifecycle semantics and evidence

| State/event | Rule | Public API proof |
|---|---|---|
| First submission | New request, persisted composed chain and binding | OPS-1/2/3, NC-A1/A2 |
| Two matching policies | Both chains must be completed before execution | NC-C2 |
| Same pending/approved unchanged snapshot | 409 duplicate; no new active binding | R2 |
| Rejected | New request; rejected history stays closed/immutable | R1 |
| Returned/cancelled | Never reopened; new request and binding | R4 |
| Expired | Cannot decide or execute; resubmit creates a new request | R4, runtime expiry filter |
| Material document/item change | Old binding superseded, fresh decisions required | R3, NC-H2 |
| Policy change after submission | Persisted snapshot governs existing request; next submission resolves current policies | Implementation: SNAP chain; adversarial edit test still desirable |
| Two final decisions | One decision/transition succeeds, loser 409 | R5 |
| Two executions / successful replay | Exactly one transition and one consume; loser/replay 409 | NC-C2, R6 |
| Request transition DB error | Decision and request changes both roll back | R5 injected PostgreSQL trigger |
| Business transition DB error | Consume and document change both roll back; retry succeeds | R6 injected PostgreSQL trigger |

All workflow requests/bindings/decisions in these acceptance controls are created
via HTTP. SQL is used only for inspection or documented clock/document/DB-fault
injection, not to construct an approved binding.

## Original failure-by-failure classification

See `evidence/task24z-r1/FAILURE_CLASSIFICATION.md`: all **37 individual tests**
are listed by full name with classification, root cause, corrective change,
reproduction and local disposition. Exact original stacks remain in
`evidence/task24z/full-api-final.txt`; new stacks in
`evidence/task24z-r1/final-full-api.txt`. Three separate PostGIS suite-setup
failures are identified, not hidden in passing counts.

Local final full attempt: **1229 passed / 28 failed / 66 skipped**, plus one
unhandled teardown error (`57P01 terminating connection due to administrator
command`, product-master-attributes). Exit **1**, not PASS. No test was removed
or skipped to improve counts. This is an extension-incomplete/harness-limited
run and cannot establish real PostGIS or credential-authentication correctness.

## Validation commands / exits

- `npx tsc -p apps/api/tsconfig.json --noEmit`: exit 0.
- `npx tsc -p apps/web/tsconfig.json --noEmit`: exit 0.
- `npm run openapi:check`: exit 0; 184 paths, 264 operations, 133 schemas.
- `node scripts/contract-drift.mjs`: exit 0; 264/264, zero route/enum/required drift.
- `npm run test -w apps/web`: exit 0; 52/52, 7 files.
- Disposable-mirror API command prefix:
  `DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres PSQL=/tmp/pgshim/psql NODE_ENV=test npx vitest run --root apps/api`.
  - Eight approval/sales/returns/purchasing/pricing regression files: exit 0,
    **202/202** (`regressions.txt`).
  - Final lifecycle + migration files: exit 0, **45/45** (`final-focused.txt`).
  - Full suite without file filters: exit 1, totals above (`final-full-api.txt`).

Environment is the previously documented isolated embedded PostgreSQL 18.6
sandbox with **sandbox-only modified migrations**, C locale and Node psql shim.
No local docker, real psql or pg_config binary. Available outbound hosts exclude
OS package and container registries, so do not pretend an apt/container install
or PostgreSQL-extension-complete local run happened. Real CI uses isolated
`postgis/postgis:16-3.4`, real psql, Redis and a separate storage job.

## Remaining review targets

- Full Persian RTL browser workflow, accessible complete-chain/provenance and
  delegation-history UX still requires browser evidence. Purchase-order page is
  absent; do not claim that capability is complete.
- Distinct-person approval counts, assigned-role-with-zero-eligible-members at
  submission, deny policy model, and full domain/risk ownership adversarial
  matrix remain original TASK-24Z review targets; green focused tests do not
  establish those controls.
- This continuation did not recover the missing original standalone Agent-2
  audit artifact or fabricate its contents. Original finding summary above is
  retained as mandatory independent regression targets.

## Final executable-SHA CI results

Exact code/test head: `e41f2b088a9c74c215920e42e8549773a3882018`.
Run https://github.com/Tadbir-Sabz/Green-DMS/actions/runs/42576104692:
all six CI jobs **PASS** (static, unit, real PostgreSQL integration, credential
hygiene, separate S3 storage round-trip). No local spatial substitutions were
used in this CI run. Real extension-enabled migration cycle **PASS**:
https://github.com/Tadbir-Sabz/Green-DMS/actions/runs/42576104597.
Release image smoke **PASS**:
https://github.com/Tadbir-Sabz/Green-DMS/actions/runs/42576104664.

Storage job used a recorded, pinned S3-compatible Adobe s3mock image, not a real
MinIO server; this distinction is material. Browser compose **UNVERIFIED /
BLOCKED BY EXTERNAL INFRASTRUCTURE**:
https://github.com/Tadbir-Sabz/Green-DMS/actions/runs/42576104656.
Annotations prove quay.io MinIO 401 and Docker Hub pull access denied.
No browser tests executed. Do not call that job a product E2E PASS.

The original 37 failures are now individually reconciled with passing corrected
pricing/migration tests or successful real CI infrastructure validation. Local
full-run failures and the extra teardown exception remain faithfully recorded.
See `ci-real-postgres.json`, `ci-migrations.json`, `ci-storage.json`, and
`ci-e2e-blocker.json` in the R1 evidence directory.

**R1 overall result: NOT READY.** Core lifecycle, pricing recovery, resubmission
and transactional fault controls are implemented and tested; this is not an
audit-only delivery. However, complete browser/RTL evidence is absent and the
remaining original policy/eligibility review targets above prevent an honest
claim that every TASK-24Z requirement is complete. Agent-2 should independently
verify the repaired paths and retained original TASK-24Y targets. No acceptance,
merge readiness, merge, or deployment is claimed. PR #13 remains open.

Any subsequent commit in this continuation contains documentation/evidence only.
Its exact final SHA is the PR branch head (`git rev-parse HEAD`); that SHA cannot
be embedded in its own contents. Check that head with `gh pr checks 13` rather
than treating earlier green CI as evidence for uninspected code changes.
