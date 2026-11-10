# TASK-PM-01D-M4-I — Evidence-Based M4 Acceptance Closure (implementation / audit report)

**Baseline:** `8c40105f8c5b38660a605078207ac5bd90215359` (H final).
**Implementation stage:** `ce34fdcd738240025fb4f8c801da1a948eb98108` (Stage A).
**Final I commit and exact final-SHA CI:** PR #14 body and final chat report (not hardcoded in this document).
**Branch / PR:** `arena/be5eaff3-green-dms`, PR #14 OPEN / DRAFT / base `main`.
**Scope:** M4 technical acceptance readiness and evidence consistency only. This report does **not** accept Product Master, approve PM-B1..PM-B8, authorize release/deployment, or change production.

> **Current-state note (TASK-PM-01D-M4-K, 2026-11-10):** This document preserves the I-stage historical self-assessment. The independent Agent-2 review `TASK-PM-01D-M4-J` and the dated K reconciliation in `M4_ACCEPTANCE_MATRIX.md` §8 are the current authoritative state. The current M4 technical verdict is `PASS WITH FINDINGS`; Product Master remains `BLOCKED`; production deployment remains `NOT AUTHORIZED`. Historical `UNVERIFIED` language below is not rewritten.

## 1) Assignment and method

The task was to re-establish an authoritative, evidence-based M4 acceptance posture without repeating earlier implementation work, without changing protected migrations/CI, and without overwriting earlier review verdicts. I therefore:

1. verified the required H final SHA, PR #14 state, exact-SHA H CI and clean baseline;
2. identified the apparent R/F-R/G-R evidence contradiction and separated historical aggregate verdicts from later narrow independent findings by SHA and scope;
3. developed narrowly scoped evidence for the two remaining F-R findings (F-R-03/04), plus H spelling corrections;
4. ran static, migration-cycle, focused and M4 regression validation locally, then exact-SHA CI for the implementation stage;
5. wrote the authoritative A–D matrix, durable verification ledger and this implementation report;
6. explicitly retained all unresolved owner/production/independent-review gates.

No CI trigger was edited or rerun to manufacture success. No `.github` workflow, protected migration, `SECURITY DEFINER`, runtime grant, scheduler or production configuration was changed.

## 2) Baseline and historical chain

| Milestone | SHA | Result / evidence status |
|---|---|---|
| M4 implementation | `975c12f4533996f832c7639ee534c327a1c7df4d`, `6bffef38fc4ce007798e68d4c7959729c76100e2` | Initial implementation and F baseline; R historical `FAIL` (`0/1/3/3`) at `6bffef3...`. |
| F | `74e71172055d6cad482305db1834300c62fb53f5` | Seven R findings remediated; F-R historical `FAIL` (`0/0/2/2`) at this SHA. |
| G | `2e6d2711cb2a8b1f60b8c39b87eeb3f3a13a295c` | F-R-01/02 remediated; G-R narrow independent `VERIFIED SAFE` for those two findings only. |
| G-R | `2e6d2711cb2a8b1f60b8c39b87eeb3f3a13a295c` | Overall `PASS WITH FINDINGS`, four LOW caveats; M4-G acceptance `UNVERIFIED`; Product Master `BLOCKED`. |
| H | `8c40105f8c5b38660a605078207ac5bd90215359` | Documentation/operational reconciliation; final `PASS WITH FINDINGS`, M4 / Product Master `UNVERIFIED / BLOCKED`. |
| I Stage A | `ce34fdcd738240025fb4f8c801da1a948eb98108` | F-R-03/04 direct evidence + H spelling fixes; exact-SHA CI PASS. |
| I final | not hardcoded | Matrix, ledger, evidence index and final report; its own exact-SHA CI recorded externally. |

Historical `R = FAIL` and `F-R = FAIL` are **not** deleted or relabelled. G-R was a later narrow review of F-R-01/F-R-02 at `2e6d271...`, not a full current-M4 acceptance decision. H correctly documenting a finding is not resolution by documentation. F-R-03/04 are now resolved by code/tests, not by prose.

## 3) Changes in I Stage A (6 files, +593/−2)

### F-R-03 — expired preview cleanup

`scripts/cleanup-expired-bulk-previews.mjs` is an explicit, fail-closed operator tool. It requires an explicit owner `DATABASE_URL`, exactly one tenant UUID, an ISO cutoff, dry-run by default and `--apply` for deletion. It preflights object ownership/full visibility, forced RLS, grants and GUC, filters only evidence-free terminal-less `preview_created` rows by the explicit `expires_at` cutoff (`expires_at <= BULK_PREVIEW_CLEANUP_BEFORE`), performs transactional delete and postflight checks, and emits JSON. It does **not** grant `DELETE` to `dms_app`, add a queue/scheduler/`SECURITY DEFINER`, edit protected SQL, or infer a production retention policy.

> **Factual correction (TASK-PM-01D-M4-K, 2026-11-10):** the earlier prose incorrectly named `created_at` as the cleanup filter. The implementation at `scripts/cleanup-expired-bulk-previews.mjs:111-132` selects `preview_created` rows with `expires_at <= $2::timestamptz`; `created_at` is not the cleanup filter. This correction changes documentation only and does not rewrite any historical I verdict.

`apps/api/test/product-bulk-preview-cleanup.test.ts` uses a disposable PostgreSQL database for five tests: dry-run candidate selection; `--apply` deletes exactly one eligible row and retains evidence, future, committed, unknown, accepted/rejected and other-tenant rows; forced RLS and grants are unchanged; repeated `--apply` is idempotent; a real non-owner TCP role and invalid tenant/cutoff fail closed. `apps/api/test/db-backed-tests.txt` declares the new non-`*.api.test.ts` DB suite.

The operator guide gains `### ۴-ب` with the exact owner command, explicit one-tenant/cutoff policy, no scheduler claim, and `UNVERIFIED / نیازمند تصمیم اپراتور` for retention/scheduling. This is an implementation closure for F-R-03; production retention and scheduling remain a separate unverified operational gate.

### F-R-04 — direct viewer POST reconcile 403

`product-bulk-maintenance.api.test.ts` now directly POSTs the reconcile endpoint as viewer (403) and unauthenticated (401), then asserts the operation stays `preview_created`, evidence/audit counts remain zero, versions are unchanged and `reconciled:false`. Previous inferred-only status is replaced by an explicit test.

### H spelling corrections

`PRODUCTION_DEPLOYMENT.md`: `یکیبودن`→`یکی بودن`, `جاینگهدار`→`جای\u200cنگه\u200cدار`, `میکند`→`می\u200cکند`. No semantic change, no doubled-quote SQL reintroduction. Python codepoint CJK scan on changed files: 0 hits; `git diff --check`: EXIT=0.

## 4) Validation evidence

| Validation | Time / SHA | Result |
|---|---|---|
| H exact-SHA CI | `16:23:04Z` / `8c40105...` | 8/8 check-runs + 4/4 workflow runs success; `gh pr checks 14` EXIT=0. |
| Durable backup | `16:28:09Z` | `/home/user/pm01dm4i-backup/` + `.tar.gz`; five original files + SHA256SUMS; known self-hash artifact disclosed. |
| F-R-03 local smoke | disposable PG16.2 DB | dry-run candidate 1 / deleted 0; `--apply` deleted 1; retained all protected rows; `dms_app --apply` denied EXIT=1; DB dropped. |
| Focused Vitest | `16:35:13Z` | 2 files / 17 tests PASS; FOCUSED_EXIT=0. |
| Static validation | `16:36:15Z` | diffcheck, OpenAPI (201/284/153/3), drift (0), partition (81), typecheck: all EXIT=0. |
| Migration cycle | `16:36:37Z` | 1029 identical objects after down/up; EXIT=0; temp DB deleted. |
| M4 regression | `16:36:48Z` | 7 files / 117 tests PASS; REGRESSION_EXIT=0. |
| Stage A exact-SHA CI | `16:40:49Z`–`16:45:46Z` / `ce34fdc...` | 9/9 check-runs + 5/5 workflow runs success; `gh pr checks 14 --watch -i 15` EXIT=0. |
| Full local validation | `16:50:11Z`–`16:50:48Z` | API unit 26 files / 339 tests, web 17 files / 88 tests, root build: all EXIT=0. |
| Final I exact-SHA CI | recorded in PR #14 body / final chat | never transferred from another SHA. |

Full logs are enumerated in `docs/product-inventory/evidence/task-pm-01d-m4-i/VERIFICATION.txt`; `/tmp` artifacts are non-durable. Local PG16.2 trust-auth is explicitly **not** CI- or production-equivalent. CI exact-SHA workflows provide real PostGIS 16-3.4, MinIO, Redis 7.4.12 and password auth. Regression/security suites mutate `dms_*` cluster SCRAM hashes; all four exact G-R original hashes were restored and exact-match verified, all roles NOLOGIN. No `greendms_i_*` cleanup role or DB leftovers remain; older G-R/probe/task DBs predate I.

## 5) Authoritative matrix and residual findings

`docs/product-inventory/M4_ACCEPTANCE_MATRIX.md` is the current A–D matrix. Every current row uses only `PASS`, `FAIL`, `UNVERIFIED`, or `NOT APPLICABLE`; historical labels are quoted and preserved. It resolves the evidence contradiction by separating historical aggregate verdict, implementation status, independent verification, exact SHA and scope.

Mandatory M4 functional/security rows A-01..A-20 and B-01..B-08 are `PASS`. The mandatory independent full re-audit of all seven original R findings at the final SHA (R-AGG) is `UNVERIFIED`: F/G/H/I self-assessments and G-R’s narrow F-R-01/02 review do not substitute for it. Therefore aggregate M4 technical acceptance is **UNVERIFIED**, not `PASS` and not `FAIL`.

Still outside this task:

- R `FAIL` / F-R `FAIL` historical aggregates and G-R narrow `VERIFIED SAFE` at `2e6d271...`: preserved without contradiction.
- Production topology, exact object owner, password-auth/PostGIS equivalence, external archive, retention/scheduling, network/ACK/pool/`ACCESS EXCLUSIVE` operational impact, manual RTL/a11y/console review: `UNVERIFIED`.
- G-03 two-person approval `PARTIAL / VERIFIED=NO`, PM-B1..PM-B8 `OPEN / NOT APPROVED`, whole-file atomicity Q1–Q5 `OPEN / NOT APPROVED`, Product Master `BLOCKED`: not M4 acceptance items; `NOT APPLICABLE`.
- PR #14 approval/merge/release/deploy/production change: `NOT APPLICABLE` and not performed.

## 6) Deliverables

- `docs/product-inventory/M4_ACCEPTANCE_MATRIX.md` — authoritative A–D matrix and historical/current ledger.
- `docs/product-inventory/evidence/task-pm-01d-m4-i/VERIFICATION.txt` — durable command/result ledger.
- `docs/product-inventory/evidence/task-pm-01d-m4-i/VERIFICATION.json` — durable structured source-SHA, verdict, CI and contradiction ledger.
- `docs/product-inventory/TASK-PM-01D-M4-I_IMPLEMENTATION.md` — this report.
- `EVIDENCE_INDEX.md` — I section appended; earlier F/G/H entries retained.
- PR #14 body — I final section with exact final SHA and exact final-SHA CI run IDs.
- Final chat report — A–D matrix, exact historical contradiction resolution, exact validation/CI evidence, remaining gap, and mandated readiness line.

## 7) Readiness

The code and exact-SHA CI evidence for Stage A are green; F-R-03/04 are implemented and tested. Acceptance nevertheless requires an independent full read-only re-audit at the final SHA with exact commands/results and production topology evidence. No aggregate PASS may be claimed while R-AGG is `UNVERIFIED`.

**M4 ACCEPTANCE READINESS: UNVERIFIED**

This is an evidence/readiness assessment, not permission to approve, merge, release or deploy.

## 8) Current-state addendum — TASK-PM-01D-M4-K (2026-11-10, dated record)

The independent Agent-2 review `TASK-PM-01D-M4-J` at exact SHA `39355a377fe66f3fd8c2bae996c8ec92211bd4db` returned `PASS WITH FINDINGS` for isolated M4 technical scope. K adopts that current-state verdict in `docs/product-inventory/M4_ACCEPTANCE_MATRIX.md` §8 and `docs/product-inventory/TASK-PM-01D-M4-K_IMPLEMENTATION.md`. This section does **not** rewrite §5 or §7 above: the I-stage `UNVERIFIED` readiness line is preserved as a historical record. Product Master remains `BLOCKED`; production deployment remains `NOT AUTHORIZED`. No approval, merge, release or deployment is implied.
