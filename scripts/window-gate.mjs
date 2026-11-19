#!/usr/bin/env node
/**
 * دروازهٔ [9/9] (S8-07 / R5): ارزیابیِ results.jsonl پنجرهٔ مهاجرت در برابر manifest موارد مورد انتظار.
 *
 *   node scripts/window-gate.mjs <results.jsonl> <expected-cases.txt>
 *
 * کد خروج: 0 = PASS، 1 = FAIL (شامل فایلِ غایب/خالی/نامعتبر)، 2 = UNVERIFIED.
 */
import { existsSync, readFileSync } from 'node:fs';
import { evaluateWindowResults, parseExpectedCases } from './lib/window-results.mjs';

const [resultsPath, expectedPath] = process.argv.slice(2);
if (!resultsPath || !expectedPath) {
  console.error('روش مصرف: node scripts/window-gate.mjs <results.jsonl> <expected-cases.txt>');
  process.exit(1);
}

const expectedText = existsSync(expectedPath) ? readFileSync(expectedPath, 'utf8') : null;
const expected = expectedText === null ? [] : parseExpectedCases(expectedText);
const resultsText = existsSync(resultsPath) ? readFileSync(resultsPath, 'utf8') : null;

const out = evaluateWindowResults(resultsText, expected);
if (expectedText === null) out.problems.unshift(`manifest یافت نشد: ${expectedPath}`);
console.log(
  JSON.stringify({
    gate: 'window-matrix',
    verdict: out.verdict,
    counts: out.counts,
    expected: expected.length,
    unverified: out.unverified,
    problems: out.problems,
  }),
);
process.exit(expectedText === null ? 1 : out.exitCode);
