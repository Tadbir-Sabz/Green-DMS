# TASK-PM-01D-M4-I — Authoritative M4 acceptance matrix and evidence ledger

**Baseline / required starting SHA:** `8c40105f8c5b38660a605078207ac5bd90215359` (H final).
**I Stage A SHA:** `ce34fdcd738240025fb4f8c801da1a948eb98108` (implementation + tests).
**I final / J exact target SHA:** `39355a377fe66f3fd8c2bae996c8ec92211bd4db`; exact-SHA CI run IDs are recorded in A-20 below, PR #14 body and the durable J report. **K current-state records:** §8; the K final commit SHA is recorded in PR #14 body and the final chat report, not as a self-referential hash inside this repository.
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
| A-20 | Exact-SHA CI at I final / J target and independent J validation | existing workflows, unchanged | 8/8 check-runs + 4/4 workflow runs at `head_sha=39355a377fe66f3fd8c2bae996c8ec92211bd4db`: workflow runs `42859214454` e2e, `42859214511` migrations, `42859214519` release-image, `42859215185` CI; check-run IDs `129980469451`, `129980470263`, `129980472444`, `129980472808`, `129980472963`, `129980473065`, `129980473154`, `129980481452`; J independently re-ran OpenAPI 201/284/153/3, drift 0, partition 81, typecheck 4/4, 64 up/down/up with 1029 identical objects, API unit 26/339, web 17/88 and root build EXIT=0. No earlier-SHA green was transferred. | `39355a377fe66f3fd8c2bae996c8ec92211bd4db`; `evidence/task-pm-01d-m4-j/INDEPENDENT_REVIEW.md`; PR #14 body | Agent-2 J independent read-only review, overall `PASS WITH FINDINGS` | `PASS` | Raw final-SHA CI per-test log counts are `UNVERIFIED` because the external blob log returned EOF; local PG16.2 trust-auth is not production-equivalent; production topology remains D-01 `UNVERIFIED`. |
| R-AGG | Independent full re-audit of all seven original R findings — **mandatory M4 acceptance evidence row; retained, see §8 K current-state split** | no standalone original R report; J chat report now durable | F/G/H/I self-assessment + narrow G-R; J independently re-audited seven reconstructed current behaviors at `39355a3...` | `6bffef3...`, `74e7117...`, `2e6d271...`, `39355a3...` | R `FAIL`; F-R `FAIL`; G-R narrow `VERIFIED SAFE` only; J `PASS WITH FINDINGS` | `UNVERIFIED` | Historical I row preserved. §8 records the current-state split: isolated M4 technical correctness `PASS WITH FINDINGS`; exact original IDs/verbatim grouping and production topology/authorization remain `UNVERIFIED`. |

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

> **K dated note (2026-11-10):** the paragraph above and §7 below are preserved as the I-stage historical readiness ledger. The independent J review is now durable in `evidence/task-pm-01d-m4-j/INDEPENDENT_REVIEW.md`; §8 is the current authoritative state. R-AGG is not removed from mandatory M4 acceptance.

## 7) Historical I readiness ledger (preserved; superseded for current state by §8)

- Mandatory M4 functional/security rows A-01..A-20 and B-01..B-08: `PASS`.
- Mandatory independent acceptance evidence R-AGG: `UNVERIFIED` — exact missing evidence stated above.
- Category C Product Master items: `NOT APPLICABLE` to M4; Product Master remains `BLOCKED / UNVERIFIED`.
- Category D production/release items: separate `UNVERIFIED` / `NOT APPLICABLE`; no deployment authorization.
- Historical R/F-R `FAIL` and G-R `VERIFIED SAFE` remain distinguishable and preserved.
- No aggregate `PASS` is claimed while R-AGG is `UNVERIFIED`.

**M4 ACCEPTANCE READINESS: UNVERIFIED** — historical I record; see §8 for the current K verdict. This remains an evidence/readiness assessment, not permission to approve, merge, release or deploy.

## 8) TASK-PM-01D-M4-K — current-state acceptance reconciliation (2026-11-10)

This dated section is the **current authoritative acceptance state**. Sections 1–7 preserve I-stage records. It incorporates the independent Agent-2 `TASK-PM-01D-M4-J` review whose complete chat report is durable at `evidence/task-pm-01d-m4-j/INDEPENDENT_REVIEW.md`. K changed acceptance documentation and evidence records only: no application code, migration, grant, authorization, secret, production configuration, CI configuration, approval, merge, release, deployment, or PR readiness change was made. PR #14 remains `OPEN / DRAFT`.

### 8.1 R-AGG scope ambiguity resolution — A / B / C separation

**R-AGG is not removed from mandatory M4 acceptance.** The row in §1 is retained and explicitly marked mandatory. Its previous `UNVERIFIED` status is preserved as the I-stage historical readiness record. K splits the current state into three distinct questions:

| Dimension | Current status | Basis | Still missing |
|---|---|---|---|
| **A. Current isolated M4 technical correctness** | `PASS WITH FINDINGS` | Agent-2 J independently reviewed exact SHA `39355a377fe66f3fd8c2bae996c8ec92211bd4db`; all seven reconstructed current-state R behaviors received `PASS`; exact-SHA CI 8/8 check-runs and 4/4 workflow runs succeeded; J independently re-ran static checks, migration cycle, DB-free unit/web/build checks. | Exact final-SHA raw DB-backed per-test log counts are `UNVERIFIED` because the external CI log blob returned EOF; role-sensitive DB-backed suites were not locally re-executed under J/K read-only role constraints. |
| **B. Historical evidence completeness** | `UNVERIFIED` | The original R report was chat-only. No standalone report, exact original seven finding IDs, or verbatim grouping exists in the repository, PR comments/reviews, or durable evidence. J used reconstructed IDs `R-REC-01`…`R-REC-07`; these are **not original IDs**. | Original R transcript/signed report at `6bffef3...`, or explicit owner acceptance that the reconstruction is authoritative. No owner approval is invented here. |
| **C. Production topology and operational authorization** | `UNVERIFIED` / `NOT AUTHORIZED` | Exact production topology, object owner, password-auth/PostGIS equivalence, S3/MinIO production grade, retention/scheduling/archive, manual RTL/a11y/console, real network/ACK/pool, and `ACCESS EXCLUSIVE` operational impact were never approved or verified. | Authorized production-equivalent evidence, operator/owner sign-off, and explicit deployment authorization. No production DB/system was accessed. |

**Authoritative scope references:** `TASK-PM-01D-M4_IMPLEMENTATION.md:199-210` defines M4 as a bounded operation, explicitly excludes production/DB shared changes and domain/queue/RBAC additions, and states that local evidence alone is not production-equivalent; `GAP_REGISTER.md:220-227` and `PRODUCT_MASTER_TARGET_DESIGN.md:288-299` keep PM-B1..PM-B8, whole-file atomicity, domain registry/membership and owner approvals outside M4; `TASK-PM-01D-M4-F_INDEPENDENT_REVIEW_REQUEST.md:75-81` explicitly says a reviewer must not accept production-equivalent DB, network/ACK, pool, manual RTL/a11y/console, G-03, whole-file, PM-B1..PM-B8 or full Product Master as PASS; `TASK-PM-01D-M4-I_IMPLEMENTATION.md:7` limits I to M4 technical acceptance readiness, not Product Master approval, release/deployment or production change; `M4_ACCEPTANCE_MATRIX.md:64-84` separates Category C Product Master and Category D production/release requirements.

**Conclusion:** those authoritative M4 scope documents establish production topology/operator authorization as separate production-release gates, and exact original R IDs as historical-evidence completeness — not as current-code M4 technical prerequisites. I-stage wording at §1 R-AGG, §7 and `TASK-PM-01D-M4-I_IMPLEMENTATION.md:75,96` treated R-AGG plus production topology as an M4 blocker; K records that as an I evidence-ledger formulation, **not** an owner-approved scope prerequisite. No owner approval or approval decision exists in these records and none is invented. If an acceptance authority later requires original IDs or production topology as an M4 acceptance prerequisite, those prerequisites remain `UNVERIFIED` and would prevent an unconditional `PASS`; the current verdict is therefore `PASS WITH FINDINGS`, not `PASS`.

### 8.2 Final acceptance ledger distinctions

| Ledger item | Historical / preserved record | Current-state record at J target SHA | Scope / limitation |
|---|---|---|---|
| R historical verdict | `FAIL (CRITICAL 0 / HIGH 1 / MEDIUM 3 / LOW 3)` at `6bffef38fc4ce007798e68d4c7959729c76100e2`; chat-only, no standalone report. | **Unchanged; not rewritten.** | Historical aggregate only. |
| Seven reconstructed R current-state findings | No exact original IDs/grouping available. | `R-REC-01`…`R-REC-07` all `PASS` for current code at `39355a3...`. Full table: J report §B and `evidence/task-pm-01d-m4-j/INDEPENDENT_REVIEW.md`. | Reconstructed IDs are not original IDs; exact historical mapping `UNVERIFIED`. |
| R-AGG aggregate | I: `UNVERIFIED`; mandatory independent full re-audit absent. | **Mandatory row retained.** Current isolated M4 technical correctness: `PASS WITH FINDINGS`; historical evidence completeness: `UNVERIFIED`; production topology/authorization: `UNVERIFIED`. | No unconditional PASS; no silent removal. |
| F-R-01 rollback TOCTOU | F-R historical `FAIL`; G-R narrow `VERIFIED SAFE` at `2e6d271...`. | `PASS` — lock-first guards, 8 race tests, exact migration SHA256s match final tree, exact-SHA CI. | Narrow/isolated; production `ACCESS EXCLUSIVE` impact `UNVERIFIED`. |
| F-R-02 partition recovery identity | F-R historical `FAIL`; G-R narrow `VERIFIED SAFE`. | `PASS` — `0064` owner-only invoker function, EXECUTE revoked, 7 real-TCP role tests. | Exact production object-owner topology `UNVERIFIED`. |
| F-R-03 expired preview cleanup | F-R historical LOW; I implemented tool + 5 tests. | `PASS` for technical capability. | Production scheduling/archival/retention D-06 `UNVERIFIED`; I prose corrected below. |
| F-R-04 direct viewer POST reconcile | F-R historical LOW; inferred-only status previously. | `PASS` — direct 403/401, ledger/evidence/audit/version unchanged, `reconciled:false`. | None for the isolated technical finding. |
| Mandatory M4 A-category requirements | I A-01..A-20 / B-01..B-08 `PASS`; A-14 `NOT APPLICABLE`. | A-01..A-20 and B-01..B-08 remain `PASS`; A-20 now cites exact SHA `39355a3...`, exact CI IDs and J review. | A-14 correctly outside M4; manual RTL/a11y/console and production topology are separate D rows. |
| Product Master requirements | C-01..C-04 `NOT APPLICABLE` to M4; full Product Master `BLOCKED`. | **Unchanged `BLOCKED`.** G-03 `PARTIAL / VERIFIED=NO`; PM-B1..PM-B8 `OPEN / NOT APPROVED`; whole-file Q1–Q5 `OPEN / NOT APPROVED`. | M4 technical acceptance is not Product Master acceptance. |
| Production/release requirements | D-01, D-02, D-03b, D-05, D-06 `UNVERIFIED`; D-07 `NOT APPLICABLE`. | **Unchanged `UNVERIFIED` / `NOT APPLICABLE`; deployment `NOT AUTHORIZED`.** | PR #14 remains `OPEN / DRAFT`; no approve/merge/release/deploy. |

### 8.3 Exact-SHA CI, J limitations and factual corrections

- Exact SHA `39355a377fe66f3fd8c2bae996c8ec92211bd4db`: **8/8 check-runs** and **4/4 workflow runs** `completed / success`. Workflow runs: `42859214454` (e2e), `42859214511` (migrations), `42859214519` (release-image), `42859215185` (CI). Check-run/job IDs: `129980469451`, `129980470263`, `129980472444`, `129980472808`, `129980472963`, `129980473065`, `129980473154`, `129980481452`. A-20 above carries the same IDs and J's independent static/local re-checks.
- J limitations recorded here and in `evidence/task-pm-01d-m4-j/INDEPENDENT_REVIEW.md`: raw per-test CI log counts could not be independently retrieved because `gh api .../actions/jobs/129980473154/logs` returned EOF from an external blob host; local PG16.2 uses trust auth and is not production-equivalent; exact production topology/object owner/operator authorization remains `UNVERIFIED`.
- Factual correction: `TASK-PM-01D-M4-I_IMPLEMENTATION.md:40` previously said preview cleanup filters “by operation creation time”, incorrectly naming `created_at` as the cleanup filter. K corrected it to the explicit `expires_at` cutoff; `scripts/cleanup-expired-bulk-previews.mjs:111-132` selects `preview_created` rows with `expires_at <= $2::timestamptz`; `created_at` is not that filter. No code or migration was changed.
- Historical R/F-R/G-R/H/I verdicts remain unchanged in §5, §6, §7, the I implementation report and `evidence/task-pm-01d-m4-i/VERIFICATION.*`. Current-state assessments are added only as this dated K section and the K structured ledger.

### 8.4 Current final verdicts

**M4 TECHNICAL ACCEPTANCE: PASS WITH FINDINGS** — isolated M4 technical correctness at `39355a3...` is independently accepted with findings because all seven reconstructed current-state R behaviors pass, mandatory A/B technical rows pass, and exact-SHA CI is green. It is not an unconditional `PASS`: exact original R IDs/grouping, raw final-SHA per-test CI log counts, production topology/operator authorization, and several production/manual gates remain `UNVERIFIED`.

**PRODUCT MASTER ACCEPTANCE: BLOCKED** — PM-B1..PM-B8, G-03 two-person binding, whole-file atomicity Q1–Q5, domain registry/membership/lifecycle and full Product Master acceptance remain open or blocked.

**PRODUCTION DEPLOYMENT: NOT AUTHORIZED** — PR #14 is `OPEN / DRAFT`; no approval, merge, release, deploy, production DB/system access, role/grant/secret/config change, or production topology verification was performed. Readiness is not authorization.
