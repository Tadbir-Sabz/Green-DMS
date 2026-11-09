# TASK-24Z-R — actual browser execution

Baseline: `2b872f8d4330e02c95caa5b37d1fa7d2b10c0170`, clean synchronized
worktree, PR #13 OPEN. No merge/deployment or production/shared-service changes.

## Reproducible isolated environment

GitHub workflow `.github/workflows/e2e.yml` uses ephemeral project name
`browser-${run_id}-${run_attempt}` and fresh compose volumes, masked per-run JWT,
PostgreSQL/runtime passwords and S3 access/secret keys. Cleanup is `down -v` on
that project only. Production compose files are unchanged.

Browser-only override `e2e/compose.browser.yml` pins
`adobe/s3mock:3.9.1@sha256:7514ca2abb1fa85ee45fbefcede03632c822a8d96883a45b900c98fdeb21a48a`.
This is a reproducible S3-compatible test source already proven by the earlier CI
round-trip. It is **not** a claim that Adobe s3mock is MinIO or a production
storage replacement. Actual MinIO image registries remain inaccessible.

```sh
# Set unique project and strong disposable secrets, exactly as the CI generator.
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  -f e2e/compose.browser.yml build
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  -f e2e/compose.browser.yml up -d --no-build
# Wait for API /api/health and web /login. These are explicit workflow gates.
npm run test:e2e
```

Real application: production-mode API under non-superuser runtime identity,
production web build and same-origin API proxy, PostgreSQL/PostGIS and Redis.
No API mocks or raw-SQL constructed business approval bindings in browser tests.

## Preserved execution history

| Run / head | Outcome | Classification / corrective action |
|---|---|---|
| Original 42576653175 / 2b872f8 | Exit 1, zero browser tests | Registry blocker: quay.io MinIO 401 and Docker Hub access denied. Preserved previous evidence, not reclassified PASS. |
| 42585459274 / 387e1c6 | Pinned S3 image pull succeeds; compose startup fails before browser | Test environment supplied forbidden default storage credentials to production config; generate masked disposable keys, keep security validation enabled. |
| 42585893897 / 9687e3f | **Actual Playwright execution**, exit 1: 2 passed, 3 failed, 8 did not run | Login RTL/form tests passed. Two onboarding tests resolved a leading-slash URL outside `/api/v1`; corrected test URL, retained assertions. Correct API onboarding then exposed a genuine PL/pgSQL ambiguity, not an infrastructure failure. |

First actual execution artifact:
https://github.com/Tadbir-Sabz/Green-DMS/actions/runs/42585893897/artifacts/13658449185
Artifact SHA256 `7e0b1c29aa3093a7549eeb02da5034fde208552246e6b77eddd068848ef23744`.
Exact test/API failure annotations: `evidence/task24z-closure/browser-first-execution.txt`.

Migration 0056 repairs ambiguous conflict targets with named constraints,
retains SECURITY DEFINER/pinned search_path/ACL, and guarantees the existing
contract that a new administrator receives CEO even if a custom template lacks
that role. It does not change financial calculations or relax tenant policies.
Runtime-role regression control: 66/66 DB privilege tests, including real function
execution and CEO assignment (sandbox qualification retained).

## Captured browser evidence and limitations

Automatic fixture attaches final screenshots, console messages, uncaught page
errors, failed request paths and HTTP error status/path to each page test. The fixture JSON does not capture
headers/request bodies; bearer/JWT console text is redacted. Playwright traces
can contain disposable test credentials and network headers; they are not
sanitized production evidence. The entire isolated stack is destroyed afterward. Assertions are
unchanged in existing workflows. Desktop 1440 and mobile 390 login checks assert
RTL, visible inputs, no horizontal viewport overflow and rejection of empty form.
Authenticated inbox checks add screenshots at both widths after actual login.

Expected negative-control HTTP 401 responses are diagnostic events, not
unexpected network outages. Detailed traces, videos on failure and screenshots
are uploaded with the HTML report. New evidence metadata includes test exit code,
head SHA and screenshot checksums; structured Playwright JSON records retries.
New artifacts retain 90 days (earlier artifacts retain their original policy).

The local sandbox cannot download Azure-hosted GitHub artifact blobs (redirect
ends in EOF); Agent-1 does not claim manual visual inspection of screenshots it
could not open. Reviewers can download the linked artifacts directly from GitHub.
Automated RTL/responsiveness assertions are not a full visual/accessibility audit.
Full approval-chain, delegated-decision and policy-management browser coverage
remains a separate explicit gap, not proven by an empty inbox screenshot.

## Second actual execution and runtime defects

Run https://github.com/Tadbir-Sabz/Green-DMS/actions/runs/42586524608
on `f21e883`: **4 passed, 1 failed, 8 did not run**, exit 1. Onboarding,
login and desktop/mobile form checks now execute successfully. Portal login
fails with an actual `portal_session` RLS violation. Browser/API diagnostics
also expose BI customer aggregate grouping error under runtime security views.
Preserved annotations: `browser-second-execution.txt`.

Corrective implementation (no assertions weakened):
- After verified password/account lookup, portal session writes run within an
  isolated company context. Live-session guard lookup is scoped by signed JWT
  company and verifies company/customer equality. Portal handler context is not
  a staff identity, and remains limited by company + customer predicates.
- Refresh lookup uses a minimal SECURITY DEFINER capability, fixed search_path,
  EXECUTE only for dms_app, no caller-supplied company. Migration 0057 changes
  no existing session/history rows. New browser refresh/replay/logout assertions
  and runtime-role metadata/cross-company controls cover this path.
- Migration 0058 makes a missing/empty staff user scope evaluate false rather
  than attempting to cast an empty UUID. It does not add permissions, alter the
  company policy or broaden the existing scope predicate. Reproduced before
  fix in a dedicated runtime-role test (`empty-scope-before-fix.txt`).
- BI GROUP BY now explicitly includes `p.legal_name`, avoiding ambiguity with
  a security-view column named `name`. No SUM/rounding/status financial semantics
  changed. Runtime query regression control added.
- Interceptor cleanup uses the existing verified discard-on-failure primitive
  instead of returning a connection with uncertain tenant GUCs to the pool.
  Two fault-injection unit tests verify fail-closed setup and cleanup.

Final executable head for the next browser validation: `4b4efdc`.

## Third actual execution: all tests reached, responsive defect exposed

Run https://github.com/Tadbir-Sabz/Green-DMS/actions/runs/42587702705
on `00e13953361e8f81f16be010916a0b04771ec977`: **13 passed, 1 failed,
0 unexecuted**, 15.7s, exit 1; responsive failure repeats on both retries.
Portal session issuance, audience rejection, customer identity isolation,
invalid-password rejection, invoice reads, refresh/replay/logout and BI page
all pass. Approval inbox page loads but fails document horizontal overflow
assertion. This is a confirmed UI defect, not an infrastructure issue.
`a651288` contains off-canvas navigation overflow and makes the inbox table a
local horizontal scroller with shrinkable grid cells. Assertion remains intact.
AppShell regression suite: 5/5 exit 0; E2E typecheck exit 0.

Artifact 13660161210 (1,628,460 bytes),
SHA256 `399bc071b019cfdc2394e163880b2f75766fcba761e9ad8fdbbbd5397cadbbaf`.
Run f21e883 artifact 13659811014 (37,383 bytes),
SHA256 `efd2d2797bae002a16e71a030d47f69f90d829d551447853982e64ca83b83855`.

**Evidence collection correction:** third-run metadata says three screenshots
and zero diagnostic files: inline Playwright attachments were not filesystem
files scanned by the metadata script. Its zero error counters therefore are
NOT evidence of zero browser errors. `a651288` explicitly persists screenshots
and event JSON before attaching them; next run must demonstrate nonempty
collection. Historical metadata is retained, not retroactively corrected.

Native CI at 00e1395: run 42587702614 all five jobs SUCCESS, including native
Postgres runtime isolation, real MinIO attachment round trip, static checks,
unit suite and credential hygiene. This does not substitute for final-head
browser or independent review.

## Final executable-head validation

Executable SHA: **a651288cafb51b374ff2831ef2e6970d7b19a35c**.
Run https://github.com/Tadbir-Sabz/Green-DMS/actions/runs/42588296845:
**14/14 PASS, 0 skipped, 0 unexecuted**, 9.8s, process exit 0.
Desktop/mobile approval inbox overflow assertion now passes unchanged.
Artifacts: https://github.com/Tadbir-Sabz/Green-DMS/actions/runs/42588296845/artifacts/13659734454
(2,014,636 bytes), SHA256
`78e9670b1ec006357d8ae043539f465068a86f8467415cbdaefc1209cf8bdcb5`;
90-day configured retention. `browser-results.json`, `browser-evidence.json`,
screenshots, event JSON and HTML report are included in the artifact.
CI metadata reports 28 PNG paths and 28 diagnostic JSON paths; these include
original files plus Playwright's attachment copies, **not 28 distinct tests**.
Counters: **2 console errors, 0 page errors, 0 failed requests, 0 HTTP 5xx**.
Counters may duplicate events through copied attachments. The console errors
are not classified as harmless: artifact download via signed blob still fails
with EOF in this restricted sandbox. Their exact content and independent visual
inspection remain **UNVERIFIED**, owned by browser reviewer/CI-artifact access
owner. Do not interpret a green assertion run as a clean-console/full UX audit.

Native CI 42588296901: all five jobs SUCCESS. Migration workflow 42588296886:
SUCCESS. Release-image workflow 42588296839: SUCCESS. No independent review received (PR reviews list empty).

**Browser assertions: PASS WITH FINDINGS. Release closure: NOT READY.**
Open policy decisions, missing full workflow/admin UI coverage and independent
review remain in the closure matrix. Documentation-only commits after this
executable SHA do not change the tested source; their automatic checks must be
reported separately, not assumed green.
