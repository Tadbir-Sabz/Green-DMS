# TASK-24Z-EXIT-GATE — definitive module boundary

## 1. Verdict and verified alignment

**Current module: STILL BLOCKED for full completion. NOT READY for approval, merge or deployment.** The implemented, supported operator slice has **PASS WITH FINDINGS** automated evidence; that does not make configuration/substitution management complete. No approved deferral or reduced module boundary has been received. “Conditionally complete” may only be considered after the owners explicitly accept the named limited boundary and required reviews; this report does not grant that acceptance.

Fresh input alignment, not inferred from prior messages:
- Local = remote branch = PR13 HEAD: **55f354871549f09b91cf1b437f0e70b8a9bd2906**.
- Branch `arena/1246108f-green-dms`, PR **OPEN**, clean initial worktree.
- Last implementation **b451d2bcde400e8c8c4c79192df40efb65806ed1**. `git diff --name-only b451d2b 55f3548` is documentation/help/evidence only.
- 55f3548 itself has all five CI jobs SUCCESS (42610341526), browser **15/15 PASS,14.5s,exit0** (42610341797), migrations SUCCESS (42610341206), release-smoke SUCCESS (42610341285). Saved head/job/annotation/artifact metadata: `evidence/task24z-exit-gate/`.
- This task changes documentation only. A subsequent documentation HEAD must be identified through Git/PR history; it must not inherit the above check conclusions as its own. No tests rerun or workflow manually dispatched, no broad implementation, no production change, merge or deployment.

## 2. Mandatory versus deferred capability matrix

Primary categories below are exit classifications, not fabricated owner approval. “Approved future scope” requires an actual approval reference; where absent, the row explicitly remains owner-gated. This table supersedes ambiguous use of “future” as though it were an accepted deferral in earlier matrices.

| ID / remaining capability | Primary category | Verified delivered boundary / remaining work | Effect on current exit / accountable owner |
|---|---|---|---|
| M01 configuration authoring/publication | **Mandatory for current module completion** | Existing APIs + read-only oversight are not an operator create/validate/publish journey. Need bounded chain/policy configuration, validation/errors, authorization/audit and safe central controls; publication/version semantics need design approval, not an invented draft state | Blocks full module; product/module owner must either require completion or explicitly accept a limited prerequisite contract under D07. Workflow UI/security own implementation after applicable D01–D05 choices |
| M02 delegation/substitution management | **Mandatory for current module completion** | Existing list/revoke, temporal labels and stored delegated identity delivered. End-to-end authorized create/change/substitute management is not delivered as UI. Need owner rules, authority/target checks, expiry/revocation and actor attribution; never reopen decisions or bypass SoD | Blocks full module unless explicit limited boundary accepted; workflow/IAM owner, D01/D03/D06/D07 |
| M03 approval chain administration | **Mandatory for current module completion** | Source/effective steps visible, but complete editable reusable-chain administration and safe activation workflow absent. SNAP instances must remain historical, not reusable editable templates | Same exit gate as M01, not a separate platform rewrite; workflow product owner/IAM, D03/D04/D07 |
| M04 operator permission consistency | **Mandatory for current module completion** | Inbox/decision require `rules.approval.decide`; record/history and administration require `rules.view`. These permissions are independent. A decide-only principal can be offered a history link which the API correctly denies; current browser uses CEO, not least-privilege decider. Seed supervisor entries in0022 include decide but not rules.view. This is a source-confirmed access/UX gap, not a bypass finding or claim about every customized deployment | IAM/security must choose a safe read boundary and verify least privilege. Recommend purpose-limited actionable/history read authorization rather than silently granting all deciders company-wide rules/config visibility. Add decider-only/read-only/no-permission/foreign-tenant tests; do not weaken current guards |
| M05 composed provenance | **Mandatory for current module completion** | New requests save matched-policy/source-chain inputs under0059; actual stage snapshot and governing policy shown. Old NULL provenance stays explicitly unknown. This supported behavior has API/browser evidence | Implementation satisfied for declared new-record boundary; independent review/manual visual check still required. Historic reconstruction is NOT mandatory or permitted; workflow/security reviewer |
| M06 lifecycle, resubmission, supersession | **Mandatory for current module completion** | Returned → fresh request → approval, immutable previous decisions, binding supersession filter and stale/replay/transaction controls delivered and tested. Generic history UI never fabricates bindings; existing sales/return owner routes retained | Supported lifecycle implementation satisfied; review required. Complete additional consumer-module UI is not silently added to this PR; workflow owner/security |
| B01 self-only candidate availability | **Requires explicit business-owner decision** | Decision-time SoD remains fail-closed; submission can be unfulfillable. No escalation/allow-all invented | D06 blocks a claim of complete operational resolution; process/IAM owner chooses reject/blocked/escalation, then bounded implementation/tests |
| B02 domain/risk/quorum/mixed assignment/deny | **Requires explicit business-owner decision** | Displaying stored data is independent and delivered; unapproved semantics not exposed as a working editor | D01–D05 affect only dependent semantics unless full-module contract requires them now. D07 must explicitly settle scope; cannot default to “future approved” |
| S01 independent security/transaction review | **Shared platform dependency** | All automated checks green does not replace Agent-2 | Mandatory exit gate; review coordinator/Agent-2; UNVERIFIED |
| S02 screenshot/accessibility inspection | **Shared platform dependency** | Real screenshots captured; supported artifact retrieval still fails EOF; no pixel/keyboard manual review | Evidence gate remains UNVERIFIED; CI artifact-access owner + independent QA |
| O01 display-name enrichment, richer timeline, history export, optional dashboard polish | **Optional enhancement** | Current UUIDs remain precise audit identities; readable Persian state labels exist | Not a blocker unless separately specified accessibility/operational requirements are unmet; workflow UI/product. No new permissions or audit weakening |
| O02 list pagination/performance tuning | **Optional enhancement** | Existing nonpaged list reused; no production-scale SLO verified | Not a reason to redesign platform now. Product/operations must define required volumes before a capacity PASS; resource/security findings would cease to be optional |
| F01 procurement UI, treasury close and unrelated pricing integrations | **Requires explicit business-owner decision** | Separate owning modules/dependencies; user prohibits expanding this task. No approved deferral reference exists for the four open operation gates in24Z capability matrix | Outside present bounded execution, not declared implemented or approved future. D07/process owners must record disposition before claiming full shared-module scope |
| F02 operational bundle expansion | **Approved future scope** | Product Master D5 in approved TASK-21S target: catalogue-only now, operational sale/order/inventory semantics held until P5 | Not current approval implementation. Keep current prohibition; product/inventory owner owns later design. This is an actual approved restriction, not a model-created deferral |

No mandatory row can be converted to an optional enhancement simply because automation passes. M01–M04 are concrete remaining operator completion work, not demands to build procurement, treasury or a universal policy engine.

## 3. D01–D07 decision closure matrix

All **OPEN**, no authorized named signatory/decision reference received. The existing owner register contains alternatives and operational consequences. Actual individuals must be designated by product lead; role names here do not confer approval.

| ID / exact unresolved question | Affected capability | Authorized owner role | Recommendation (not approval) | Does it block current completion or dependent future work? |
|---|---|---|---|---|
| D01: What authoritative business object owns approval domain_id for sales/return/purchase, who maps/reassigns it, and what happens if unmapped? | Domain-policy selection/admin, domain-scoped substitution; future product-domain mapping must not simply reuse this UUID | Governance + relevant sales/procurement process owners; security approves ownership boundary | Explicit company-scoped domain registry/mapping if multiple dimensions are needed; choose branch only if owner explicitly confirms equivalence; no implicit mapping/backfill | Blocks domain authoring/operational domain enforcement, not existing record display or core company-only stages. Blocks Product Master domain rollout until identity/mapping agreed; a product-domain decision is related, not automatically identical |
| D02: Who computes risk, on which scale/version, with what inputs/freshness and recalculation/failure behavior? | Risk policy authoring/enforcement | Risk/compliance + process/product owner, operations for external provider | Trusted versioned server-derived score once factors/examples approved; no caller-trusted score | Dependent risk capability only, not base catalog/operator history. If promised now, D07 must retain it as mandatory; no implicit deferral |
| D03: Ordered stages only or distinct natural-person minimum; how count multi-role and delegated principals? | Quorum, stage/delegation authoring, staffing availability | Governance/compliance + finance/process owner | Hybrid stages plus owner-selected distinct-person minimum for designated high risk; preserve current stages until explicit decision | Blocks new distinct-person claims/configuration; existing ordered-stage behavior can stand only under explicit scope acceptance. Does not block descriptive Product Master work |
| D04: With both staff and role on a stage, union, intersection, or invalid dual assignment? | Chain administration, eligibility display/migration | Governance/product + IAM/security | Explicit assignment mode for new configs, owner-selected legacy interpretation; no silent migration | Blocks mixed-assignment authoring/semantic changes, not read-only historic rendering; legacy behavior is not retroactive approval |
| D05: Is explicit deny required, at what scopes/precedence, who revokes it, and what happens to in-flight requests? | Deny model/admin and consume-time reevaluation | Governance/compliance + security, operations runbook owner | If required, narrow central deny-overrides with audited emergency recovery, not universal policy language | Dependent deny capability only; inactive stays not-deny. Central product stop must be respected without inventing approval-policy deny semantics |
| D06: Self-only creator/requester candidates: reject submit, explicitly block/reassign or escalate; how does delegation count? | Operational availability and authorized substitution | Workflow process owner + IAM/security | Reject unfulfillable submissions with actionable diagnostics as first bounded step, after delegation accounting approved; keep decision-time recheck | Current full operational-completion blocker B01; does not block unrelated product aliases/attributes discovery or delivered history |
| D07: Is delivery a full shared approval operator/admin module or a named limited prerequisite; which consumer/admin capabilities must ship now? | Current exit boundary, M01–M04, scope of F01, next-module gate | Product/module lead + security/release approver | Explicitly accept or reject a limited core/operator prerequisite with listed omissions and downstream gates; otherwise complete mandatory admin/substitution before exit. No entire-platform expansion | **Always blocks declaration of current module complete** until signed decision. The user's bounded implementation instruction authorized that work, not an implicit waiver of missing capabilities |

The earliest full exit is: D07 named scope → applicable D01–D06 choices → mandatory in-scope implementation/permission alignment → focused changed-behavior evidence → independent review and visual gate → explicit module acceptance. Already-green suites need no blanket manual rerun.

## 4. Independent review and visual evidence

No Agent-2 report or submitted PR review available. Renewed read-only request:
https://github.com/Tadbir-Sabz/Green-DMS/pull/13#issuecomment-6739602529

| Required area | Agent-2 result |
|---|---|
| Tenant/RLS and same-company request/source/binding reads | UNVERIFIED |
| Authorization, including M04 least-privilege operator access | UNVERIFIED |
| Provenance/new-record snapshots versus legacy unknowns | UNVERIFIED |
| Resubmission/supersession and delegated actor attribution | UNVERIFIED |
|0059 migration/rollback, transaction/request/binding integrity| UNVERIFIED |

Agent-1's matrices and source observation M04 are not independent findings. No disagreement received is **not agreement**. Preserve any future finding with exact reviewed SHA, severity/file/line, reproduction, Agent-1 response and agreed/disputed/unresolved status; do not edit away reviewer disagreement. No independent agent dispatch capability exists in this session; a comment is a request, not an obtained assessment.

Existing screenshot retrieval attempted through supported `gh run download 42610341797 --name playwright-report --dir /tmp/exit-gate-existing-artifact`, exit1 signed Azure blob EOF. Artifact13670730844 exists (2,147,517bytes; metadata digest1600f5eb…fd7681). No rerun requested. **Manual visual/accessibility inspection remains UNVERIFIED.** Current accessible browser annotations classify expected wrong-password401 and its copied-attachment duplicate; no clean-console or retrospective older-artifact claim. Metadata/digests are not a locally downloaded checksum or visual evidence inspection.

## 5. Product Master start/stop boundary and next execution

See `TASK-PM-01_PRODUCT_MASTER_SPEC.md` for domain model, per-domain availability, governance, APIs/persistence, authorization/audit and acceptance cases.

**Immediate next task:** TASK-24Z-EXIT-DECISIONS — obtain named D07 scope acceptance and IAM M04 read-authority choice; assign Agent-2 and provide accessible existing screenshots; obtain dependent decisions for mandatory authoring/substitution. This is a bounded gate-resolution task, not another repetitive QA cycle.

**Next business implementation candidate:** TASK-PM-01 domain availability foundation (design/contract first, no live enforcement until its decisions/gates below). Product Master is the canonical next business module, not a roadmap reorder. It is not authorized for runtime rollout by this document.

Can continue independently now: Product Master code/schema/API inventory, proposed additive contracts, fixtures/acceptance specifications and nondependent design work. Existing attributes/variants/UOM/catalog code must be reused, not recreated. These activities do not imply current-module exit or authorize new domain business rules.

Before dependent Product Master implementation proceeds:
1. Current module accepted with explicit full/restricted boundary, mandatory in-scope permission/management gaps resolved or expressly scoped out by authorized owner (not by this agent).
2. Independent security/transaction review and visual gate received/resolved, or explicit authorized gate disposition; no assumed approval.
3. Product/domain owners select domain identity/membership, legacy rollout, local autonomy, sensitive-change approval mapping and authorized actors. Respect approved D1–D5 and the newly explicit per-domain availability rule.
4. Confirm bounded additive contract/migration plan and target tests. G03 automated tests are green, but this **does not prove Product Master sensitive changes are already wired**: current product-sensitivity.ts still documents/enforces the explicit-confirmation fallback. Design the actual integration before claiming approval governance.

There is no claim that D02 risk, D03 quorum or D05 deny must be implemented merely to read catalog attributes. Only real dependencies should block their own capability. Conversely, independent implementation is not a license to bypass canonical one-module-at-a-time completion.
