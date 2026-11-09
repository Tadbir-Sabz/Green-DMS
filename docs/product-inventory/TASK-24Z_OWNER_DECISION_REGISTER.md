# TASK-24Z final gate — owner decision register

All entries below are **OPEN / proposed, not approved**. A recommendation is not an executable rule or an approved deferral. Owners are accountable roles, not invented named assignees. Product lead must nominate the actual decision makers. Existing D1–D5 Product Master approvals remain unchanged.

## D01 — authoritative approval domain (P3)
- **Question:** What business object owns `domain_id` for sales order, return and purchase order: branch, department, business unit, or an explicit approval domain? Who assigns it and may change it?
- **Why:** The current UUID has no authoritative operational mapping; pure composition tests do not prove business ownership or domain delegation.
- **Alternatives:** A: branch; B: department/business unit; C: explicit company-scoped approval-domain registry with mappings; D: documented central-only operation until mapping is implemented (requires explicit restricted-scope approval).
- **Consequences:** A is simple but equates organizational location with governance; B needs authoritative organizational data and transfer rules; C adds administration, mapping validation and migration; D leaves domain policies unavailable, not silently ignored.
- **Recommendation:** C if multiple organizational dimensions are needed; require an entity-by-operation mapping table and signed examples before implementation. Otherwise the owner may explicitly choose A. Never infer branch from a UUID.
- **Owner:** Product governance + sales/procurement process owners; security approves tenant/ownership enforcement.
- **Acceptance/implementation after decision:** Define mapping, missing-domain failure, reassignment lifecycle, delegation scope, immutable snapshot and migration/backfill rules; add public API cross-company tests.

## D02 — risk authority and lifecycle (P4)
- **Question:** Who computes approval risk, on what scale/version, from which data, and when must it be recalculated?
- **Why:** Internal optional fields are not an authoritative production risk input; thresholds cannot safely be advertised as enforced.
- **Alternatives:** A: trusted server-derived versioned score; B: signed external risk provider; C: authorized manual assessment with audit; D: explicitly out-of-scope risk gating for this module.
- **Consequences:** A requires approved factors, determinism and missing-input handling; B adds availability/privacy/retry dependencies; C adds override/SoD abuse risk; D cannot claim risk-based governance and requires owner-approved scope limitation.
- **Recommendation:** A where business factors can be defined, with versioned inputs and reevaluation before consumption; never accept an untrusted caller score. Do not invent factors, weights or fail-open behavior.
- **Owner:** Risk/compliance + product/process owners; security and operations for provider/failure policy.
- **Acceptance:** Approved examples, scale, freshness/expiry, changed-risk invalidation and provider failure behavior.

## D03 — stages versus distinct-person quorum (P5a)
- **Question:** Does each operation require ordered stage completion only, or N distinct natural persons? May one person holding multiple roles satisfy several stages? How is a delegated principal counted?
- **Why:** Stage count is not unique-person count; silently changing it can create either governance bypasses or impossible workflows.
- **Alternatives:** A: existing ordered stages; B: distinct-person quorum per operation/chain; C: hybrid stage completion plus distinct-person minimum.
- **Consequences:** A preserves current behavior but is not two-person control; B/C need identity equivalence, delegation accounting, shortage detection and configuration migration. Historic decisions must not be rewritten.
- **Recommendation:** C for explicitly designated high-risk operations, with natural-person identity and delegation counting defined by owner. Retain existing stage semantics until approved; no numerical quorum is invented here.
- **Owner:** Governance/compliance + finance and purchasing/sales process owners.
- **Acceptance:** Concrete multi-role/delegation examples, count rules, shortage/escalation policy and immutable-history transition.

## D04 — role and staff assignment (P5b)
- **Question:** When a stage contains both staff and role IDs, is the eligible set their union, their intersection, or is dual assignment invalid?
- **Why:** OR versus AND changes who can approve and whether a stage is reachable.
- **Alternatives:** A: OR (current behavior); B: AND; C: reject dual assignment and require an explicit assignment mode.
- **Consequences:** A can authorize more people than expected; B can deadlock after staffing changes; C needs schema/DTO/UI validation and migration of existing mixed stages.
- **Recommendation:** C for new configuration, with explicit owner-selected interpretation of legacy rows; no automatic reinterpretation. Display the eligible-set semantics in administration and decision provenance.
- **Owner:** Governance/product + IAM/security owner.
- **Acceptance:** Legacy configuration inventory, intended mixed-stage examples, revocation/lock behavior and migration decision.

## D05 — explicit deny policy (P6)
- **Question:** Is an explicit deny required; at which scopes; does it override permits and composed mandatory stages; who may create/revoke it and how does it affect in-flight requests?
- **Why:** `is_active=false` means inactive, not deny. There is no deny schema/DTO or owner-approved precedence.
- **Alternatives:** A: no deny capability, explicitly approved limitation; B: central deny-overrides; C: scoped deny with explicit precedence/exception rules.
- **Consequences:** A cannot implement emergency prohibition; B adds a global blocking control with operational outage risk; C is more expressive but harder to explain/audit. B/C require transaction-time reevaluation and recovery semantics.
- **Recommendation:** B only if owner confirms the need, with tightly permissioned audited emergency revoke and in-flight rules; do not implement general policy language in PR13.
- **Owner:** Governance/compliance + security; operations owns emergency runbook.
- **Acceptance:** Conflict examples, precedence, expiry/revocation, in-flight consume behavior and audited operator recovery.

## D06 — self-only candidate and delegation availability (E3)
- **Question:** When creator/requester are the only candidates, reject submission immediately, allow audited waiting for delegation/reassignment, or escalate to an approved alternative?
- **Why:** Decision-time SoD fails closed, but a request may remain unfulfillable. Delegation must not become a self-approval loophole.
- **Alternatives:** A: reject if no independently eligible candidate; B: explicit blocked state and controlled reassignment; C: approved escalation chain, never allow-all fallback.
- **Consequences:** A is easiest to explain but can block legitimate work; B needs administration, expiry and notifications; C requires owner-defined authority and audit. All require consistent submission/inbox/decision-time candidate evaluation.
- **Recommendation:** A with actionable Persian diagnostics as the bounded first increment, subject to approved delegation accounting; B/C only in a separate designed change. Keep decision-time recheck regardless.
- **Owner:** Workflow process owner + IAM/security; operations for staffing/escalation.
- **Acceptance:** Direct/delegated creator/requester cases, stale candidate races, no residual binding on failure, no weakened SoD.

## D07 — module boundary approval (U1 and four open operation gates)
- **Question:** Does the current delivery contract require all shared approval administration/provenance now, or a named limited approval prerequisite? Which operation integrations belong to later modules?
- **Why:** Roadmap requires coherent completion; moving missing requirements to another module is not an approved deferral. PR13 must not become an entire-platform build.
- **Alternatives:** A: complete bounded approval core/operator journeys before closure; B: explicitly approve restricted prerequisite scope with tracked follow-up gates; C: expand into all consumer modules (not recommended).
- **Consequences:** A delays closure but preserves module completion standard; B needs signed limitations and downstream block list; C increases financial/security regression surface and breaks sequencing.
- **Recommendation:** A for current approval provenance/decision/operator essentials; separate consumer-specific purchase/pricing/treasury UI and integrations by owning module. The module matrix is a proposal, not a roadmap change or a deferral approval.
- **Owner:** Product lead/module owner + security/release gate approver.
- **Acceptance:** Approve matrix row dispositions, exact release scope, required Persian help and browser journeys; do not mark the whole platform complete.

## Decision recording protocol

For each ID record actual owner identity, chosen alternative, exact semantics/examples, rationale, approval reference/date, affected module and migration/test obligations. Until then keep OPEN. A scope-only decision does not satisfy independent security review. Roadmap phase reorder proposals remain proposals; this register does not approve them.

## Operator implementation update (no owner decision inferred)

Bounded operator implementation at b451d2b does not resolve D01–D07. The new
`TASK-24Z_OPERATOR_POLICY_DEPENDENCIES.md` maps each to concrete code/UI boundaries.
Read-only policy/source/identity visibility and lifecycle tracking did not require
inventing the decisions. Full configuration publishing and new delegation authoring
are not claimed implemented or approved deferred. D07 still needs explicit acceptance
of the delivered slice; product/module lead must name the accountable decision owners.
