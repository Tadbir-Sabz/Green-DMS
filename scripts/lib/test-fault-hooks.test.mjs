// S8-07 (R6): قلاب‌های آزمایشی فقط در محیط آزمون، هرگز پیش‌فرض، هرگز در production یا با هویت زمانِ اجرا.
// اجرا: node --test scripts/lib/test-fault-hooks.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOOK_ACK, faultHooksEnabled, parseFaultSpec, createFaultInjector } from './test-fault-hooks.mjs';

const ENV_OK = { DMS_TEST_HOOKS: HOOK_ACK };

test('R6: disabled by default (no environment)', () => {
  assert.equal(faultHooksEnabled({ env: {}, currentUser: 'postgres' }).enabled, false);
});

test('R6: wrong or partial acknowledgement does not enable hooks', () => {
  for (const v of ['1', 'true', 'yes', 'I-UNDERSTAND', HOOK_ACK.toLowerCase(), ` ${HOOK_ACK}`]) {
    assert.equal(faultHooksEnabled({ env: { DMS_TEST_HOOKS: v }, currentUser: 'postgres' }).enabled, false, v);
  }
});

test('R6: production never enables hooks, even with the acknowledgement', () => {
  const g = faultHooksEnabled({ env: { ...ENV_OK, NODE_ENV: 'production' }, currentUser: 'postgres' });
  assert.equal(g.enabled, false);
  assert.match(g.reason, /production/);
});

test('R6: every runtime and maintenance identity is refused, even with the acknowledgement', () => {
  for (const role of ['dms_app', 'dms_readonly', 'dms_maintainer', 'dms_owner', 'dms_migrator']) {
    assert.equal(faultHooksEnabled({ env: ENV_OK, currentUser: role }).enabled, false, role);
  }
});

test('R6: unknown current user fails closed', () => {
  assert.equal(faultHooksEnabled({ env: ENV_OK, currentUser: '' }).enabled, false);
  assert.equal(faultHooksEnabled({ env: ENV_OK, currentUser: undefined }).enabled, false);
});

test('R6: test-only admin identity with the acknowledgement is the only enabling case', () => {
  assert.deepEqual(faultHooksEnabled({ env: ENV_OK, currentUser: 'postgres' }), { enabled: true, reason: null });
});

test('R6: malformed fault specs are rejected (fail-closed), unknown points too', () => {
  assert.throws(() => parseFaultSpec('revoke'));
  assert.throws(() => parseFaultSpec('revoke:0'));
  assert.throws(() => parseFaultSpec('revoke:many'));
  assert.throws(() => parseFaultSpec('drop-table:1'));
  assert.equal(parseFaultSpec(undefined), null);
  assert.deepEqual(parseFaultSpec('revoke:1'), { point: 'revoke', count: 1 });
  assert.deepEqual(parseFaultSpec('grant-check:always'), { point: 'grant-check', count: 'always' });
});

test('R6: disabled injector never hits, regardless of spec', () => {
  const inj = createFaultInjector({ enabled: false, spec: 'revoke:always' });
  assert.equal(inj.active, false);
  assert.equal(inj.hit('revoke'), false);
});

test('R6: enabled injector fails exactly the first n calls at the named point only', () => {
  const inj = createFaultInjector({ enabled: true, spec: 'revoke:2' });
  assert.equal(inj.hit('grant-check'), false);
  assert.equal(inj.hit('revoke'), true);
  assert.equal(inj.hit('revoke'), true);
  assert.equal(inj.hit('revoke'), false);
});

test('R6: always mode keeps failing', () => {
  const inj = createFaultInjector({ enabled: true, spec: 'revoke:always' });
  for (let i = 0; i < 5; i += 1) assert.equal(inj.hit('revoke'), true);
});

test('R6: an enabled injector with a malformed spec throws instead of silently passing', () => {
  assert.throws(() => createFaultInjector({ enabled: true, spec: 'revoke:x' }));
});
