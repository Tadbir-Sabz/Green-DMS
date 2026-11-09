# Operator closure — policy dependency map

Input: remote/PR `330504730bb992432cfa6e3ae5eb43c0fce7fa26`, all five CI jobs, E2E, migration and release checks SUCCESS before implementation. Source commits: 8951720 → bffdc4c → 5cbf3cf → b451d2b (final verified executable). D01–D07 register remains OPEN. No alternative has been silently approved.

| Decision | Actual implementation dependency | Independently implementable / delivered | Explicit boundary, not invented behavior |
|---|---|---|---|
| D01 authoritative domain | Domain-policy selection, mapping ownership, domain-scoped delegation creation | Persist/display actual selected policy IDs, scopes and source chains; historical decisions and actor IDs | No branch/department mapping assumed; no domain editor or inferred domain shown as authoritative |
| D02 risk source | Risk calculation, thresholds and recalculation lifecycle | Read-only inspection of configured risk threshold; record actual policy inputs | No score calculator/input or claim of operational risk enforcement |
| D03 distinct-person quorum | Different-person counting and delegated principal equivalence | Render ordered stage snapshot and persisted decisions exactly; preserve repeated stages | Stage count is not described as number of unique people; no new quorum or deduplication rule |
| D04 role/staff semantics | Mixed assignment editing and migration of existing configurations | Display both configured IDs and actual decision identity; server retains current semantics | No new OR/AND selector or reinterpretation; read-only configuration oversight |
| D05 explicit deny | Deny representation, precedence, in-flight invalidation | Display active/inactive as stored; central-policy control unchanged | Inactive never described as deny; no deny UI/schema introduced |
| D06 self-only candidate availability | Submit-time candidate exclusion/escalation and delegation/SoD accounting | Inbox remains server authoritative; errors shown, decisions and delegated_from visible; existing revoke retained | No allow-all fallback, invented substitute or new delegation creation route/UI. Decision-time SoD and checks unchanged. Self-only submit availability remains open |
| D07 approved module boundary | Whether complete creation/publish/admin tooling is required for this delivery vs prerequisite scope | User explicitly authorized bounded operator implementation: register/detail/provenance/status/lifecycle visibility and read-only oversight delivered without pausing for unrelated decisions | User authorization does not decide D01–D06 or approve roadmap reorder/deferrals. Config authoring and full delegation management remain separately gated, not labelled complete |

## Deliberate architecture choices

- Reads reuse existing `rules-engine` routes and permissions (`rules.view` for record/oversight; `rules.approval.decide` for decisions). No new service bypass, public endpoint, identity impersonation, procurement/treasury/pricing module implementation or weakened server guard.
- `GET /rules-engine/approvals/:id` first checks request company via chain ownership, then returns persisted chain steps and stored decision metadata. Binding subquery also filters company. Cross-company 404 is explicitly asserted.
- The register projects `superseded_at` as “جایگزین شده”; it does not rewrite stored request status or old decisions. This is a display filter, not a new business state machine.
- 0059 adds nullable JSON provenance to approval_request. New submission persists matched policy inputs and source chains **inside the existing request/binding transaction**. No current policy reconstruction/backfill for old records. Effective snapshot stages remain the source for decisions; source-chain provenance does not add authority.
- Snapshot field is written at creation; no new update route. Native/independent review still must assess all existing DB authority boundaries. No assertion of a new database-wide immutability guarantee for JSON is made.
- Rollback drops only the added field (its new provenance is lost on down), preserves requests, decisions and stage snapshots; re-up leaves old provenance NULL. Regression test asserts these exact consequences; do not claim evidence survives dropping its column.
- Existing HTTP initiation/decision/resubmission boundaries are preserved; the browser reference fixture seeds only a product category in the workflow's explicitly disposable `browser-<run>-<attempt>` stack. Product/order/policy/request/decision workflows use public APIs; no fabricated approval bindings.
