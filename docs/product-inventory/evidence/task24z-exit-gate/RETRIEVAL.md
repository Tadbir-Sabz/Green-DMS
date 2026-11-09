# Existing evidence retrieval — no tests rerun

Input HEAD55f354871549f09b91cf1b437f0e70b8a9bd2906, browser42610341797,
artifact13670730844, playwright-report,2,147,517bytes, not expired at query.
GitHub metadata digest:
sha256:1600f5eba6aec2c03eeba22db78b95f481dbc68fd50aed23e2ef9a24e1fd7681

Command:
`gh run download 42610341797 --name playwright-report --dir /tmp/exit-gate-existing-artifact`
Result: exit1, signed download redirected to productionresultssa11.blob.core.windows.net,
GET failed with EOF. Signed query credentials are deliberately not preserved.
No valid downloaded archive, extraction, recomputed digest or visual inspection.
No test rerun requested to recreate screenshots. Manual visual/accessibility review:
UNVERIFIED. Existing screenshot attachment names are in the operator screenshot
manifest; current artifact has its own report containing the same test journeys.

Actual accessible annotation evidence:15passed14.5s, exit0,30PNG paths/30diagnostic
paths (including attachment copies),2console error occurrences,0pageerrors,
10request-failure occurrences,0HTTP5xx. Passed fixture rejects transport failures
except net::ERR_ABORTED; counts alone do not establish distinct requests.

Console annotations provide actual message/path evidence, not a screenshot review:
- Wrong-password rejection test, original browser-events.json:401Unauthorized —
  Expected browser behavior for the explicit negative control.
- Same message in that test's attachments/browser-events-...json copy —
  Test instrumentation duplication.
No clean-console claim. Older inaccessible runs are not retroactively classified.
