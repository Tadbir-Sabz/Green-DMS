# TASK-24Z-OPERATOR-CLOSURE — bounded implementation and verification

## Alignment and verdict

Input remote/PR/local HEAD verified as `330504730bb992432cfa6e3ae5eb43c0fce7fa26`, clean worktree, PR13 OPEN on `arena/1246108f-green-dms`. Its own CI42604745360 (all five jobs), browser42604745430, migration42604745339 and release42604745369 were SUCCESS. The historical d285850/a651288 results were not substituted for current input checks.

Implemented source sequence:
- `8951720840002787d212f994e748950dfae8554a`: operator register/detail, persisted source-policy provenance0059, immutable decision/delegation visibility and read-only configuration oversight.
- `bffdc4cfac8b5495797d9e77c5adb1fd3aa7b0a1`: valid priced browser fixture, Persian source-chain rendering.
- `5cbf3cf7dd0018022d0830324cc2ef2326744183`: superseded register projection/filter and populated0059 rollback test.
- **`b451d2bcde400e8c8c4c79192df40efb65806ed1`**: stable accessible filter names and regression controls. Final verified executable.

No merge/deploy/production changes, reset/history rewrite, weakening tests, new procurement/treasury/pricing module or invented D01–D07 rules. Later report/help commits are documentation only; their hashes are in Git history and the PR handoff, not confused with tested source.

## Scope discovery → delivered journeys

| Discovery gap | Delivered operator behavior | Explicit limit |
|---|---|---|
| Company request list lacked useful status/history context | Responsive register for company/submitted/expired, status filtering including superseded binding projection, selectable cards, refresh and error/empty/loading feedback | Existing list API is not newly paginated; high-volume redesign not claimed |
| No composed provenance/history operator view | `/approvals/[id]` and register detail show saved stages, matched policy inputs/source chains for new requests, actual actor and delegated_from, comment/time, persisted amount and binding consumption/supersession | Old provenance remains unavailable; not reconstructed from today's configuration |
| Inbox had no decision-history link/clear success | Keyboard buttons, record-before-decision link, decision success and invalidation of history/register caches, server errors retained | Server remains source of eligibility; no client-side authorization invention |
| Delegation display hid principal/agent and temporal status | Both audit identity IDs plus active/inactive/not-started/expired labels; existing revoke path | New substitute assignment/create UI not exposed without reviewed policy/security scope |
| Admin configuration not visible | `/approvals/administration` read-only policy scopes/thresholds/chains with refresh, empty/error/loading states and unresolved-policy warning; SNAP instances excluded from reusable configuration list | No domain/risk/quorum/deny editor, policy publication tool or central-policy bypass |
| Resubmission/history confusing | Closed/superseded record clearly cannot reopen; links to existing sales/return document pages to correct and request fresh approval | No purchase screen created; generic UI does not fabricate request/binding or reuse decisions |
| No operator help | `docs/APPROVAL_OPERATOR_GUIDE_FA.md` | Independent Persian UX/accessibility review pending |

## Contracts, transactions and security

Existing rules-engine routes/permissions reused. Register navigation uses `rules.view`, matching its server permission; inbox decisions retain `rules.approval.decide`. Backend remains authority even if a link is visible. Detail first verifies company ownership; binding projection independently filters company. Existing RLS and grants unchanged. OpenAPI additive fields and generated TypeScript client synchronized; no new endpoint.

0059 adds nullable `approval_request.policy_snapshot`. Only new submission writes server-selected matched policy inputs and original source-chain steps **inside the same existing request/binding transaction**. No caller-supplied provenance, policy reinterpretation, monetary recalculation or historic decision mutation. Effective stages remain the persisted composed chain. Down drops only new provenance (so its data is lost), preserves requests/decisions/stages; re-up leaves historical provenance NULL. The new populated rollback test asserts these exact facts.

See `TASK-24Z_OPERATOR_POLICY_DEPENDENCIES.md` for D01–D07 boundaries and `TASK-24Z_MODULE_COMPLETION_MATRIX.md` for updated scope dispositions. Missing configuration authoring and self-only submission availability are not mislabeled complete or approved deferred.

## Local verification (all isolated)

| Command / target | Result |
|---|---|
| `npx vitest run --root apps/web src/components/approvals/ApprovalRecord.test.tsx src/components/AppShell.test.tsx` | 10/10 PASS, exit0: loading/error/historical unknown, delegated/superseded record, source snapshot and navigation regressions |
| `npx vitest run --root apps/web src/components/approvals/ApprovalWorkspace.test.tsx` | 2/2 PASS, exit0: exact accessible labels, superseded projection, empty/error distinction |
| Local lifecycle API suite, initially44 tests | 44/44 PASS, exit0, no skips; public HTTP lifecycle/decision/concurrency/SoD/tenant controls retained with new detail/source/meta assertions |
| After new rollback/supersession test: lifecycle `-t 'R4|OP-PROVENANCE'` | 2 PASS,43 intentionally unselected, exit0, NOT a claim of45 local executions |
| Local migration-security suite | **exit1,2PASS1FAIL**, no skips:0048 populated geofence seed fails `st_geomfromtext(unknown, integer)` missing in local extension shim. Native CI results must supersede this environment gap, not a weakened test |
| API/web/E2E typechecks; OpenAPI validation and contract drift | exit0;184 paths,264 operations,133 schemas;0 endpoint/enum/required drift |

Local DB commands used `DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres PSQL=/tmp/pgshim/psql NODE_ENV=test` in `/tmp/audit24y` (isolated PostgreSQL18.6 extension shim). Not a PostGIS acceptance substitute. Evidence summaries and failure annotations preserved under `evidence/task24z-operator/`.

## Real browser and native execution history

| Source / browser run | Result and disposition |
|---|---|
|8951720 /42607257957|14 passed,1 failed, exit1. New operator fixture tried an empty order basket; existing pricing rejects it400. Corrected fixture to actual product/priced line; no pricing/assertion weakening. Native CI42607257956 all5jobs SUCCESS.|
|bffdc4c /42607946633|**15/15 PASS,11.2s,exit0**. Actual returned → fresh request → approved plus desktop/mobile historical record and read-only admin. CI42607946373 all5SUCCESS, migrations42607946595 SUCCESS, release42607946386 SUCCESS.|
|5cbf3cf /42608561472|New register-filter browser assertion timed out at exact accessible label. Existing workflow reached approval; register label needed an explicit accessible name. Fixed markup, not selector/assertion; regression added. CI42608561454 all5SUCCESS.|
|b451d2b /42609567817|**15/15 PASS,13.9s,exit0,0skipped/unexecuted**; real register/history/filter journey now passes unchanged.|

The browser fixture seeds only a reference category because there is no public category-write API. It refuses any project other than `browser-<numeric-run>-<numeric-attempt>` and validates company UUID before executing isolated compose psql. Products, actors, chains, policy, order, submission, decisions and resubmission use supported public APIs; no fabricated bindings/decisions/business transitions. Real price/stock/credit/SoD guards stay active.

## Screenshots and browser diagnostics

Major screens captured by actual Chromium attachments in the operator scenario:
- `operator-history-1440` and `operator-history-390`: returned/superseded history with policy provenance.
- `operator-register-superseded`: mobile register filtered to historical binding, populated detail.
- `operator-administration`: read-only settings oversight.
- Fixture `browser-screen`/event JSON for each test; JSON reporter and metadata in workflow artifact (90-day configured retention).

The bffdc4c artifact metadata is preserved in `browser-populated-artifacts.json`; final artifact metadata and annotations will accompany final result. These are remotely captured images, **not** a claim of local manual visual inspection. Signed-blob downloads have historically failed in this sandbox; user/reviewer should open the actual artifact's HTML report attachments.

New redacted console-detail notices make actual message inspection possible without blob download. On8951720 and bffdc4c the two console-error occurrences are:
1. `Failed to load resource: the server responded with a status of 401 (Unauthorized)` in the explicit wrong-password rejection browser test — **Expected browser behavior**, negative control401.
2. Identical text in the same test's `attachments/browser-events-...json` copy — **Test instrumentation duplication**, not evidence of a second application defect.

This classification uses actual current-run message/path notices. It does **not** retroactively prove the contents of older inaccessible artifacts. No clean-console claim. bffdc4c metadata counts2console errors,0pageerrors,14failedrequest occurrences,0HTTP5xx. Successful fixture rejects any transport failure other than `net::ERR_ABORTED`; recorded aborts follow intentional navigation, counts can duplicate originals/attachment copies. No request errors were suppressed or assertions relaxed.

## Independent review and remaining owners

Read-only Agent-2 review renewed in parallel:
https://github.com/Tadbir-Sabz/Green-DMS/pull/13#issuecomment-6738833255
No independent agent dispatch tool/report is available; fresh PR review list empty. **UNVERIFIED**, not “no findings”. Agent-1 source/test work is not independent review. Preserve future disagreements verbatim with evidence; no agreement presumed.

Remaining gates:
- **Review coordinator / Agent-2:** exact final executable authorization/RLS/transaction/financial/migration/onboarding review.
- **Governance/risk/process/IAM owners:** D01–D06 semantics; self-only candidate treatment and domain/risk/quorum/deny/admin authoring remain bounded off, not invented.
- **Product/module lead:** D07 acceptance of delivered operator slice vs remaining configuration/delegation authoring scope; not implicit deferral.
- **Independent QA/artifact-access owner:** manual screenshot/accessibility review and any unavailable historic console classification.

**Next business module proposal:** Product Master completion discovery against canonical roadmap§8, approved target design and D1–D5, after current prerequisite gates. Select one verified missing end-to-end product journey; preserve sensitive-change approvals, historical snapshots, precision/financial rounding and catalogue-only bundles. Do not expand this PR into procurement, treasury or unrelated pricing.

Final verdict must distinguish verified delivered journeys from overall module acceptance; no overall completion/merge approval while these gates remain open.

## Final executable evidence and verdict

At `b451d2bcde400e8c8c4c79192df40efb65806ed1`:
- CI https://github.com/Tadbir-Sabz/Green-DMS/actions/runs/42609567671 — **all five jobs SUCCESS**, including native Postgres/RLS and MinIO integration. Full job snapshot: `final-native-ci.json`.
- Browser https://github.com/Tadbir-Sabz/Green-DMS/actions/runs/42609567817 — **15/15 PASS,13.9s,exit0,0 skipped/unexecuted**.
- Native migrations42609567720 — SUCCESS; release-image/boot42609567674 — SUCCESS (not deployment).
- Browser counters:2console errors (expected401 plus attachment duplication, actual texts/path notices verified),0page errors,8failedrequest occurrences,0HTTP5xx. Passed fixture ensures every recorded transport failure is `net::ERR_ABORTED`; these are retained intentional navigation cancellations, not silently dropped events. No clean-console claim.
- Artifact https://github.com/Tadbir-Sabz/Green-DMS/actions/runs/42609567817/artifacts/13669457924 — 2,130,063 bytes, GitHub digest `sha256:9314d568f31e2dea4a19fcbfc3f2a42a1071f9477b2c53ba88051fd2acca532b`, configured90day retention. Digest is metadata, not a locally recomputed downloaded checksum.30PNG paths/30event paths include fixture/copy duplicates, not30tests. Named operator screenshots are in HTML-report attachments.
- Actual download attempted again using `gh run download 42609567817 --name playwright-report --dir /tmp/operator-final-screenshots`, exit1 signed-blob EOF. No extracted local screenshots or manual pixel/accessibility review is claimed. See screenshot manifest.

**Delivered supported operator journeys: PASS WITH FINDINGS. Overall module/release: NOT READY.**
Remaining configuration/delegation authoring scope and owner decisions are explicit,
not invented or approved deferred. Independent security/transaction review and
visual inspection remain UNVERIFIED. PR13 remains OPEN. New documentation-only
commits do not retroactively inherit these checks; check their own status separately.
