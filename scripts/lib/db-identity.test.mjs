// S8-06: آزمون‌های بدونِ پایگاه‌داده برای منطقِ مقایسهٔ هویت (fail-closed).
// اجرا: node --test scripts/lib/db-identity.test.mjs
// این آزمون‌ها PostgreSQL را نمی‌آزمایند؛ فقط تضمین می‌کنند که گزارشِ ناقص/مبهم/مغایر شکست می‌خورد.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLE, expectationsFor, collectIdentityProblems } from './db-identity.mjs';

// گزارشِ «سالمِ» dms_app مطابقِ قواعدِ expectationsFor
const cleanApp = {
  isSuper: false,
  bypassRls: false,
  canLogin: true,
  ownedRelations: 0,
  ownedFunctions: 0,
  directMemberOfOwner: false,
  indirectMemberOfOwner: false,
  canSetOwner: false,
  directMemberOfMaintainer: false,
  indirectMemberOfMaintainer: false,
};

const cleanOwner = { isSuper: false, bypassRls: false, canLogin: false, ownedRelations: 3, ownedFunctions: 1 };

const cleanMaintainer = {
  isSuper: false,
  bypassRls: false,
  canLogin: true,
  ownedRelations: 0,
  ownedFunctions: 0,
  directMemberOfOwner: false,
  indirectMemberOfOwner: false,
  canSetOwner: false,
};

test('نقشِ غایب ⇒ مغایرت (fail-closed)', () => {
  const p = collectIdentityProblems(ROLE.app, undefined);
  assert.equal(p.length, 1);
  assert.match(p[0], /وجود ندارد/);
});

test('dms_app سالم ⇒ بدون مغایرت', () => {
  assert.deepEqual(collectIdentityProblems(ROLE.app, cleanApp), []);
});

test('عضویتِ غیرمستقیم dms_app در dms_owner ⇒ مغایرت', () => {
  const p = collectIdentityProblems(ROLE.app, { ...cleanApp, indirectMemberOfOwner: true });
  assert.ok(p.some((x) => x.includes('indirectMemberOfOwner=true')), p.join('|'));
});

test('dms_app قادر به SET روی dms_owner ⇒ مغایرت', () => {
  const p = collectIdentityProblems(ROLE.app, { ...cleanApp, canSetOwner: true });
  assert.ok(p.some((x) => x.includes('canSetOwner=true')), p.join('|'));
});

test('dms_app با BYPASSRLS یا ابرکاربر ⇒ مغایرت', () => {
  assert.ok(collectIdentityProblems(ROLE.app, { ...cleanApp, bypassRls: true }).length > 0);
  assert.ok(collectIdentityProblems(ROLE.app, { ...cleanApp, isSuper: true }).length > 0);
});

test('کلیدِ غایبِ گزارش ⇒ مغایرت (نه سکوتِ موفق)', () => {
  const partial = { ...cleanApp };
  delete partial.canSetOwner;
  const p = collectIdentityProblems(ROLE.app, partial);
  assert.ok(p.some((x) => x.includes('canSetOwner=undefined')), p.join('|'));
});

test('dms_owner باید NOLOGIN باشد', () => {
  assert.deepEqual(collectIdentityProblems(ROLE.owner, cleanOwner), []);
  const p = collectIdentityProblems(ROLE.owner, { ...cleanOwner, canLogin: true });
  assert.ok(p.some((x) => x.includes('NOLOGIN')), p.join('|'));
});

test('dms_maintainer عضوِ dms_owner نباید باشد', () => {
  assert.deepEqual(collectIdentityProblems(ROLE.maintainer, cleanMaintainer), []);
  const p = collectIdentityProblems(ROLE.maintainer, { ...cleanMaintainer, directMemberOfOwner: true });
  assert.ok(p.some((x) => x.includes('directMemberOfOwner=true')), p.join('|'));
});

test('dms_migrator: بیرون از پنجره هیچ SET/عضویت مجاز نیست', () => {
  const closed = { isSuper: false, bypassRls: false, canLogin: true, directMemberOfOwner: false, indirectMemberOfOwner: false, canSetOwner: true };
  const p = collectIdentityProblems(ROLE.migrator, closed, { windowOpen: false });
  assert.ok(p.some((x) => x.includes('canSetOwner=true')), p.join('|'));
});

test('dms_migrator: در پنجره SET مجاز است (انتظارها باز می‌شوند)', () => {
  const open = { isSuper: false, bypassRls: false, canLogin: true, directMemberOfOwner: true, indirectMemberOfOwner: true, canSetOwner: true };
  assert.deepEqual(collectIdentityProblems(ROLE.migrator, open, { windowOpen: true }), []);
  assert.equal(expectationsFor(ROLE.migrator, { windowOpen: true }).canSetOwner, 'any');
  assert.equal(expectationsFor(ROLE.migrator, { windowOpen: false }).canSetOwner, false);
});

test('نقشِ ناشناخته ⇒ خطا (نه مغایرتِ خاموش)', () => {
  assert.throws(() => expectationsFor('dms_unknown'), /ناشناخته/);
});
