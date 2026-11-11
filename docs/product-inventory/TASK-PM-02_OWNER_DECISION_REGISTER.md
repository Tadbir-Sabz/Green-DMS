# TASK-PM-02 — Compact owner decision register (PM-B1..PM-B8, Q1..Q5, G-03)

**Status:** `OPEN / NOT APPROVED` for every decision below. This register is a decision aid, **not** an approval, a deferral, a signatory, or an executed policy. No recommendation below was implemented. No M4 verdict was changed.
**Baseline SHA:** `c382d6a822fdf52b711f168f1778443a70194a24` · **Branch:** `arena/be5eaff3-green-dms` · **PR #14:** `OPEN / DRAFT`.

**Columns:** `ID | exact unresolved question | current documented interpretation | alternatives (not selected) | architectural / business consequence | recommendation (advice only) | can implementation proceed?`

---

## 1. PM-B1..PM-B8 — operational domain decisions

| ID | Exact unresolved question | Current documented interpretation | Alternatives | Consequences | Recommendation | Can implementation proceed? |
| --- | --- | --- | --- | --- | --- | --- |
| PM-B1 | What exactly is an operational product-catalog domain, what is its stable company-scoped identifier and who owns its authoritative mapping? | `TASK-PM-01B_DOMAIN_OWNER_DECISIONS.md` §2: no authoritative registry; `pricing_domain`, approval `domain_id`, branch/area/warehouse/company/labels are explicitly rejected. | (a) new company-scoped registry; (b) reuse a verified equivalent with audited mapping; (c) derive from existing org objects. | (c) would silently equate pricing/branch scope with catalog identity — forbidden. (a) needs migration, RLS, grants, cutover. (b) needs proof of equivalence. | (a) one explicit registry with audited mappings, only after signed examples. | **NO** for registry/membership. **YES** for independent central-only work (PM-02 proceeded). |
| PM-B2 | What are the domain lifecycle states, allowed transitions, enabled/disabled semantics and versioning? | No domain lifecycle exists; `DomainCatalogGate.status()` is permanently `available:false`. | (a) explicit versioned state machine; (b) boolean `is_active`; (c) implicit status from another object. | Boolean/implicit states cannot express retirement, suspension or historical meaning; would rewrite history on change. | (a) owner-approved transition table with examples. | **NO** for lifecycle. **YES** independent work. |
| PM-B3 | Who may list/search domains, which fields are visible to central, domain and read-only roles? | Only company-level `master.product.view` exists; no domain-scoped permission vocabulary. | (a) IAM-approved domain-scoped permissions + field matrix; (b) reuse `master.product.*`; (c) UI-only filtering. | (b)/(c) leak domain existence and bypass server-side authorization. | (a) with unauthorized-response tests. | **NO** for domain APIs. **YES** independent work. |
| PM-B4 | Who creates/retires domains, assigns actors, manages membership centrally vs locally, and is delegation allowed? | `AuthContext` has no domain identity/assignment; `CatalogAccess` revalidates company-level permissions only. | (a) split central/domain authority matrix + explicit actor-domain assignment; (b) central-only; (c) domain-only. | Without assignment, any path/body UUID could be mistaken for proof of authority; company RLS is necessary but insufficient. | (a) with missing-context fail-closed rules and IAM sign-off. | **NO** for authority/assignment. **YES** independent work. |
| PM-B5 | Exact membership states (`absent`/`available`/`unavailable`/withdrawn/suspended), transitions, reason requirements, optimistic concurrency, approval requirement. | `TASK-PM-01_PRODUCT_MASTER_SPEC.md` §2 defines the business invariant (absence ≠ unavailable; central active ≠ all-domain availability) but **no** state machine or approval wiring is approved. | (a) bounded state machine, no physical delete, immutable history; (b) boolean availability; (c) reuse `product.status`. | (b)/(c) would make domain membership a global product property — explicitly forbidden. | (a) with duplicate/conflict/409 examples. | **NO** for membership writes/history. **YES** independent work. |
| PM-B6 | Who may browse central products absent from a selected domain, and with which fields/privacy constraints? | No absence list exists; blocked domain routes return 400/503 without data. | (a) permissioned, field-filtered candidate view; (b) full central catalog to any domain user; (c) hide all absent products. | (b) leaks central catalog existence; (c) may block legitimate administration. | (a) with cross-domain/cross-company non-leak tests. | **NO** for absence views. **YES** independent work. |
| PM-B7 | When a domain is retired, do membership/history rows keep an immutable snapshot of domain identity/status, and how are retired references displayed? | No membership or domain history table exists; `product_catalog_history` is central-only and immutable. | (a) immutable identity snapshot + retention policy; (b) mutable FK/current-value join; (c) delete history. | (b) rewrites historical meaning; (c) destroys audit evidence. | (a) with no-rewrite tests. | **NO** for domain history. **YES** independent work. |
| PM-B8 | Which central/domain roles may compare memberships or see history across domains? | No cross-domain read path exists; company RLS alone does not decide domain boundaries. | (a) role-based, field-filtered, audited cross-domain visibility; (b) unrestricted central read; (c) no cross-domain read. | (b) violates domain autonomy/privacy; (c) may block central oversight. | (a) with unauthorized-history tests. | **NO** for cross-domain reads. **YES** independent work. |

**Approval evidence still required for all eight:** written product-owner answers with rationale + approval reference + accountable role (not an invented named signatory), IAM/security sign-off, acceptance examples, contract/DB/RLS/history/audit/UI tests, and cutover/backfill policy. See `TASK-PM-01C_OWNER_DECISION_PACKAGE.md` and `TASK-PM-01D_OWNER_DECISION_CLOSURE.md`. All eight remain `OPEN / NOT APPROVED`.

## 2. Q1..Q5 — whole-file import atomicity

| ID | Exact unresolved question | Current documented interpretation | Alternatives | Consequences | Recommendation | Can implementation proceed? |
| --- | --- | --- | --- | --- | --- | --- |
| Q1 | Must the whole CSV file be all-or-nothing? | `TASK-PM-01D-M3_WHOLE_FILE_ATOMICITY_OWNER_DECISION.md`: §E per-batch atomicity (100 rows) is implemented/approved; whole-file atomicity is not. | (a) yes; (b) no, keep per-batch; (c) only for a class of errors. | (a) needs a global transaction, safe compensation/staging, and interaction with immutable `0060` history and idempotent replay. | Keep (b) until a designed/tested (a) or (c) is approved. | **NO** for import atomicity change. **YES** independent work. |
| Q2 | May successful batches remain committed after another batch fails? | Current M2 behaviour: yes, with explicit `transaction_outcome` / `failure_category` per batch and `partial` display. | (a) yes with explicit partial state; (b) no, compensate; (c) yes up to a threshold. | (b) must not rewrite immutable history/audit; needs a new compensating event and owner-approved historical meaning. | (a) with explicit partial vocabulary. | **NO** for compensation. **YES** independent work. |
| Q3 | How does a user retry a half-finished file? | Same `idempotency_key` replays a terminal result; a stranded `processing` row resumes from cursor; `unknown` stops for operator review. | (a) same key replay; (b) corrected file + new key; (c) UI "resume only failed batches"; (d) operator stop on `unknown`. | Ambiguity between "same operation" and "new operation" risks semantic duplicate rows and network-ACK uncertainty. | Preserve (a)/(d); approve (b)/(c) only with duplicate-prevention tests. | **NO** for retry semantics. **YES** independent work. |
| Q4 | Are current file/batch statuses and counters sufficient, or is a new file-level vocabulary (`partial`/`compensated`/`needs_operator_review`) required? | `processing|completed|failed` + per-batch `outcome/category/retryable`; no post-compensation recount. | (a) keep; (b) add file-level states; (c) recount after compensation. | Needs a deterministic API/client contract, Persian RTL labels and drift tests. | (a) until a compensation policy exists. | **NO** for status vocabulary. **YES** independent work. |
| Q5 | What are the audit/history integrity requirements for a committed-then-compensated row? | `audit_log` and `product_catalog_history` are append-only; no compensation event exists. | (a) two separate historical events; (b) one final event; (c) rewrite/delete previous. | (c) is forbidden. Requires approval authority, possible second-person approval, retention and auditor reporting. | (a) append-only with a new compensating event, if Q1/Q2 ever approve compensation. | **NO** for audit/history change. **YES** independent work. |

**All Q1..Q5 remain `OPEN / NOT APPROVED`.** M4's bounded bulk operation is not an answer to them. PM-02 did not change §E, `0061`, commit behaviour, batch counters, retry, vocabulary, `audit_log` or `product_catalog_history`.

## 3. G-03 / two-person binding — exact investigation result

**Question asked:** exactly which action needs two-person approval, identities/roles, whether the authorization model supports it, necessary state transitions/audit records, and approved vs owner-decision details.

| Item | Verified finding | Source |
| --- | --- | --- |
| Which concrete action requires a second person | `POST /pricing/margin-exceptions/{id}/decision` (margin exception). DB constraint `ck_margin_exception_second_person` enforces `decided_by is null or decided_by <> requested_by`; service returns `403 second_person_required`. A general `POST /approvals/{id}/decision` rejects `created_by == decidedBy` (`403 self_approval_forbidden`), `requested_by == decidedBy` (`self_approval_forbidden`), `requester_identity_missing` and `entity_creator_identity_missing`. | `migrations/0049_pricing_promotion_engine.up.sql:263-266`, `apps/api/src/modules/rules-engine/rules-engine.service.ts:715-745`, `docs/product-inventory/TASK-24X_APPROVAL_ARCHITECTURE.md` §3/§4. |
| Identities / roles | `requested_by` and `decided_by` come from the verified session, not the body. Step eligibility comes from `approval_step_def.approver_role_id` / `approver_staff_id`; `rules.approval.decide` permission; delegation is checked in `delegationCoversStep` (active window, same company/domain) but never overrides self-approval. `created_by` comes from the persisted business entity (`loadEntityState`). `approval_request.entity_domain_id` is an untyped UUID, **not** a catalog domain. | `rules-engine.service.ts` `submitForApproval`, `decide`, `eligibleApproversForStep`; `TASK-24Z_POLICY_COMPOSITION.md` §5. |
| Does the model support Product Master two-person approval? | **Infrastructure: YES for pricing/orders; capability for Product Master: NO.** `approval_binding` + `fingerprintOf` + `consumeApprovedBinding` are wired for `pricing.margin_exception`, sales order, return request and purchase order. No Product Master operation name, fingerprint field list, `loadEntityState` mapping, binding consumption, or product-specific approval policy exists. Product sensitive writes use `RBAC + confirm_sensitive (same actor) + audit_log` — the **approved D4/M-5 fallback**, not second-person evidence. | `apps/api/src/modules/master-data/product-sensitivity.ts`, `product.service.ts`, `product-master.service.ts`, `rules-engine.service.ts:900-1295`, `docs/product-inventory/GAP_REGISTER.md` G-03. |
| Necessary state transitions / audit records **if** approved (not implemented) | An owner-approved operation matrix; a Product Master binding with entity fingerprint (e.g. `row_version` + sensitive fields) computed from the database; `submit → approve/reject → consume` with binding consumption and the business transition in **one** transaction; invalidation when the entity changes between approval and execution (`entity_changed_since_approval`); retry/supersession semantics; immutable `approval_decision` rows with two distinct natural persons; `audit_log` event vocabulary; and, if PM-B4 is approved, an authoritative domain scope. None may be invented from the pricing binding. | `rules-engine.service.ts` `consumeApprovedBinding`; `TASK-24Z_APPROVAL_CAPABILITY_MATRIX.md`; `TASK-PM-01D-M4` M4 appendix. |
| Approved today | D4 sensitive-field matrix and its pre-G-03 fallback (`RBAC + confirm_sensitive + audit`); the existing pricing second-person DB constraint and general self-approval prohibition; immutable `approval_decision`; composed central+domain approval policies for supported operations. | `PRODUCT_MASTER_TARGET_DESIGN.md` §F, `TASK-24X_APPROVAL_ARCHITECTURE.md`, `TASK-24Z_POLICY_COMPOSITION.md`. |
| Owner decision (OPEN) | Whether any Product Master sensitive change requires two-person approval; which operations/fields; exact roles and second-person identity rules; fingerprint fields; invalidation/retry; audit contract; whether domain-scoped approval is required; and acceptance evidence. `GAP_REGISTER.md` G-03 retains its open items (no approver notification, no auto-expiry, domain not modelled at chain level, no delegation lifecycle, historical unlinked exceptions). | `GAP_REGISTER.md` G-03, `TASK-24X_APPROVAL_ARCHITECTURE.md` §6, `TASK-24Z_APPROVAL_CAPABILITY_MATRIX.md`. |

**Constraint honoured:** PM-02 did not weaken, bypass, reuse speculatively, or invent G-03/two-person approval semantics; `product-sensitivity.ts`, all D4 guards, all approval tables and all approval bindings are unchanged. No test was made to pass by relaxing an approval rule.

## 4. Isolation of decisions from implementation

Every row above answers **"can implementation proceed?"** with `YES` for independent, approved central-only work and `NO` for the owner-gated semantics. PM-02 therefore implemented the central/domain separation boundary and its explicit projection without touching any blocked decision. No `approved` word is applied to PM-B1..PM-B8, Q1..Q5 or a Product Master G-03 binding. Full Product Master acceptance remains **BLOCKED**; production deployment remains **NOT AUTHORIZED**.

---

## 5. TASK-PM-02-B2 — consolidated owner-decision package (gate unchanged)

**Status preservation:** PM-B1..PM-B8, Q1..Q5 and the Product Master G-03
two-person binding all remain **OPEN / NOT APPROVED**. Full Product Master
acceptance remains **BLOCKED**; production deployment **NOT AUTHORIZED**.

`TASK-PM-02-B2_OWNER_DECISION_PACKAGE.md` is a single concise decision *request*
for the three gating items, with the exact unresolved question, 2–3 alternatives,
a clearly-labelled recommendation, consequences, the precise implementation
elements blocked, and required acceptance evidence for each:

| ID | Gating question | Recommended alternative (advice only) | Hard blocker for |
|---|---|---|---|
| PM-B1 | What is an operational catalog domain, its stable company-scoped ID/code/name, its owner, and whether any existing object may be reused or must be explicitly mapped | New explicit company-scoped registry with audited mappings | registry table/migration, `domain_id` FKs, mapping/backfill, provider `resolve`/`list`, domain identity in `AuthContext`/OpenAPI, cross-company registry tests |
| PM-B2 | Lifecycle states, legal transitions, who may change them, versioning, post-retirement reads, and effect on memberships/in-flight operations | Explicit versioned state machine with an approved transition table | status/state columns and enums, transition endpoints/guards, activation/retirement, optimistic concurrency, lifecycle-aware membership validity, retention |
| PM-B4 | Central vs. domain authority, who assigns/revokes users, whether delegation is allowed, assignment source, and missing-context fail-closed rules | Split central/domain authority matrix with explicit revocable actor-domain assignment + IAM sign-off | authority matrix/`authorize` resolver, assignment table/source, revocation/expiry, domain-scoped permission vocabulary, least-privilege grants, server-side membership writes |

PM-B3/B5–B8, Q1–Q5, G-03 and TASK-24Z open policy items are listed as blocked
but non-gating for the first increment. The unblocking artifact is the signed,
referenced seven-column decision table (decision ID, document number/date,
organizational approval reference, chosen option, approved examples, IAM/Security
sign-off, acceptance evidence) plus rationale, named signatory, accepted
security/privacy consequences, cutover/backfill policy and concrete tests.

**Gate evidence re-verified at B2 baseline `dad4ce8…`:** PR #14 reviews `0`,
review comments `0`, one non-approval independent-review *request* comment,
issues `#11`/`#12` unrelated, no tracked sign-off document or approval reference,
no `git log --all` approval. `TASK-PM-02_IMPLEMENTATION.md` §8 is a
recommendation, not an approval. Silence, tests, recommendations and historical
docs are not approvals.

**What B2 did (independent, non-gated):** extended the already-approved
`DomainBoundaryGuard` to central READ surfaces (`GET /products`,
`GET /products/{id}`, `GET /products/export`, `GET /products/import/report/{id}`)
so that domain-owned query keys are rejected with `400` *before* the
`whitelist:true` pipe silently strips them; documented `400` on the import-report
operation; regenerated the TS client; added DB-free unit/structural tests and
real-HTTP/native-PostgreSQL negative + positive tests. Domain-context routes that
intentionally read `@Headers("x-domain-id")` are deliberately **not** given the
guard. No registry, lifecycle, assignment, membership, migration, RLS, domain
API, UI activation, permission vocabulary, backfill or cutover was added;
`OPERATIONAL_DOMAIN_AUTHORITY` remains unregistered and `DomainCatalogGate`
remains fail-closed. No decision semantics were invented or weakened.

---

## 6 — TASK-PM-02-C1: هیچ تصمیم مالکی مصرف یا دور زده نشد

C1 «مرکز تصاویر و اسناد کالا» را پیادهسازی کرد، زیرا §0 طراحی هدف صریحاً تصویر را
جزو مواردی میداند که «تصمیمِ دامنهای نمیخواهند» و §A/§B4/§F معنای آن را بستهاند
(بازاستفاده از `owner_type='product'`، تصویرِ اصلی = نخستین بر اساس `created_at`،
RBAC عادی `master.product.*` + audit). بنابراین این کار **نه** به PM-B1 (هویت دامنه)،
**نه** به PM-B2 (چرخهٔ حیات)، **نه** به PM-B4 (اختیار/انتساب) و **نه** به
PM-B3/B5–B8 نیاز داشت و هیچیک را بهصورت پیشفرض نساخت.

همهٔ درخواستهای ثبتشده در §5 و بستهٔ `TASK-PM-02-B2_OWNER_DECISION_PACKAGE.md`
همچنان **باز / تأییدنشده**اند: هیچ سند امضاشده، مرجع تصویب، نقش پاسخگو، امضای
IAM/Security، نمونهٔ پذیرش یا سیاست cutover/backfill تازهای در PR/issue/بررسیها پدیدار
نشد. C1 هیچ جدول/ستون/مهاجرت/RLS/گرانت/seed/مجوز/`domain_id`/عضویت/چرخهٔ حیات/
دسترسپذیری/انتساب/بازگردانی دادهای اضافه نکرد و `OPERATIONAL_DOMAIN_AUTHORITY` ثبت
نشده باقی ماند. `DomainCatalogGate` و مسیرهای ۴۰۰/۵۰۳ دامنهای بدون تغییر و fail-closedاند.

نتیجه: C1 برای توسعهٔ عادی **UNBLOCKED**؛ کل حوزهٔ دامنهای و پذیرش کامل Product Master
همچنان **BLOCKED** تا دریافت بستهٔ تصمیم امضاشدهٔ مالک.


---

## 7 — TASK-PM-02-C2: هیچ تصمیم مالکی مصرف یا دور زده نشد

C2 «مدیریت دادههای مرجع کالا» را بهدلیل §A («گروه/برند موجود … بدونِ تغییر»)،
§0 («تصمیم دامنهای نمیخواهند») و §F («برند/گروه = RBAC عادی `master.product.*`
+ audit») و بند بازماندهٔ G-06 پیادهسازی کرد. این کار **نه** به PM-B1 (هویت
دامنه)، **نه** PM-B2 (چرخهٔ حیات)، **نه** PM-B4 (اختیار/انتساب) و **نه**
PM-B3/B5–B8 نیاز داشت و هیچیک را پیشفرض نساخت.

مهاجرت `0065` فقط ستون/ایندکس/comment افزود؛ هیچ جدول دامنه، `domain_id`،
عضویت، دسترسپذیری، ماشین حالت، انتساب actor→domain، مجوز دامنهای، RLS دامنهای،
grant/نقش/seed تازه، backfill یا cutover اضافه نشد. `uom` سراسری و بدون RLS
(وضعیت پیشین) ماند؛ `brand`/`product_category` تحت RLS شرکت ۰۰۴۱ و
`CatalogAccess.write`اند. `DomainBoundaryGuard` روی همهٔ مسیرهای تازه اعمال شد؛
هدر `x-domain-id` و پارامتر/بدنهٔ ناشناخته `۴۰۰` صریح میگیرند. `base_uom_id` و
`factor_to_base` همچنان حساس D4اند و C2 هیچ تبدیل ضمنی واحد نساخت.

همهٔ درخواستهای §5 و بستهٔ `TASK-PM-02-B2_OWNER_DECISION_PACKAGE.md` همچنان
**باز / تأییدنشده**اند: هیچ سند امضاشده، مرجع تصویب، نقش پاسخگو، امضای
IAM/Security، نمونهٔ پذیرش یا سیاست cutover/backfill تازهای در PR/issue/بررسیها
پدیدار نشد. عبارت «برند/UOM … BLOCKED» در پیوست/جدول C1 **محدودهٔ C1** بود، نه
حکم مالک؛ متن تاریخی C1 بازنویسی نشد و C2 آن را صرفاً همسنجی کرد.

نتیجه: C2 برای توسعهٔ عادی **UNBLOCKED / PASS**؛ کل حوزهٔ دامنهای و پذیرش کامل
Product Master همچنان **BLOCKED** تا دریافت بستهٔ تصمیم امضاشدهٔ مالک. استقرار
تولید **NOT AUTHORIZED**؛ PR #14 `OPEN / DRAFT`. جزئیات:
`TASK-PM-02-C2_IMPLEMENTATION.md` و `VERIFICATION-C2.{txt,json}`.
