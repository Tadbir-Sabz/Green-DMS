// S8-07 (R5): دروازهٔ نتایجِ ماتریسِ پنجره، fail-closed. هیچ «غیبت»، «تکرار»، یا «UNVERIFIED» به PASS تبدیل نمی‌شود.
// اجرا: node --test scripts/lib/window-results.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { evaluateWindowResults, parseExpectedCases } from './window-results.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFEST = parseExpectedCases(readFileSync(path.join(ROOT, 'scripts', 'window-expected-cases.txt'), 'utf8'));
const line = (c, s = 'PASS') => JSON.stringify({ case: c, status: s, detail: 'x' });
const allPass = (cases = MANIFEST) => cases.map((c) => line(c)).join('\n');

test('R5: manifest has 29 unique cases and includes the hook-disabled case', () => {
  assert.equal(MANIFEST.length, 29);
  assert.equal(new Set(MANIFEST).size, MANIFEST.length);
  assert.ok(MANIFEST.includes('W5-hook-disabled-without-ack'));
});

test('R5: all expected cases PASS ⇒ PASS (exit 0)', () => {
  const r = evaluateWindowResults(allPass(), MANIFEST);
  assert.equal(r.verdict, 'PASS');
  assert.equal(r.exitCode, 0);
});

test('R5: a missing results file is FAIL, never PASS', () => {
  assert.equal(evaluateWindowResults(null, MANIFEST).verdict, 'FAIL');
});

test('R5: an empty results file is FAIL, never PASS', () => {
  assert.equal(evaluateWindowResults('', MANIFEST).verdict, 'FAIL');
  assert.equal(evaluateWindowResults('\n\n', MANIFEST).verdict, 'FAIL');
});

test('R5: an empty or unusable manifest is FAIL', () => {
  assert.equal(evaluateWindowResults(allPass(), []).verdict, 'FAIL');
  assert.equal(evaluateWindowResults(allPass(), null).verdict, 'FAIL');
});

test('R5: a single missing expected case is FAIL', () => {
  const lines = MANIFEST.slice(1).map((c) => line(c));
  const r = evaluateWindowResults(lines.join('\n'), MANIFEST);
  assert.equal(r.verdict, 'FAIL');
  assert.ok(r.problems.some((p) => p.includes(MANIFEST[0]) && p.includes('وجود ندارد')));
});

test('R5: a duplicate record is FAIL even when all statuses are PASS', () => {
  const text = allPass() + '\n' + line(MANIFEST[0]);
  const r = evaluateWindowResults(text, MANIFEST);
  assert.equal(r.verdict, 'FAIL');
  assert.ok(r.problems.some((p) => p.includes('تکراری')));
});

test('R5: an unknown case ID is FAIL', () => {
  const r = evaluateWindowResults(allPass() + '\n' + line('W9-made-up'), MANIFEST);
  assert.equal(r.verdict, 'FAIL');
  assert.ok(r.problems.some((p) => p.includes('خارج از manifest')));
});

test('R5: an unknown status is FAIL', () => {
  const lines = MANIFEST.map((c, i) => line(c, i === 0 ? 'SKIP' : 'PASS'));
  assert.equal(evaluateWindowResults(lines.join('\n'), MANIFEST).verdict, 'FAIL');
});

test('R5: any FAIL dominates', () => {
  const lines = MANIFEST.map((c, i) => line(c, i === 3 ? 'FAIL' : 'PASS'));
  assert.equal(evaluateWindowResults(lines.join('\n'), MANIFEST).verdict, 'FAIL');
});

test('R5: UNVERIFIED without FAIL ⇒ UNVERIFIED with exit code 2 (never PASS)', () => {
  const lines = MANIFEST.map((c, i) => line(c, i === 5 ? 'UNVERIFIED' : 'PASS'));
  const r = evaluateWindowResults(lines.join('\n'), MANIFEST);
  assert.equal(r.verdict, 'UNVERIFIED');
  assert.equal(r.exitCode, 2);
  assert.deepEqual(r.unverified, [MANIFEST[5]]);
});

test('R5: a non-JSON line is FAIL', () => {
  assert.equal(evaluateWindowResults(allPass() + '\nnot json', MANIFEST).verdict, 'FAIL');
});

test('R5: a record without a case field is FAIL', () => {
  assert.equal(evaluateWindowResults(allPass() + '\n' + JSON.stringify({ status: 'PASS' }), MANIFEST).verdict, 'FAIL');
});
