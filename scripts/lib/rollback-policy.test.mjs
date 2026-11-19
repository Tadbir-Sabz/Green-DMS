// S8-07 (R1, R2, R8, R9): آزمون‌های ایستای مسیرهای بازگشت و مالکیت. بدونِ پایگاه‌داده.
// اجرا: node --test scripts/lib/rollback-policy.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ROLLBACK_REFUSED, rollbackRefusal, unsafeDefinerBodies, requiresOwnerWindow } from './migration-policy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const MIG = path.join(ROOT, 'migrations');
const downs = readdirSync(MIG).filter((f) => f.endsWith('.down.sql')).sort();
const ups = readdirSync(MIG).filter((f) => f.endsWith('.up.sql')).sort();
const migrate = read('scripts/migrate.mjs');
const testMig = read('scripts/test-migrations.mjs');
const dbWindow = read('scripts/db-window.mjs');

// R1 ---------------------------------------------------------------
test('R1: every down file that restores an unsafe SECURITY DEFINER body is in ROLLBACK_REFUSED', () => {
  const offenders = [];
  for (const f of downs) {
    const bad = unsafeDefinerBodies(readFileSync(path.join(MIG, f), 'utf8'));
    const version = f.slice(0, 4);
    if (bad.length && !ROLLBACK_REFUSED[version]) offenders.push(`${f}: ${bad.map((b) => b.name).join(',')}`);
  }
  assert.deepEqual(offenders, []);
});

test('R1: the 0072 down is refused by policy and still flagged by the static scan (regression anchor)', () => {
  const v = '0072';
  assert.ok(ROLLBACK_REFUSED[v]);
  assert.ok(unsafeDefinerBodies(readFileSync(path.join(MIG, '0072_security_remediation_s8_06.down.sql'), 'utf8')).length > 0);
  assert.equal(rollbackRefusal('0070'), null, '0070 down itself must stay available to the runner');
});

test('R1: migrate.mjs cmdDown checks rollbackRefusal BEFORE reading or running any down SQL', () => {
  const body = migrate.slice(migrate.indexOf('async function cmdDown'));
  const refusalAt = body.indexOf('rollbackRefusal(rec.version)');
  const readAt = body.indexOf('readFile(mig.down');
  const ownerAt = body.indexOf('assertOwnerWindow(');
  assert.ok(refusalAt > 0, 'refusal call present in cmdDown');
  assert.ok(readAt > refusalAt, 'down SQL is read only after the refusal check');
  assert.ok(ownerAt > refusalAt, 'owner window check comes after the refusal');
  assert.match(body.slice(refusalAt, refusalAt + 400), /process\.exit\(1\)/);
});

test('R1: db-window rollback delegates to the same runner (no second, unchecked path)', () => {
  assert.match(dbWindow, /runMigrate\(adminUrl, \['down', steps\]\)/);
  assert.doesNotMatch(dbWindow, /readFile\([^)]*\.down\.sql/);
  assert.doesNotMatch(dbWindow, /\bclient\.query\(sql\)/);
});

test('R1: test-migrations.mjs never executes a refused down file', () => {
  assert.match(testMig, /rollbackRefusal\(m\.version\)/);
  assert.match(testMig, /m\.version < refusedAt\.version/);
  assert.match(testMig, /const downable = refusedAt/);
});

test('R1: test-migrations.mjs round-trip does not run down for versions at or above the refusal', () => {
  const block = testMig.slice(testMig.indexOf('// ---- ب)'), testMig.indexOf('// ---- پ)'));
  assert.match(block, /for \(const mig of \[\.\.\.downable\]\.reverse\(\)\)/);
  assert.doesNotMatch(block, /for \(const mig of \[\.\.\.migrations\]\.reverse\(\)\)/);
});

// R2 / R9 -----------------------------------------------------------
test('R2: cmdUp and cmdDown both run assertOwnerWindow (external lock for up AND down)', () => {
  const up = migrate.slice(migrate.indexOf('async function cmdUp'), migrate.indexOf('async function cmdDown'));
  const down = migrate.slice(migrate.indexOf('async function cmdDown'));
  assert.match(up, /assertOwnerWindow\(/);
  assert.match(down, /assertOwnerWindow\(/);
});

test('R2: assertOwnerWindow consults callerRefusal and windowDecision', () => {
  const fn = migrate.slice(migrate.indexOf('async function assertOwnerWindow'), migrate.indexOf('async function cmdUp'));
  assert.match(fn, /callerRefusal\(/);
  assert.match(fn, /windowDecision\(/);
});

test('R2: owner-requiring classification covers 0041, 0070, 0071, 0072 (up)', () => {
  for (const f of ['0041_db_privileges.up.sql', '0070_inventory_ledger_owner_separation.up.sql', '0071_audit_location_partition_maintenance.up.sql', '0072_security_remediation_s8_06.up.sql']) {
    assert.equal(requiresOwnerWindow(readFileSync(path.join(MIG, f), 'utf8')), true, f);
  }
});

test('R9: cmdUp refuses a pending migration that has no down file (checksum v2 needs both)', () => {
  const up = migrate.slice(migrate.indexOf('async function cmdUp'), migrate.indexOf('async function cmdDown'));
  assert.match(up, /if \(!mig\.down\) throw new Error/);
});

test('R9: every migration in the repo has both up and down files', () => {
  const upN = new Set(ups.map((f) => f.slice(0, 4)));
  const downN = new Set(downs.map((f) => f.slice(0, 4)));
  assert.deepEqual([...upN].filter((v) => !downN.has(v)), []);
});

// R8 ----------------------------------------------------------------
test('R8: only 0070 transfers ownership to dms_owner; audit_log/location_sample are never transferred (model C)', () => {
  const transfers = ups.filter((f) => /owner\s+to\s+dms_owner/i.test(readFileSync(path.join(MIG, f), 'utf8')));
  assert.deepEqual(transfers, ['0070_inventory_ledger_owner_separation.up.sql']);
  for (const f of ups) {
    const sql = readFileSync(path.join(MIG, f), 'utf8');
    assert.doesNotMatch(sql, /alter\s+table\s+(public\.)?(audit_log|location_sample)[^;]*owner\s+to/i, f);
  }
});

test('R10: migration count in the repo is 72 up and 72 down', () => {
  assert.equal(ups.length, 72);
  assert.equal(downs.length, 72);
});

// R2 (قفل و فراخوان) — ساختار اجرایی ----------------------------------
const autoMigrate = read('apps/api/src/database/auto-migrate.ts');
const sliceFn = (src, start, end) => src.slice(src.indexOf(start), end ? src.indexOf(end, src.indexOf(start) + 1) : undefined);

test('R2: every migrate.mjs command (up, down, reset) runs under the dms-migrate session lock', () => {
  for (const c of ['cmdUp', 'cmdDown', 'cmdReset']) assert.match(migrate, new RegExp(`withMigrationLock\\(\\(\\) => ${c}\\(`), c);
  assert.match(migrate, /pg_try_advisory_lock\(hashtext\('dms-migrate'\)\)/);
});

test('R2: db-window up, rollback, and recover hold the dms-db-window lock around their work', () => {
  const up = sliceFn(dbWindow, 'async function cmdUp', 'function cmdBackup');
  const rb = sliceFn(dbWindow, 'async function cmdRollback', 'async function cmdGrantOrRevoke');
  const rc = sliceFn(dbWindow, 'async function cmdRecover', 'async function cmdVerify');
  assert.match(up, /withAdvisoryLock\(admin/);
  assert.match(rb, /withAdvisoryLock\(admin/);
  assert.match(rc, /withAdvisoryLock\(admin/);
});

test('R2 regression: bootstrap runs the owner-requiring 0041 migration only while holding the window lock', () => {
  const bs = sliceFn(dbWindow, 'async function cmdBootstrap', 'async function cmdUp');
  const call = bs.indexOf("runMigrate(adminUrl, ['up', '--to', '0041'])");
  assert.ok(call > 0, 'bootstrap migrate-to-0041 call present');
  assert.match(bs.slice(Math.max(0, call - 120), call), /withAdvisoryLock\(admin, \(\) => /);
});

test('R2: assertOwnerWindow runs for up and down with the caller policy', () => {
  assert.match(sliceFn(migrate, 'async function cmdUp', 'async function cmdDown'), /assertOwnerWindow\(/);
  assert.match(sliceFn(migrate, 'async function cmdDown'), /assertOwnerWindow\(/);
});

test('R2: the API auto-apply child is tagged api-auto (the only caller refused for owner migrations)', () => {
  assert.match(autoMigrate, /DMS_MIGRATE_CALLER: 'api-auto'/);
  assert.match(migrate, /callerRefusal\(\{ caller: process\.env\.DMS_MIGRATE_CALLER \?\? 'operator'/);
});

// R9 (checksum) — wiring -------------------------------------------------
test('R9: up records a v2 checksum; verification reads both stored and file hashes through verifyChecksum', () => {
  assert.match(migrate, /checksumRecord\(await hashesOf\(mig\)\)/);
  const uses = migrate.match(/verifyChecksum\(rec\.checksum, await hashesOf\(mig\)\)/g) ?? [];
  assert.ok(uses.length >= 3, `expected checksum verification on status/up/down paths, found ${uses.length}`);
});

test('R9: cmdUp refuses a pending migration without a down file (v2 checksum needs both hashes)', () => {
  assert.match(migrate, /if \(!mig\.down\) throw new Error/);
});
