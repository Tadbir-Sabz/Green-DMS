/**
 * ارزیابیِ نتایجِ آزمون‌های پنجرهٔ مهاجرت (S8-07 / R5) — fail-closed.
 *
 * ورودی: متنِ results.jsonl (یا null اگر فایل نیست) و فهرستِ موارد مورد انتظار (manifest).
 * قواعد:
 *   - فایلِ غایب، خالی، یا خطِ JSON نامعتبر ⇒ FAIL
 *   - رکوردِ بدون case/status معتبر، یا status ناشناخته ⇒ FAIL
 *   - مورد تکراری ⇒ FAIL
 *   - مورد مورد‌انتظارِ گم‌شده ⇒ FAIL؛ موردِ ناشناخته (خارج از manifest) ⇒ FAIL
 *   - هر FAIL ⇒ FAIL
 *   - بدونِ FAIL و با حداقل یک UNVERIFIED ⇒ UNVERIFIED (کد خروج 2)
 *   - همه PASS ⇒ PASS (کد خروج 0)
 * هیچ‌وقت «skip» یا فایلِ خالی به PASS تبدیل نمی‌شود.
 */

export const WINDOW_STATUSES = Object.freeze(['PASS', 'FAIL', 'UNVERIFIED']);

/** خواندنِ manifest: خطوطِ غیرخالی و غیرکامنت (#). */
export function parseExpectedCases(text) {
  return String(text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

export function evaluateWindowResults(text, expectedCases) {
  const problems = [];
  const unverified = [];
  const counts = { PASS: 0, FAIL: 0, UNVERIFIED: 0 };
  const finish = (verdict) => ({
    verdict,
    exitCode: verdict === 'PASS' ? 0 : verdict === 'UNVERIFIED' ? 2 : 1,
    problems,
    unverified,
    counts,
  });

  if (!Array.isArray(expectedCases) || expectedCases.length === 0) {
    problems.push('manifest موارد مورد انتظار خالی یا نامعتبر است');
    return finish('FAIL');
  }
  if (text === null || text === undefined) {
    problems.push('results.jsonl وجود ندارد');
    return finish('FAIL');
  }
  const lines = String(text).split('\n').filter((l) => l.trim());
  if (lines.length === 0) {
    problems.push('results.jsonl خالی است');
    return finish('FAIL');
  }

  const expected = new Set(expectedCases);
  const seen = new Set();
  lines.forEach((line, i) => {
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      problems.push(`خطِ ${i + 1} JSON معتبر نیست`);
      return;
    }
    if (!rec || typeof rec !== 'object' || typeof rec.case !== 'string' || rec.case === '') {
      problems.push(`خطِ ${i + 1}: فیلد case معتبر ندارد`);
      return;
    }
    if (!WINDOW_STATUSES.includes(rec.status)) {
      problems.push(`${rec.case}: status ناشناخته «${rec.status}»`);
      return;
    }
    if (seen.has(rec.case)) {
      problems.push(`${rec.case}: رکورد تکراری`);
      return;
    }
    seen.add(rec.case);
    if (!expected.has(rec.case)) {
      problems.push(`${rec.case}: مورد خارج از manifest`);
      return;
    }
    counts[rec.status] += 1;
    if (rec.status === 'FAIL') problems.push(`${rec.case}: FAIL`);
    if (rec.status === 'UNVERIFIED') unverified.push(rec.case);
  });

  for (const c of expectedCases) {
    if (!seen.has(c)) problems.push(`${c}: رکورد مورد انتظار وجود ندارد`);
  }

  if (problems.length > 0 || counts.FAIL > 0) return finish('FAIL');
  if (unverified.length > 0) return finish('UNVERIFIED');
  return finish('PASS');
}
