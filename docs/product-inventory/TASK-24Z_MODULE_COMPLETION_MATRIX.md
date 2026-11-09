# TASK-24Z final gate — bounded module completion matrix

## Authority and boundaries

Canonical authority: `PRODUCT_ROADMAP.md` §§4–5, 7–8, 12–13. Gate 2 requires one coherent module at a time and approved prerequisites, not parallel expansion into the full platform. `IMPLEMENTATION_SEQUENCE.md` P1–P9 is a proposal where it changes canonical ordering (`ROADMAP_UPDATE_PROPOSAL.md` R1); phase labels here do not approve a reorder. Existing Product Master D1–D5 decisions remain binding, including catalogue-only bundles until P5.

**Current slice:** TASK-24Z approval governance / rules-engine prerequisite and its three already-integrated consumers (sales order, return, purchase order). This is not a claim that procurement, sales, pricing or Product Master is complete. Approvals remain inside rules-engine (`DEPENDENCY_MAP.md` §4); do not create a separate competing engine.

**Next business module under the canonical roadmap:** finish the Product Master assessment/completion gate, not all workflow/admin screens for every business domain. Check current Product Master code and evidence against its target design before selecting a new increment; older checkpoint text is not a fresh inventory. Shared approval gaps must first be completed or explicitly accepted as a bounded prerequisite by the owners. This matrix is proposed placement, not authorization to defer a current contract requirement.

| Capability / remaining gap | Placement | Current primary status | Current gate / boundary | Owner / completion evidence required |
|---|---|---|---|---|
| Compose all applicable policies; decision/binding execution, immutable supersession for three consumers | Required for current module | IMPLEMENTED WITH GAPS | Backend controls/tests exist; independent review and P3–P6 decisions still open; no whole-module PASS | Workflow/security: signed review, policy limitations and runtime evidence |
| Composed chain provenance, stage source and reason, effective threshold/SoD display | Required for current module | IMPLEMENTED WITH GAPS | Snapshot/audit backend is not complete end-user provenance UI; must show which immutable version is being decided | Workflow UI + QA: Persian desktop/mobile populated request, source policy, changes/resubmit, no history reuse |
| Decision journey for pending/returned/rejected/expired/superseded requests | Required for current module | IMPLEMENTED WITH GAPS | Existing approval/inbox screens and backend lifecycle tests do not prove the full browser journey | Workflow UI + QA: supported API initiation; decision, resubmit, stale/replay and failure recovery browser cases |
| Delegation identity, effective actor, expiry/revocation and SoD explanation | Required for current module | IMPLEMENTED WITH GAPS | Backend checks exist; complete operator display and operational domain semantics are not verified | IAM/workflow + governance: D01/D03/D06, cross-company and revoked/expired UI controls |
| Basic chain/policy administration, publish/disable permissions and validation | Required for current module | MISSING | Complete operator UI not evidenced; do not imply inactive is deny. No advanced universal rule builder | Workflow admin owner: D01–D05, permission/audit tests, validation and Persian help |
| No independent candidate / blocked stage availability diagnostics | Required for current module | IMPLEMENTED WITH GAPS | E3 remains open; decision-time denial retained; submit-time semantics depend on D06 | Workflow + security: shared eligibility service checks, atomic negative tests and actionable UI |
| Product sensitive-change approval integration and product audit/help | Required for next module | IMPLEMENTED WITH GAPS | Existing Product Master foundation is not a fresh completion claim. Follow target design D4 and approval prerequisites; no new rule invention | Product Master owner: fresh inventory, service-boundary paths, immutable snapshots and consumer regressions |
| Product attributes/variants, import/bulk outcomes, barcode/packaging/snapshot journeys | Required for next module | UNVERIFIED | Required by roadmap §8; this task did not assess completion of each product feature | Product Master owner + QA: gap inventory against target design, select bounded increment and real journeys |
| Purchase-order create/request/decision/execute browser page | Future product capabilities | MISSING | Backend purchase approval stays current security-review scope; full procurement UI belongs to procurement completion, not a new PR13 platform build. Owner must approve any current-scope limitation | Procurement UI + QA: permission/tenant isolation, financial amounts and public API end-to-end; D07 |
| Purchase-request approval gate (`purchasing.pr.approve`) and UI | Future product capabilities | IMPLEMENTED WITH GAPS | Existing permission-only path is not approval-governed. Follow procurement module/dependencies (inventory correctness); old matrix P1 label is not Product Master P1 | Procurement/budget owner: policy contract and separate atomic integration task |
| Customer-price/price-change workflow administration and UI | Future product capabilities | IMPLEMENTED WITH GAPS | Permission-only paths remain; owning pricing module must define and integrate governance. P2 in older capability matrix is not authorization to start now | Pricing/finance owner: price/tax/rounding invariants, simulations and immutable consumer regressions |
| Treasury day-close approval and admin UI | Future product capabilities | IMPLEMENTED WITH GAPS | Permission-only path; financial/treasury completion owns two-person rules and reopen semantics; not next Product Master increment | Treasury/finance owner: close/reopen, ledger effects, SoD and concurrency tests |
| Tenant auth/RLS/context cleanup and onboarding | Shared platform infrastructure | IMPLEMENTED WITH GAPS | Current consumers depend on these now; native CI is green, independent review still missing. No weakening or postponing security | IAM/platform + Agent-2: signed-token session lookup, cross-company isolation, pool discard, migration/provision review |
| Shared audit/provenance rendering and Persian accessible components | Shared platform infrastructure | IMPLEMENTED WITH GAPS | Implement only current approval needs; reusable component is not a generic platform rewrite | Platform UI + workflow: immutable audit, RTL/keyboard/error states |
| Notifications/escalations and common import/export infrastructure | Shared platform infrastructure | IMPLEMENTED WITH GAPS | Dependency map G05/G13: introduce at first required consumer; do not build complete notification centre in this PR. Limited product import first; independent centre at second consumer as designed | Platform/product lead: bounded dependency acceptance and delivery/retry/audit tests |
| Artifact access, event classification and independent visual review | Shared platform infrastructure | UNVERIFIED | Blocks evidence closure now; browser assertion PASS alone is insufficient | CI artifact-access owner + independent QA |
| General deny language, cross-domain risk orchestration, advanced workflow designer | Future product capabilities | MISSING | D01/D02/D05 must first establish actual requirements; no invented deny/score/precedence | Governance/product: approved target and owning module before implementation |

“Future product capabilities” means **not the next business module in this sequence**, not optional or approved deferred. Consumer gates stay tracked; existing backend regressions stay protected. If D07 confirms a capability was promised for this delivery, it remains a closure blocker until implemented or an explicit signed scope decision is recorded.

## Recommended next implementation task

**TASK-24Z-OPERATOR-CLOSURE — bounded approval provenance and lifecycle UX.** Start after D07 scope confirmation; resolve relevant D01–D06 decisions before dependent semantics are changed.

- Reuse existing snapshot/history and public approval APIs; inventory actual fields first, add only missing read-only contract fields with drift checks.
- Display immutable composed-stage policy provenance and effective delegated identity; clear blocked/error/expired/superseded states and safe resubmit action.
- Add populated desktop/mobile Persian RTL/keyboard browser journeys: request → decision → consume; rejected/returned/changed → new request; no reuse of historical decisions; authorization/SoD negative cases.
- Do not add procurement CRUD, treasury close, customer pricing, universal policy builder or risk engine. Keep financial/security behavior unchanged.
- Acceptance: owner-approved bounded scope, independent security review, exact-head CI, browser artifacts including classified console events, Persian operator help. Existing successful suites need no manual rerun absent relevant change.

After this prerequisite and its review gate, resume **Product Master** completion discovery under the existing target design. Do not leap directly to pricing/procurement or mark the proposed P1–P9 reorder approved.

## TASK-24Z-OPERATOR-CLOSURE implementation update

The earlier table is the discovery baseline, not an unchanged statement that all
operator screens are missing. This update supersedes those UI dispositions for
the bounded delivered slice; D01–D07 remain in the owner register.

| Current capability | Implementation now | Remaining gate |
|---|---|---|
| Actionable inbox | Existing server-selected tasks; keyboard-selectable actions, success feedback, detail-before-decision link and cache refresh | Independent authorization review; D06 self-only availability remains open |
| Company/submitted/expired register | Responsive cards, explicit filters including superseded binding projection, loading/error/empty states and refresh | Exact-head evidence in operator report; not a paginated large-volume redesign |
| Decision history and delegation identity | Company-gated detail shows stored decision, timestamp, comment, actor and delegated_from; no history edits | Independent review; older missing metadata is not reconstructed |
| Composed policy provenance | 0059 stores matched policies/source-chain inputs for new requests; Persian detail shows source chains plus effective saved stages | Historical provenance stays explicitly unavailable; rollback drops added evidence only |
| Request lifecycle/resubmission | Details show pending/rejected/approved/cancelled/expired/superseded and consumption; links to existing sales/return owner pages; valid returned → new request → approval browser journey | No new purchase UI; owner semantics and complete broader consumer journeys are not claimed |
| Configuration/operational oversight | New read-only policy/chain page, central/domain/operation labels and explicit unknown-policy boundary | Configuration create/publish UI and complete delegation authoring remain NOT IMPLEMENTED in this slice, dependent on D01–D07 scope/semantics; not silently approved deferred |
| Delegation overview | Both identity IDs and active/not-started/expired/revoked display; existing revoke retained | Delegated decision metadata API regression verified; no new eligibility rules or substitute selection |
| Operator Persian help | `docs/APPROVAL_OPERATOR_GUIDE_FA.md` | Independent accessibility/visual review pending |

This is a substantial implemented operator slice, **not** a declaration that all
workflow/admin capability or the entire current module has passed its completion
gate. The owner must resolve/accept remaining scope explicitly. No roadmap reorder
or procurement/treasury/pricing expansion occurred.

**Next business-module proposal remains Product Master**, after current approval
prerequisite gates. Start with fresh evidence-backed discovery against the approved
Product Master target and D1–D5; select one bounded missing journey, retain sensitive
change enforcement, four-decimal precision and unchanged financial rounding,
historical snapshots, tenant isolation and catalogue-only bundle restriction.
Do not assume implementation is absent merely from older inventory text or start
all consumer modules at once.

## Exit-gate determination (supersedes ambiguous deferral language)

`TASK-24Z_EXIT_GATE.md` now provides the authoritative task-local exit matrix:
full current module STILL BLOCKED, supported journeys PASS WITH FINDINGS only.
Configuration authoring, substitution management, chain administration and
least-privilege decider/history access need completion or explicit authorized
boundary acceptance. “Future” in earlier rows was proposed placement, never an
approved deferral. Actual approved future restriction is Product Master D5 bundle
operations until P5. Product Master next-step specification is prepared separately;
no new module implementation or global rollout authorized by this documentation.
