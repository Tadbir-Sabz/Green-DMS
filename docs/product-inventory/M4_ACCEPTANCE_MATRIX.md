# TASK-PM-01D-M4-I — Authoritative M4 acceptance matrix and evidence ledger

**Baseline / required starting SHA:** `8c40105f8c5b38660a605078207ac5bd90215359` (H final).
**I Stage A SHA:** `ce34fdcd738240025fb4f8c801da1a948eb98108` (implementation + tests).
**Final I SHA and exact final-SHA CI run IDs:** recorded in PR #14 body and the final chat report, not as a self-referential hash inside this repository.
**Branch / PR:** `arena/be5eaff3-green-dms`; PR #14 remains OPEN / DRAFT against `main`.

This matrix covers **M4 technical acceptance readiness only**. Passing M4 does **not** accept Product Master, approve PM-B1..PM-B8, authorize a release/deployment, or imply owner approval. Verdict vocabulary for every current row is exactly `PASS`, `FAIL`, `UNVERIFIED`, or `NOT APPLICABLE`. Historical labels such as `FAIL`, `PASS WITH FINDINGS`, `VERIFIED SAFE`, `BLOCKED`, and `OPEN / NOT APPROVED` are preserved in quoted form and are never rewritten as if they never existed.

## 0) Evidence-source SHAs

| Source | Exact SHA | Durable evidence |
|---|---|---|
| M4 implementation | `975c12f4533996f832c7639ee534c327a1c7df4d` → `6bffef38fc4ce007798e68d4c7959729c76100e2` | `TASK-PM-01D-M4_IMPLEMENTATION.md`; `migrations/0062_product_bulk_maintenance.{up,down}.sql`; API/web/tests; PR #14 body. |
| R read-only review | `6bffef38fc4ce007798e68d4c7959729c76100e2` | Historical chat-only verdict `FAIL` preserved in F report and PR #14 body; no standalone R report file in repo. |
| F remediation | `74e71172055d6cad482305db1834300c62fb53f5` | `TASK-PM-01D-M4-F_IMPLEMENTATION.md`, `0063_product_bulk_evidence.{up,down}.sql`, `product-bulk-maintenance-security.api.test.ts`, PR #14 body. |
| F-R read-only review | `74e71172055d6cad482305db1834300c62fb53f5` | Historical chat-only verdict `FAIL`; root causes preserved in G report; no standalone F-R report file. |
| G remediation | `2e6d2711cb2a8b1f60b8c39b87eeb3f3a13a295c` | `TASK-PM-01D-M4-G_IMPLEMENTATION.md`, `0062.down`, `0063.down`, `0064_audit_partition_recovery.{up,down}.sql`, race/recovery suites. |
| G-R independent read-only review | `2e6d2711cb2a8b1f60b8c39b87eeb3f3a13a295c` | Read-only chat + temp evidence; key results now committed here and in `docs/product-inventory/evidence/task-pm-01d-m4-i/VERIFICATION.json`. Narrow scope: F-R-01/F-R-02 `VERIFIED SAFE`; M4-G technical acceptance `UNVERIFIED`; Product Master `BLOCKED`; overall `PASS WITH FINDINGS`, 4 LOW. |
| H documentation reconciliation | `12b80451ab69de72b2bf4039324a015ff794c472`, `95bd63ac3184445fe616783ae9f1d4be45ace550`, `cac07c4493afd86981a3c9e2ab36b495b4dfd01a`, `8c40105f8c5b38660a605078207ac5bd90215359` | `TASK-PM-01D-M4-H_IMPLEMENTATION.md`, `evidence/task-pm-01d-m4-h/VERIFICATION.txt`, EVIDENCE_INDEX H section. |
| I Stage A | `ce34fdcd738240025fb4f8c801da1a948eb98108` | F-R-03 operator cleanup tool, F-R-04 direct viewer test, operator guide, H spelling fixes, test manifest. |
| I final | not hardcoded | PR #14 body + final chat report; exact final-SHA CI runs recorded there. |

## 1) Category A — M4 requirements

| ID | Requirement / scope | Implementation location | Existing verification evidence | Evidence source + exact SHA | Latest independent review | Current verdict | Remaining action |
|---|---|---|---|---|---|---|---|
| A-01 | Baseline preservation; no destructive Git / protected-migration rewrite | Git history, PR #14 | Five-way SHA agreement, clean worktree, `git diff --check` | `8c40105...`; I baseline `/tmp/pm01dm4i-baseline.txt` | none needed | `PASS` | None. |
| A-02 | Additive reversible ledger, forced RLS, least-privilege grants | `migrations/0062_product_bulk_maintenance.up.sql`; `0063_product_bulk_evidence.up.sql` | 64 up/down/up, 1029 identical objects; migrations-security 8/8; security API 11/11 | `975c12f...`, `74e7117...`, `2e6d271...`, I validation `ce34fdc...` | G-R narrow review at `2e6d271...` | `PASS` | Production topology remains D-01. |
| A-03 | Server field whitelist; protected-field smuggling denied | `product-bulk-maintenance.dto.ts`, `.service.ts`, `normalizeBulkChanges` | `product-bulk-maintenance.api.test.ts` 12/12; security API 11/11 | `6bffef3...`, `74e7117...`, `ce34fdc...` | R `FAIL` at `6bffef3...` (historical); no full current re-audit | `PASS` | Full independent R re-audit is R-AGG. |
| A-04 | Bounded 100 products / 9 typed fields | DTO, service, SQL CHECK, web helpers | API tests, web tests, typecheck | `6bffef3...`, `ce34fdc...` | none | `PASS` | None. |
| A-05 | Read-only exact preview with row versions | `preview()`, repository, `REPEATABLE READ` | API DB tests; no UPDATE/history/audit in preview | `6bffef3...`, `74e7117...` | none | `PASS` | None. |
| A-06 | Explicit confirm; execute accepts no new field body | controller DTO, service | crafted execute / no-confirm tests | `6bffef3...`, `ce34fdc...` | none | `PASS` | None. |
| A-07 | `master.product.update` fail-closed API/UI; viewer denied | controller `@RequirePermissions`, web gate, `CatalogAccess.write` | 401/403 tests; new F-R-04 direct viewer POST reconcile 403 at `ce34fdc...` | `6bffef3...`, `74e7117...`, `ce34fdc...` | R `FAIL` historical | `PASS` | Full independent R re-audit is R-AGG. |
| A-08 | All-or-nothing single transaction for one selection | `atomicCommit`, `ProductRepository.update`, shared runner | row-version conflict rollback, audit/history consistency | `6bffef3...`, `74e7117...`, `ce34fdc...` | none | `PASS` | Real network/ACK loss is D-05. |
| A-09 | Concurrency, stale/expired, idempotent replay | company+operation lock, token hash, stored result | focused tests; G-R regression 7/117 | `6bffef3...`, `74e7117...`, `ce34fdc...` | G-R focused regression `PASS` | `PASS` | Pool saturation is D-05. |
| A-10 | Audit/history aligned with COMMIT | `AuditService.recordRequired`, `0060` trigger, `0063` evidence | security API 11/11; partition recovery 7/7 | `74e7117...`, `2e6d271...`, `ce34fdc...` | G-R narrow review | `PASS` | Production partition topology is D-01. |
| A-11 | `unknown` and fail-closed reconciliation; GET read-only | `operationStatus`, `reconcileOperation`, explicit POST reconcile | security API 11/11; new viewer denial test | `74e7117...`, `ce34fdc...` | F-R `FAIL` historical | `PASS` | Full independent F-R re-audit is R-AGG. |
| A-12 | OpenAPI / typed client / Persian RTL UI | `packages/contracts/openapi.yaml`, API client, web page | OpenAPI 201/284/153/3; drift 0; partition 81; typecheck; CI e2e success | `6bffef3...`, `ce34fdc...` | none | `PASS` | Manual responsive/RTL/a11y/console is D-03b. |
| A-13 | Import §E semantics and owner decisions unchanged | `0061`, owner decision docs | M4 report §8; whole-file owner decision §6 | `df6ff0e...`, `8509255...`, `6bffef3...` | none | `PASS` | None; C/D categories remain separate. |
| A-14 | Full Product Master / operational-domain acceptance | outside M4 | `DomainCatalogGate` fail-closed, `available:false` | `50ddb34...`, `8509255...` | none | `NOT APPLICABLE` | Owner decisions C-01..C-03. |
| A-15 | F-R-01 rollback TOCTOU | `0062.down`, `0063.down` lock-first guards | race suite 8/8; G-R exact-SHA harness 8 verdicts true | `2e6d271...` | G-R `VERIFIED SAFE` at `2e6d271...`; production `UNVERIFIED` | `PASS` | D-01 production topology. |
| A-16 | F-R-02 measured ownership / recovery identity | `0064_audit_partition_recovery.up.sql`, docs | role matrix 7/7; H owner command; G-R real TCP roles log | `2e6d271...`, `8c40105...` | G-R `VERIFIED SAFE` isolated+CI; production `UNVERIFIED` | `PASS` | D-01 production topology. |
| A-17 | F-R-03 expired preview cleanup | `scripts/cleanup-expired-bulk-previews.mjs`; operator guide §4-b | 5/5 new tests; dry-run/apply/idempotency/denial; RLS/grants postflight | `ce34fdc...` | none | `PASS` | Production retention/scheduling policy D-06; no runtime scheduler approved. |
| A-18 | F-R-04 direct viewer POST reconcile 403 | `product-bulk-maintenance.api.test.ts` | direct 403 + 401 + ledger/evidence unchanged | `ce34fdc...` | none | `PASS` | None. |
| A-19 | H-01..H-04 operational/documentation consistency | H report, architecture/deploy/operator docs, migrations README | H validation; I fixed 3 H non-ZWNJ spellings; CJK scan 0 | `8c40105...`, `ce34fdc...` | G-R 4 LOW caveats | `PASS` | None. |
| A-20 | Exact-SHA CI and full local validation for H and I Stage A | existing workflows, unchanged | H 8/8 check-runs + 4/4 runs; Stage A 9/9 check-runs + 5/5 runs; local API unit 26/339, web 17/88, root build EXIT=0 | `8c40105...`, `ce34fdc...` | none | `PASS` | Final I SHA CI recorded in PR #14 body. |
| R-AGG | Independent full re-audit of all seven original R findings | no new independent report | F/G/H/I self-assessment + narrow G-R; no full independent R/F-R re-review at final SHA | `6bffef3...`, `74e7117...`, `2e6d271...` | R `FAIL`; F-R `FAIL`; G-R narrow `VERIFIED SAFE` only | `UNVERIFIED` | Read-only independent re-review at final SHA with exact commands/results; production topology evidence. |

## 2) Category B — related migration/security requirements M4 depends on

| ID | Requirement / scope | Implementation location | Existing verification evidence | Evidence source + exact SHA | Latest independent review | Current verdict | Remaining action |
|---|---|---|---|---|---|---|---|
| B-01 | `0062` additive ledger, forced RLS, no `DELETE` for `dms_app` | `0062.up.sql` | migration cycle, grants probe, security API 11/11 | `975c12f...`, `74e7117...`, `ce34fdc...` | G-R narrow | `PASS` | None. |
| B-02 | `0063` operation-bound evidence, invoker triggers, pinned `search_path`, no new `SECURITY DEFINER` | `0063.up.sql` | security API 11/11; `x-request-id` forgery denied | `74e7117...`, `ce34fdc...` | F-R `FAIL` historical; G-R narrow | `PASS` | Full independent re-audit R-AGG. |
| B-03 | `0064` owner-only partition recovery; EXECUTE revoked from runtime roles | `0064.up.sql` | role matrix 7/7; H `postgres` owner command; exact `0064.down` catalog | `2e6d271...`, `8c40105...` | G-R `VERIFIED SAFE` isolated+CI | `PASS` | Production topology D-01. |
| B-04 | Lock-first rollback guards and fixed lock order | `0062.down`, `0063.down` | race 8/8; G-R 8 verdicts true | `2e6d271...` | G-R `VERIFIED SAFE` | `PASS` | `ACCESS EXCLUSIVE` operational impact D-05. |
| B-05 | Reverse-dependency rollback order H-04 | runner scripts, docs | H order probe: direct `0062.down` failed closed; standard order succeeded | `8c40105...` | G-R H-04 note | `PASS` | None. |
| B-06 | Real `dms_app` TCP least privilege / forced RLS / fail-closed GUC | `product-bulk-maintenance-security.api.test.ts` | 11/11; no DELETE/DDL/evidence INSERT; `x-request-id` ignored | `74e7117...`, `ce34fdc...` | G-R role matrix | `PASS` | None. |
| B-07 | Exact `0064.down` catalog restore | `0064.down.sql` | migrations-security 8/8; G-R exact catalog check | `2e6d271...`, `ce34fdc...` | G-R `VERIFIED SAFE` | `PASS` | None. |
| B-08 | No protected migration edits in H/I | `0062.down`, `0063.down`, `0064.up/down`, `0041`, `0019`, `0042` | H protected diff EXIT=0; I no migration file changed | `8c40105...`, `ce34fdc...` | none | `PASS` | None. |
| B-09 | Production-equivalent PostgreSQL/PostGIS/password-auth topology | outside repo | exact-SHA CI uses real PostGIS 16-3.4, MinIO, Redis; local PG16.2 trust-auth shims are not equivalent | `6bffef3...`, `74e7117...`, `2e6d271...`, `8c40105...`, `ce34fdc...` | G-R production `UNVERIFIED` | `UNVERIFIED` | Authorized production topology evidence; owner/operator sign-off. |

## 3) Category C — Product Master requirements outside M4

| ID | Requirement / scope | Implementation location | Existing verification evidence | Evidence source + exact SHA | Latest independent review | Current verdict | Remaining action |
|---|---|---|---|---|---|---|---|
| C-01 | PM-B1..PM-B8 owner decisions | `TASK-PM-01B_DOMAIN_OWNER_DECISIONS.md`, owner closure, decision package | All eight OPEN / NOT APPROVED; no signatory, domain ID, registry row or permission vocabulary invented | `50ddb34...`, `df6ff0e...`, `8509255...`, `6bffef3...`, `8c40105...` | none | `NOT APPLICABLE` | Explicit owner/IAM/security approval evidence; separate from M4. |
| C-02 | G-03 two-person approval binding / approval-engine integration | `GAP_REGISTER.md`, `TASK-24_PRICING_ENGINE.md`, `product-sensitivity.ts` fallback | `PARTIAL / VERIFIED=NO`; D4 fallback RBAC + explicit confirm + audit remains; no claim of two-person approval | `8509255...`, `6bffef3...`, `8c40105...` | G-R Product Master `BLOCKED` | `NOT APPLICABLE` | Separate Product Master/IAM gate; not an M4 blocker. |
| C-03 | Operational-domain registry, membership, lifecycle, cross-domain visibility | `DomainCatalogGate`, fail-closed endpoints | `available:false`; 400/503 without data; no inferred membership | `50ddb34...`, `8509255...`, `8c40105...` | none | `NOT APPLICABLE` | PM-B1..PM-B8 and TASK-PM-01E gate. |
| C-04 | Full Product Master business acceptance | outside M4 | PR #14 body and multiple milestone reports keep `BLOCKED` | `6bffef3...`, `74e7117...`, `2e6d271...`, `8c40105...` | G-R `BLOCKED` | `NOT APPLICABLE` | Owner decisions, independent Agent2 review, manual acceptance. |

## 4) Category D — broader release / deployment requirements

| ID | Requirement / scope | Implementation location | Existing verification evidence | Evidence source + exact SHA | Latest independent review | Current verdict | Remaining action |
|---|---|---|---|---|---|---|---|
| D-01 | Exact production topology, object owner, password auth, real PostGIS equivalence | deployment docs, CI services | exact-SHA CI is not production; local trust-auth PG16.2 is not equivalent | `8c40105...`, `ce34fdc...` | G-R `UNVERIFIED` | `UNVERIFIED` | Authorized production topology evidence; no production DB/config access performed. |
| D-02 | S3/MinIO object storage in production topology | CI integration-storage, release-image | exact-SHA CI MinIO round-trip PASS; production S3 not proven | `8c40105...`, `ce34fdc...` | none | `UNVERIFIED` | Production-grade storage acceptance. |
| D-03a | Playwright E2E in isolated CI stack | `.github/workflows/e2e.yml` | exact-SHA H and Stage A e2e check-runs success | `8c40105...`, `ce34fdc...` | none | `PASS` | Final I SHA CI in PR #14 body. |
| D-03b | Manual responsive / RTL / a11y / clean-console browser review | none | not executed; explicitly UNVERIFIED in M4/F/G/H reports | `6bffef3...`, `74e7117...`, `2e6d271...`, `8c40105...` | none | `UNVERIFIED` | Separate manual acceptance. |
| D-04 | Whole-file import atomicity Q1..Q5 | `TASK-PM-01D-M3_WHOLE_FILE_ATOMICITY_OWNER_DECISION.md` | M4 all-or-nothing is only for one ≤100-product selection; §E per-batch unchanged; no approval evidence | `df6ff0e...`, `8509255...`, `6bffef3...`, `8c40105...` | none | `NOT APPLICABLE` | Explicit owner/Product Owner/IAM/security decision; not an M4 acceptance item. |
| D-05 | Real network partition / ACK loss, pool saturation, real BullMQ/queue, `ACCESS EXCLUSIVE` operational impact | none | not executed; local Redis ECONNREFUSED is disclosed, not a PASS | `6bffef3...`, `74e7117...`, `2e6d271...`, `8c40105...`, `ce34fdc...` | none | `UNVERIFIED` | Separate load/network/operational acceptance. |
| D-06 | External evidence archive and production retention/scheduling policy | I cleanup tool has no scheduler/retention policy | tool requires explicit tenant + cutoff + `--apply`; no production schedule invented | `ce34fdc...` | none | `UNVERIFIED` | Operator/owner-approved retention policy and archive. |
| D-07 | Approve / merge / release / deploy / production change | none | PR #14 OPEN / DRAFT; no approval, merge, release, deploy, production DB/config change | `8c40105...`, `ce34fdc...` | none | `NOT APPLICABLE` | Explicit owner authorization required; not performed. |

## 5) Historical / current status ledger — distinct findings

| ID | Historical verdict (preserved) | Exact historical SHA | Implementation status | Independent verification | Current M4 verdict | Scope limits / missing evidence |
|---|---|---|---|---|---|---|
| R | `FAIL` (`CRITICAL 0 / HIGH 1 / MEDIUM 3 / LOW 3`) | `6bffef3...` | F remediated 7 findings; G/H/I added fixes; no historical verdict rewritten | No full independent R/F-R re-review at final SHA | `UNVERIFIED` | Stale aggregate as a description of current code, and a separate evidence gap. Missing: independent read-only re-audit of all 7 original findings at final SHA + production topology. |
| F-R | `FAIL` (`CRITICAL 0 / HIGH 0 / MEDIUM 2 / LOW 2`) | `74e7117...` | F-R-01/02 fixed by G; F-R-03/04 closed by I | G-R narrow review only | `UNVERIFIED` | Historical aggregate not erased; narrow G-R does not equal full F-R re-audit. |
| F-R-01 | `FAIL` (rollback TOCTOU) | `74e7117...` | lock-first guards at `2e6d271...` | G-R `VERIFIED SAFE` at `2e6d271...` | `PASS` | Isolated DB/CI + exact-SHA source; production topology `UNVERIFIED`. |
| F-R-02 | `FAIL` (ownership / recovery identity) | `74e7117...` | `0064` owner-only invoker function at `2e6d271...`; H docs at `8c40105...` | G-R `VERIFIED SAFE` at `2e6d271...` | `PASS` | Fresh isolated DB + exact-SHA CI; exact production owner topology `UNVERIFIED`. |
| F-R-03 | LOW: expired preview cleanup unimplemented | `74e7117...`, `2e6d271...` | bounded operator tool + 5/5 tests at `ce34fdc...` | none | `PASS` | Production retention/scheduling policy and archive remain `UNVERIFIED`; no docs-only resolution. |
| F-R-04 | LOW: direct viewer POST reconcile 403 inferred, not directly tested | `74e7117...` | direct 403/401 + unchanged ledger/evidence test at `ce34fdc...` | none | `PASS` | No inferred-only status remains. |
| G-03 | `PARTIAL / VERIFIED=NO`; two-person binding not approved | `8509255...`, `6bffef3...` | D4 fallback retained; no two-person binding | none | `NOT APPLICABLE` | Product Master / IAM / owner gate, not an M4 requirement. |
| Whole-file atomicity | `OPEN / NOT APPROVED` | `df6ff0e...`, `8509255...` | §E per-batch unchanged; M4 selection all-or-nothing only | none | `NOT APPLICABLE` | Separate owner decision; M4 success does not approve it. |

## 6) H / G-R contradiction resolution

`R = FAIL` and `F-R = FAIL` are **historical aggregate verdicts** recorded at `6bffef3...` and `74e7117...`. G-R was a **later, narrower independent read-only review** at `2e6d271...`; it reported `F-R-01 VERIFIED SAFE` and `F-R-02 VERIFIED SAFE` with exact scope limits, plus `M4-G technical acceptance UNVERIFIED`, `Product Master BLOCKED`, 4 LOW caveats and `PASS WITH FINDINGS` overall. These statements do not contradict each other once time, SHA and scope are separated. I does **not** erase R/F-R `FAIL`, does **not** promote G-R to full M4 acceptance, and does **not** mark a finding resolved merely because H described it correctly. The current mandatory acceptance gap is an independent full re-audit at the final SHA; therefore aggregate M4 readiness remains `UNVERIFIED`.

## 7) Current M4 readiness ledger

- Mandatory M4 functional/security rows A-01..A-20 and B-01..B-08: `PASS`.
- Mandatory independent acceptance evidence R-AGG: `UNVERIFIED` — exact missing evidence stated above.
- Category C Product Master items: `NOT APPLICABLE` to M4; Product Master remains `BLOCKED / UNVERIFIED`.
- Category D production/release items: separate `UNVERIFIED` / `NOT APPLICABLE`; no deployment authorization.
- Historical R/F-R `FAIL` and G-R `VERIFIED SAFE` remain distinguishable and preserved.
- No aggregate `PASS` is claimed while R-AGG is `UNVERIFIED`.

**M4 ACCEPTANCE READINESS: UNVERIFIED** — this is an evidence/readiness assessment, not permission to approve, merge, release or deploy.
