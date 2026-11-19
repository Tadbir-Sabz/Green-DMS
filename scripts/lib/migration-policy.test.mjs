// S8-07 (R1, R2, R9): آزمون‌های بدونِ پایگاه‌داده برای سیاستِ مهاجرت.
// اجرا: node --test scripts/lib/migration-policy.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  ROLLBACK_REFUSED, rollbackRefusal, unsafeDefinerBodies, requiresOwnerWindow,
  windowDecision, callerRefusal, checksumRecord, parseChecksum, verifyChecksum,
} from './migration-policy.mjs';

const h = (s) => createHash('sha256').update(s).digest('hex');
const UP = h('up-body');
const DOWN = h('down-body');
const UP2 = h('up-body-EDITED');
const DOWN2 = h('down-body-EDITED');

// ---- R1: بازگشتِ ردشده ----
test('R1: 0072 rollback is refused; earlier versions are not', () => {
  assert.ok(ROLLBACK_REFUSED['0072'], '0072 must be in ROLLBACK_REFUSED');
  assert.match(rollbackRefusal('0072'), /0072|D1|pg_temp|search_path/);
  assert.equal(rollbackRefusal('0071'), null);
  assert.equal(rollbackRefusal('0041'), null);
});

test('R1: unsafe SECURITY DEFINER body without pg_temp is flagged; pinned body is not', () => {
  const unsafe = `create or replace function f_x(p integer) returns void language plpgsql
security definer set search_path = pg_catalog, public as $$ begin end $$;`;
  const pinned = `create or replace function f_x(p integer) returns void language plpgsql
security definer set search_path = pg_catalog, public, pg_temp as $$ begin end $$;`;
  const invoker = `create or replace function f_x(p integer) returns void language plpgsql
as $$ begin end $$;`;
  assert.equal(unsafeDefinerBodies(unsafe).length, 1);
  assert.equal(unsafeDefinerBodies(pinned).length, 0);
  assert.equal(unsafeDefinerBodies(invoker).length, 0);
});

test('R1: commented-out definer text does not count as a body', () => {
  const commented = `-- security definer set search_path = pg_catalog, public
select 1;`;
  assert.equal(unsafeDefinerBodies(commented).length, 0);
});

// ---- R2: قفل پنجره و محدودیتِ فراخوان ----
test('R2: owner-requiring detection (dms_owner token outside comments)', () => {
  assert.equal(requiresOwnerWindow("create role dms_owner nologin;"), true);
  assert.equal(requiresOwnerWindow("-- dms_owner only in comment\nselect 1;"), false);
  assert.equal(requiresOwnerWindow("create table t (id int);"), false);
});

test('R2: owner migration refused without an external window lock', () => {
  assert.match(windowDecision({ ownLocks: 0, externalHolders: 0, requiresOwner: true }), /dms-db-window/);
});

test('R2: own-session lock never counts as the external window', () => {
  assert.match(windowDecision({ ownLocks: 1, externalHolders: 0, requiresOwner: true }), /خودش/);
  assert.match(windowDecision({ ownLocks: 1, externalHolders: 0, requiresOwner: true }), /نشست/);
});

test('R2: external holder allows owner migration; non-owner migrations are never blocked', () => {
  assert.equal(windowDecision({ ownLocks: 0, externalHolders: 1, requiresOwner: true }), null);
  assert.equal(windowDecision({ ownLocks: 0, externalHolders: 0, requiresOwner: false }), null);
});

test('R2: invalid lock readings fail closed', () => {
  assert.match(windowDecision({ ownLocks: NaN, externalHolders: 1, requiresOwner: true }), /fail-closed|ناتمام/);
  assert.match(windowDecision({ ownLocks: 0, externalHolders: undefined, requiresOwner: true }), /fail-closed|ناتمام/);
});

test('R2: api-auto is refused for owner migrations even with an external lock', () => {
  assert.match(callerRefusal({ caller: 'api-auto', requiresOwner: true }), /API/);
  assert.equal(callerRefusal({ caller: 'api-auto', requiresOwner: false }), null);
  assert.equal(callerRefusal({ caller: 'db-window', requiresOwner: true }), null);
  assert.equal(callerRefusal({ caller: 'operator', requiresOwner: true }), null);
});

// ---- R9: checksum v2 (up+down) و سازگاری با ردیف‌های قدیمی ----
test('R9: checksumRecord builds v2 and rejects non-sha256 input', () => {
  assert.equal(checksumRecord({ upHash: UP, downHash: DOWN }), `v2:${UP}:${DOWN}`);
  assert.throws(() => checksumRecord({ upHash: 'abc', downHash: DOWN }));
  assert.throws(() => checksumRecord({ upHash: UP, downHash: undefined }));
});

test('R9: parseChecksum classifies legacy, v2, and malformed rows', () => {
  assert.equal(parseChecksum(UP).kind, 'legacy');
  assert.equal(parseChecksum(`v2:${UP}:${DOWN}`).kind, 'v2');
  assert.equal(parseChecksum('v1:whatever').kind, 'malformed');
  assert.equal(parseChecksum(null).kind, 'malformed');
  assert.equal(parseChecksum(`v2:${UP}`).kind, 'malformed');
});

test('R9: v2 row passes only when up AND down both match', () => {
  const row = `v2:${UP}:${DOWN}`;
  assert.deepEqual(pick(verifyChecksum(row, { upHash: UP, downHash: DOWN })), { ok: true, state: 'ok' });
});

test('R9: up drift is detected on v2 rows', () => {
  const v = verifyChecksum(`v2:${UP}:${DOWN}`, { upHash: UP2, downHash: DOWN });
  assert.equal(v.ok, false);
  assert.equal(v.state, 'up-drift');
});

test('R9: down drift is detected on v2 rows (edited down file cannot slip through)', () => {
  const v = verifyChecksum(`v2:${UP}:${DOWN}`, { upHash: UP, downHash: DOWN2 });
  assert.equal(v.ok, false);
  assert.equal(v.state, 'down-drift');
});

test('R9: missing down file on a v2 row is a failure, not a pass', () => {
  const v = verifyChecksum(`v2:${UP}:${DOWN}`, { upHash: UP, downHash: null });
  assert.equal(v.ok, false);
  assert.equal(v.state, 'missing-down');
});

test('R9 legacy: 64-hex row verifies up only and is never re-interpreted', () => {
  const ok = verifyChecksum(UP, { upHash: UP, downHash: DOWN2 });
  assert.equal(ok.ok, true);
  assert.equal(ok.state, 'legacy-up-ok');
  const drift = verifyChecksum(UP, { upHash: UP2, downHash: DOWN });
  assert.equal(drift.ok, false);
  assert.equal(drift.state, 'up-drift');
});

test('R9 legacy: a legacy row with a missing down file still verifies (down was never recorded)', () => {
  const v = verifyChecksum(UP, { upHash: UP, downHash: null });
  assert.equal(v.ok, true);
});

test('R9: malformed row fails closed', () => {
  assert.equal(verifyChecksum('garbage', { upHash: UP, downHash: DOWN }).ok, false);
});

function pick(v) { return { ok: v.ok, state: v.state }; }
