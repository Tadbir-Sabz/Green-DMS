# TASK-PM-01A — integrated implementation and evidence

## Scope and merge boundary

One implementation PR: https://github.com/Tadbir-Sabz/Green-DMS/pull/14 (draft until acceptance gaps below are resolved). Verified base: `6b4429ba7e55f7e02f407e63f2b2b2e197fad1fa`. No merge, deploy, protected-branch change, shared-database operation or downstream-module rollout is authorized/performed here. Earlier approval-module findings are not resolved by this task.

Reuses `0005`, `0046`, `0047`, existing Product Master services, RLS, typed barcodes, variant signatures and Persian UI. Applied migration history is not edited. New migration `0060_product_catalog_history` adds non-destructive family activation and atomic catalog evidence; it does not backfill invented events.

## Implemented workflows

- Product create/manual or automatic SKU, edit, optimistic version checking and soft deletion remain the existing supported APIs. Automatic generation now skips manual-code collisions under a company catalog transaction lock (bounded to 100 attempts); uniqueness constraints remain authoritative.
- Product/family/alias/attribute/enum/relation/bundle/barcode/packaging writes use DB-resolved permissions at the service boundary. Actor-supplied permission arrays no longer authorize status changes. User/company/role linkage, lock state and access level are checked. Nested operations must retain the same actor/company.
- Pool-query collaborators share one transaction through the existing tenant-aware pool. Bundle replacement joins that transaction rather than committing a separate connection. Attribute/signature changes, enum creation, primary-barcode replacement and packaging-plus-barcode now roll back together.
- Import batches commit their result counters only after batch commit. Barcode errors are no longer swallowed on updates. Sensitive status/base-UOM/tax changes are checked against current persisted values and canonical status permission inside the batch transaction. The existing explicit-confirmation fallback is retained; it is not advertised as two-person approval.
- Public category creation, family rename and family deactivate/reactivate are connected to `/products/settings`. Deactivation retains IDs/history/member products, does not change their status and prevents new assignments to the inactive family. Existing members can still be edited. No destructive family delete exists.
- Product history is immutable to `dms_app` (SELECT only), company-RLS scoped, indexed and keyset paginated. Actor/time/entity/before/after are recorded by a DB trigger in the same transaction as the mutation. Parent-delete evidence supports cascade ownership lookup. Old product audit/document snapshots remain untouched. New detail tabs show actual history, load/error/empty/retry states and an explicit domain-integration refusal.
- Product text search includes aliases/Latin names using a set query; code ascending/descending uses keyset comparison matching sort direction. UI sorting is connected. Settings and product write controls use existing session permissions; server checks remain authoritative.

## Operational-domain finding — BLOCKED, deliberately fail closed

Targeted source/schema review found company identity, branches, approval scopes and **pricing** domains, but no proven authoritative operational catalog-domain identity plus domain-management authorization contract. None is substituted. `GET /product-domain-integration` returns `available:false`; `GET /products/:id/domain-catalog` returns 503 without product or membership data. No inferred memberships or all-domains availability are created when a central product is active.

Minimal owner/IAM integration contract still needed:

1. Authoritative registry/provider and stable identifier, owning company, enabled/disabled lifecycle, and supported lookup/list API.
2. Canonical authorization resolver for catalog browse, domain browse and local management, plus company-level central management; map these to approved permissions/scopes, not arbitrary role names or IDs.
3. Confirm membership transition/status semantics and whether local managers may add/remove/deactivate independently. Central product identity must remain unchanged and activity must not imply membership.
4. Privacy rules for not-yet-added browsing, cross-domain detail/history visibility and historical membership identity after domain retirement.

Once supplied, add the separate membership persistence/API/UI and real two-domain isolation acceptance cases. This is an explicit missing contract, **not an approved deferral or a claim that domain functionality is complete**. No new operational registry or permission vocabulary has been fabricated.

## Completion matrix (acceptance, not feature-count marketing)

| Area | Status | Evidence / remaining boundary |
|---|---|---|
| Central product CRUD/lifecycle and D1 | PASS WITH FINDINGS | Existing API/UI reused; collision handling and service guards strengthened. No saturation-load proof; final-source CI is recorded in the PR body. |
| Families/categories | PASS WITH FINDINGS | Connected create/rename/family activation, stable references. Family/reference dropdown collections retain the legacy unpaginated API; not all reference lists have new paging/filter UX. |
| Attributes/variants, typed barcodes, aliases/duplicates, relations | PASS WITH FINDINGS | Existing connected implementation preserved; mutations now share transaction. See native Product Master suites plus new rollback tests; not every editing permutation has browser coverage. |
| UOM/conversion and catalog bundles | PASS WITH FINDINGS | Finite/positive/four-decimal factor guard, shared packaging/barcode transaction, D5 retained. UOM remains the existing global reference model; no company-owned UOM policy or global UOM history invented. |
| Bulk import | PASS WITH FINDINGS | Per-batch atomicity, D4 denial, barcode rollback and sequential idempotent replay are tested. Concurrent same-key report races and whole-file (multi-batch) all-or-nothing remain findings. |
| Service write authorization and isolation | PASS WITH FINDINGS | Canonical permission query, nested tenant checks, `dms_app` RLS proof and import-only actor denial. No independently reviewed security approval or saturation-load test. |
| Atomic history | PASS WITH FINDINGS | Trigger-backed evidence, select-only runtime grant, company RLS/fail-closed context proof, keyset API/UI and rollback tests. No synthetic pre-migration history. Family/category history is persisted but not exposed as a dedicated history screen. |
| Independent domain membership/status/browse/history/privacy | BLOCKED | Authoritative identity/auth contract above absent; fail-closed endpoint/UI only, not membership implementation. |
| Persian RTL UI | PASS WITH FINDINGS | Real connected central workflows, permission-aware controls, component tests and shared Playwright CI; manual visual/responsive/accessibility acceptance remains UNVERIFIED. |
| Full two-person approval binding for PM sensitive changes | NOT CLAIMED | Existing explicit-confirmation guard retained; does not create/fabricate approval bindings. |
| Independent Agent2 review | UNVERIFIED | No independent read-only agent dispatch/report available in this session. |
| Whole TASK-PM-01A module acceptance | BLOCKED | Domain contract and remaining evidence/UX findings prevent a complete-module claim. |

## Validation ledger

### Implementation `0107fe95b2ee652c75b498f6761ff50bc98cb8d7`

- Local `npm ci --no-audit --no-fund`: exit 0.
- API DB-free partition: 21 files, **311 passed**, zero test skips, exit 0. Includes 6 new catalog-boundary unit tests. This is not native SQL evidence.
- Web: 10 files, **63 passed**, zero test skips, exit 0 (includes 4 history/domain component tests).
- Full typecheck/build, OpenAPI validation and contract-drift checks: exit 0.
- CI https://github.com/Tadbir-Sabz/Green-DMS/actions/runs/42625812468: all five jobs SUCCESS, including native PostgreSQL/PostGIS integration, runtime isolation, storage and unit checks.
- Migration fresh up → down → up: SUCCESS at https://github.com/Tadbir-Sabz/Green-DMS/actions/runs/42625812494 (isolated `postgis/postgis:16-3.4`). No production/shared DB touched.
- Shared Playwright E2E SUCCESS: https://github.com/Tadbir-Sabz/Green-DMS/actions/runs/42625812580. Release image smoke SUCCESS: run 42625812486. These existing suites are not a claim of complete PM browser coverage.
- `gh run view 42625812468 --log`: exit 1, signed log download EOF from results-receiver.actions.githubusercontent.com. Native total test counts/individual skip counts could not be extracted; job status is independently available via GitHub API. Do not invent totals from a green check.
- Initial `git diff --check` reported trailing whitespace; fixed in the follow-up, not hidden as an initially clean check.

### Follow-up source `40c4e3a14d58062aa1b73aae941a52edada75be2` and later UI work

Closes import guard/error-swallowing paths, adds non-destructive family lifecycle and cascade-safe history ownership. Local focused boundary tests 6/6 and full typecheck passed. Adds native integration cases for category/family public workflows, actor/before/after/history pagination, product/evidence rollback, family activation/reference preservation, barcode/packaging rollback, precision, forged permissions and fail-closed domain behavior. These cases require native PostgreSQL/PostGIS and are not skipped or replaced with an incomplete SQL engine.

After permission-aware UI changes: focused product component tests **6/6 across 2 files**, exit 0; web typecheck exit 0. No native PostgreSQL/psql/docker service exists locally; native acceptance is provided by the isolated CI jobs, not a fabricated local run.

### Fully green source `f441f023e15015f4de319609c959128f9e5ed605`

- Local commands, all exit 0: `node scripts/check-test-partition.mjs`; DB-free API Vitest partition **21 files / 311 passed**; `npm run test:web` **11 files / 65 passed**; `npm run typecheck`; `npm run build`; `npm run openapi:check` (188 paths / 269 operations / 134 schemas / 3 webhooks); `node scripts/contract-drift.mjs`; `git diff --check`.
- `gh pr checks 14`: all eight checks PASS. CI run 42627040215 (5/5 jobs), Playwright E2E 42627040446, release image smoke 42627040451 and migration up → down → up 42627040907 all SUCCESS on this exact SHA. Earlier runs on `40c4e3a` were cancelled by the subsequent fast-forward push, not failed; migration runs for that intermediate SHA succeeded.
- Native PostgreSQL/PostGIS integration job 129193485233: **47 files / 1026 passed (1026)**; Vitest printed no skipped/pending line. Environment: GitHub `ubuntu-26.04` runner with isolated `postgis/postgis:16-3.4`, PostgreSQL 16.4. The earlier whole-run `gh run view --log` EOF remains recorded above; a later signed per-job log fetch provided these exact totals. Check annotations include Node 20 deprecation/Ubuntu image migration warnings and expected injected-fault PostgreSQL errors; no clean-console claim is made.
- Agent2 independent review remains UNVERIFIED. The PR comment requesting a read-only review is not a review or approval.

### Final hardening source

Adds actual `dms_app` company-RLS/fail-closed history proof, import-only D4 denial, barcode-conflict rollback with preserved `duplicate_barcode` code, transaction-local import recheck and domain-specific batch error mapping. The exact final-SHA CI/check results are recorded in **PR #14 body** so the repository does not need another SHA-changing documentation commit after validation. Whole-module acceptance remains **BLOCKED** on the authoritative domain contract and the remaining findings above.
