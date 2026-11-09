# TASK-24Z-R — policy / eligibility closure matrix

Baseline `2b872f8d4330e02c95caa5b37d1fa7d2b10c0170`, clean and synchronized,
PR #13 OPEN. This is Agent-1's implementation investigation, **not Agent-2's
independent review**. No business decisions or deferrals are presumed approved.

| ID | Finding and evidence | Classification | Disposition | Owner / remaining blocker |
|---|---|---|---|---|
| P1 | Generic request accepted caller-supplied amount for thresholds (`submitForApproval`) | Confirmed implementation defect | FIXED: persisted amount only; CLOSE-P1 HTTP test proves caller amount=1 cannot remove >=500 stage | Agent-1; independent verification Agent-2 |
| E1 | Role/staff assigned but no usable same-company approver: workflow could be created and hang | Confirmed implementation defect | FIXED: verify candidates in company, unlocked, access enabled and decision permission; 409 with stage number before request/binding creation; CLOSE-E1 | Agent-1; independent verification Agent-2 |
| E2 | Document creator could decide if another actor submitted it (requester-only SoD) | Confirmed implementation defect | FIXED: fetch actual creator for sales/purchase/return decisions; missing creator fails closed; creator is denied independently of requester; CLOSE-E2 | Agent-1; independent verification Agent-2 |
| P2 | All matching central/domain/operation contributions must survive runtime persistence | Previously confirmed implementation defect | Prior snapshot implementation retained; NC-C2 public HTTP/concurrent execution control retained | Agent-2 verify; no new winner-selection rule |
| P3 | `domain_id` is an untyped UUID, not mapped to business ownership in the three entity SQL queries | Missing business mapping AND technical integration | OPEN: cannot safely invent that domain equals branch/company/department. Existing pure domain composition tests do not establish operational domain ownership | Product/governance owner specifies authoritative mapping; Agent-1 implements afterward |
| P4 | Risk score source, authority, scale and recalculation lifecycle are not defined for these operations | Missing business decision and technical evidence | OPEN: generic HTTP DTO does not expose risk/domain, but internal optional fields exist; no claim of risk enforcement | Product/risk owner, then Agent-1 |
| P5 | Distinct-person quorum versus repeated stage approval; role/staff OR versus AND semantics | Missing business decision | OPEN: current executable model is ordered stages; repeated roles are preserved within chains. Do not silently turn stage count into unique-person count or change OR semantics | Product/governance owner must specify quorum and assignment semantics |
| P6 | Explicit deny policy is not represented in schema/DTO; disabled central policy is already prohibited | Missing business decision + capability not implemented | OPEN: `is_active=false` is NOT deny. No invented deny precedence or migration; no evidence of approved deferral | Product/governance owner, then Agent-1 |
| E3 | Candidate set contains only document creator/requester | Enforcement works at decision, missing submission-time availability feedback | OPEN UX/availability finding: decision fails closed, but submission can still be made. Excluding all self candidates at submission also needs delegation/SoD candidate treatment; no allow-all fallback | Agent-1 with Agent-2 security review |
| E4 | Delegation validity/revocation/company/domain and SoD at decision time | Existing enforced capability | NC-D2/D3/D4 retained. Lack of authoritative domain mapping limits claims about operational domain delegation | Agent-2 independent review, product owner for P3 |
| L1 | Rejected/returned/expired/materially changed document resubmission | Previously repaired implementation | R1–R4 retain closed decisions and supersede bindings; new decisions required. No reopening or history deletion | Agent-2 review |
| T1 | Decision insert / request transition and binding consume / business transition rollback | Previously repaired implementation | R5/R6 and NC-C2 concurrency/fault tests retained; no transaction-boundary weakening | Agent-2 review |
| U1 | Complete chain provenance, delegation identity, policy administration, purchase-order browser page | Missing UI implementation/evidence, NOT an approved deferral | OPEN; this browser run must not be misrepresented as proof of missing screens | Agent-1 UI owner and independent accessibility reviewer |
| T2 | Tenant interceptor returned a connection even if tenant cleanup failed | Confirmed implementation defect | FIXED using existing releaseTenantClient; setup/cleanup failure tests destroy connection | Agent-1; Agent-2 independently verify |
| I1 | Agent-2 review | Missing independent evidence | Requested in PR while implementation proceeds; no independent agent tool/reviewer report available to Agent-1 | Agent-2 / review coordinator |

## Focused validation

`DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres PSQL=/tmp/pgshim/psql NODE_ENV=test npx vitest run --root apps/api test/task24z-approval-lifecycle.api.test.ts test/rules-engine-behavior.test.ts test/task24y-approval-engine.api.test.ts test/pricing-engine.api.test.ts`

Exit 0, **146/146** (44 lifecycle, 27 behavior, 27 legacy approval, 48 pricing).
Sandbox limitations from R1 still apply; real PostgreSQL CI must validate the
new implementation SHA. Unrelated already-passing suites are not manually rerun
without reason. GitHub automatic checks may rerun due to PR synchronization.

## Browser/native closure update

Executable head `a651288cafb51b374ff2831ef2e6970d7b19a35c` has real browser
14/14 PASS (0 skipped) and native CI all five jobs PASS, migration PASS.
Confirmed onboarding conflict, portal RLS, BI grouping and responsive overflow
defects are fixed; see browser execution report for immutable failure/run IDs.
Browser counters include two console-error occurrences (possibly copied
attachments); contents/visual artifact inspection are UNVERIFIED because blob
artifact retrieval is blocked here. Owner: browser reviewer/artifact-access
owner. No clean-console claim. This does not close U1 or independent review I1.

**Closure verdict: NOT READY** while OPEN rows remain. This matrix does not
claim owner approval, an approved deferral, independent review, or release readiness.
