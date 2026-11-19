// S8-07 (R5): تطابقِ ایستای manifest با ماتریسِ اسکریپت. هر مورد manifest باید در اسکریپت ثبت شود،
// و هر ثبتِ literal در اسکریپت باید در manifest باشد. (تکرار در اجرا را evaluateWindowResults می‌سنجد.)
// اجرا: node --test scripts/lib/window-manifest.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseExpectedCases } from './window-results.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifest = parseExpectedCases(readFileSync(path.join(ROOT, 'scripts', 'window-expected-cases.txt'), 'utf8'));
const script = readFileSync(path.join(ROOT, 'scripts', 'test-migration-window.sh'), 'utf8');
const recorded = new Set([...script.matchAll(/\brecord\s+([A-Za-z]\d-[A-Za-z0-9-]+)\s+(?:PASS|FAIL|UNVERIFIED)\b/g)].map((m) => m[1]));

test('R5: every manifest case is recorded by the matrix script', () => {
  const missing = manifest.filter((c) => !recorded.has(c));
  assert.deepEqual(missing, []);
});

test('R5: every literal record in the script is a manifest case (no unknown IDs)', () => {
  const unknown = [...recorded].filter((c) => !manifest.includes(c));
  assert.deepEqual(unknown, []);
});

test('R5: manifest has no duplicate IDs', () => {
  assert.equal(new Set(manifest).size, manifest.length);
});

test('R6: the fault-hook cases are present in the manifest', () => {
  for (const c of ['W5-revoke-transient-retried', 'W5-revoke-persistent-window-open', 'W6-grant-check-failure-revokes', 'D4-exit-code-3-preserved', 'W5-hook-disabled-without-ack']) {
    assert.ok(manifest.includes(c), c);
  }
});

test('R4: the P1/P2 cases use PID-based waits (no pg_stat_activity liveness for the child)', () => {
  const p1 = script.slice(script.indexOf('# ---------- P1'), script.indexOf('# ---------- P2'));
  assert.match(p1, /wait_pid_gone "\$cpid8"/);
  assert.doesNotMatch(p1.split('\n').filter((l) => /wait_pid_gone|pid_alive/.test(l)).join('\n'), /pg_stat_activity/);
  const p2 = script.slice(script.indexOf('# ---------- P2'), script.indexOf('# ---------- R1'));
  assert.match(p2, /kill -TERM "\$pid9"/);
  assert.match(p2, /wait_pid_gone "\$cpid9"/);
});

test('R4: P1 window-state is no longer accepted as either open or closed', () => {
  const p1 = script.slice(script.indexOf('# ---------- P1'), script.indexOf('# ---------- P2'));
  const stateLine = p1.split('\n').find((l) => l.includes('record P1-window-state-after-parent-kill PASS'));
  assert.ok(stateLine, 'open-state PASS line must exist');
  assert.doesNotMatch(p1, /record P1-window-state-after-parent-kill PASS "پنجره بسته/);
});

test('R4: the window-pid helper is shared, not duplicated in the matrix script', () => {
  assert.match(script, /source "\$ROOT\/scripts\/lib\/window-pid\.sh"/);
  assert.doesNotMatch(script, /^pid_alive\(\) \{/m);
});
