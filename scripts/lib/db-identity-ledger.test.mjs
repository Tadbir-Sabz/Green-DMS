// S8-07 (R3): آزمون‌های بدونِ پایگاه‌داده برای ledgerProblems / databaseProblems.
// یک کلاینتِ ساختگی، پاسخ‌های کاتالوگ را بر پایهٔ متنِ کوئری برمی‌گرداند. هر حالتِ نادرست باید مغایرت بدهد.
// اجرا: node --test scripts/lib/db-identity-ledger.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ledgerProblems, databaseProblems, PINNED_SEARCH_PATH } from './db-identity.mjs';

const CLEAN_ROLE = {
  is_super: false, bypass_rls: false, can_login: false, can_create_role: false,
  owned_relations: 0, owned_functions: 0, direct_member_of_owner: false, indirect_member_of_owner: false,
  can_set_owner: false, direct_member_of_maintainer: false, indirect_member_of_maintainer: false,
};

// وضعِ سالم: 0041/0070/0071/0072 اعمال شده، هر چیز درست
function healthy() {
  const part = (name, owner, parentOwner, extra = {}) => ({
    name, owner, parent_owner: parentOwner, rls_enabled: true, forced: true, guards: 0,
    has_policy: true, app_writes: false, ro_writes: false, maint_writes: false, ...extra,
  });
  return {
    ledger: ['0041', '0068', '0069', '0070', '0071', '0072'],
    objects: { inv_fn: true, audit_fn: true, loc_fn: true, inv_cfg: [PINNED_SEARCH_PATH] },
    tables: {
      'public.inventory_txn': [part('inventory_txn', 'dms_owner', 'dms_owner', { guards: 2 }),
        part('inventory_txn_2026_01', 'dms_owner', 'dms_owner', { guards: 2 })],
      'public.audit_log': [part('audit_log', 'dms_migrator', 'dms_migrator')],
      'public.location_sample': [part('location_sample', 'dms_migrator', 'dms_migrator')],
    },
    funcs: {
      fn_maintain_inventory_partitions: [{ owner: 'dms_owner', definer: true, config: [PINNED_SEARCH_PATH], acl_default: false, public_exec: false, maint_exec: true, app_exec: false, ro_exec: false, want_owner: 'dms_owner' }],
      fn_maintain_audit_partitions: [{ owner: 'dms_migrator', definer: true, config: [PINNED_SEARCH_PATH], acl_default: false, public_exec: false, maint_exec: true, app_exec: false, ro_exec: false, want_owner: 'dms_migrator' }],
      fn_maintain_location_partitions: [{ owner: 'dms_migrator', definer: true, config: [PINNED_SEARCH_PATH], acl_default: false, public_exec: false, maint_exec: true, app_exec: false, ro_exec: false, want_owner: 'dms_migrator' }],
    },
    roles: { dms_readonly: { ...CLEAN_ROLE, name: 'dms_readonly', can_login: true } },
    ledgerMode: 'ok', // ok | unreadable
    schemaPrivs: { app: false, ro: false, maint: false },
  };
}

// کلاینتِ ساختگی: پاسخ را بر پایهٔ الگوی متنِ کوئری انتخاب می‌کند
function client(st) {
  return {
    async query(sql, params = []) {
      if (sql.includes('select version from schema_migrations')) {
        if (st.ledgerMode === 'unreadable') throw new Error('relation "schema_migrations" does not exist');
        return { rows: st.ledger.map((v) => ({ version: v })) };
      }
      if (sql.includes('to_regprocedure')) {
        return {
          rows: [{
            inv_fn: st.objects.inv_fn, audit_fn: st.objects.audit_fn, loc_fn: st.objects.loc_fn,
            inv_cfg: st.objects.inv_cfg ?? null,
          }],
        };
      }
      if (sql.includes('rls_enabled')) return { rows: st.tables[params[0]] ?? [] };
      if (sql.includes('prosecdef') || sql.includes('p.proname = $1')) {
        return { rows: (st.funcs[params[0]] ?? []).map((r) => ({ ...r })) };
      }
      if (sql.includes('r.rolname as name') || sql.includes('from pg_roles r')) {
        const r = st.roles[params[0]];
        if (!r) return { rows: [] };
        return { rows: [{ name: params[0], ...r }] };
      }
      if (sql.includes('public.schema_migrations') && sql.includes('has_table_privilege')) {
        return { rows: [{ app: st.schemaPrivs.app, ro: st.schemaPrivs.ro, maint: st.schemaPrivs.maint }] };
      }
      throw new Error(`fake client: unexpected query: ${sql.slice(0, 80)}`);
    },
  };
}

const problemsOf = (st, opts) => ledgerProblems(client(st), opts);
const has = (list, re) => list.some((p) => re.test(p));

test('R3 baseline: a fully healthy catalog has no problems', async () => {
  assert.deepEqual(await problemsOf(healthy()), []);
});

test('R3: unreadable or missing ledger is FAIL (fail-closed)', async () => {
  const st = healthy(); st.ledgerMode = 'unreadable';
  const p = await problemsOf(st);
  assert.ok(p.length > 0 && has(p, /fail-closed|وجود ندارد|خوانده/));
});

test('R3: empty ledger is never PASS, even with objects present', async () => {
  const st = healthy(); st.ledger = [];
  const p = await problemsOf(st);
  assert.ok(has(p, /خالی/));
});

test('R3: objects present but 0070 not recorded ⇒ problem (missing ledger row)', async () => {
  const st = healthy(); st.ledger = ['0041', '0068', '0069'];
  assert.ok(has(await problemsOf(st), /اشیای 0070 وجود دارند اما نسخهٔ 0070 ثبت نشده/));
});

test('R3: 0070 recorded but its objects are missing ⇒ problem (missing objects)', async () => {
  const st = healthy(); st.objects.inv_fn = false;
  assert.ok(has(await problemsOf(st), /اشیای 0070 وجود ندارند اما نسخهٔ 0070 ثبت شده/));
});

test('R3: only one 0071 wrapper missing ⇒ problem (no OR-masking)', async () => {
  const st = healthy(); st.objects.loc_fn = false;
  st.funcs.fn_maintain_location_partitions = [];
  const p = await problemsOf(st);
  assert.ok(has(p, /wrapperِ نگه‌داریِ موقعیت \(0071\)/));
});

test('R3: audit wrapper present but 0071 not recorded ⇒ problem', async () => {
  const st = healthy(); st.ledger = ['0041', '0068', '0069', '0070', '0072'];
  assert.ok(has(await problemsOf(st), /wrapperِ نگه‌داریِ ممیزی \(0071\)/));
});

test('R3: 0071 table missing (wrapper exists) ⇒ problem', async () => {
  const st = healthy(); delete st.tables['public.audit_log'];
  assert.ok(has(await problemsOf(st), /audit_log: جدول یا پارتیشنی یافت نشد/));
});

test('R3: inventory partition owned by the wrong role ⇒ problem', async () => {
  const st = healthy();
  st.tables['public.inventory_txn'][1].owner = 'dms_migrator';
  assert.ok(has(await problemsOf(st), /inventory_txn_2026_01: مالک «dms_migrator» است، انتظار مالکِ والد «dms_owner»/));
  assert.ok(has(await problemsOf(st), /مالکِ inventory_txn باید dms_owner باشد/));
});

test('R3: audit partition owner differs from its parent ⇒ problem', async () => {
  const st = healthy();
  st.tables['public.audit_log'][0].owner = 'dms_owner';
  assert.ok(has(await problemsOf(st), /مالک «dms_owner» است، انتظار مالکِ والد/));
});

test('R3: RLS not enabled or not forced ⇒ problem', async () => {
  const a = healthy(); a.tables['public.audit_log'][0].rls_enabled = false;
  assert.ok(has(await problemsOf(a), /RLS فعال نیست/));
  const b = healthy(); b.tables['public.audit_log'][0].forced = false;
  assert.ok(has(await problemsOf(b), /RLS اجباری \(FORCE\) نیست/));
});

test('R3: missing tenant policy ⇒ problem', async () => {
  const st = healthy(); st.tables['public.audit_log'][0].has_policy = false;
  assert.ok(has(await problemsOf(st), /سیاستِ p_audit_log_tenant وجود ندارد/));
});

test('R3: guard trigger count mismatch ⇒ problem (both directions)', async () => {
  const st = healthy(); st.tables['public.inventory_txn'][0].guards = 1;
  assert.ok(has(await problemsOf(st), /تریگرهای محافظ=1 \(انتظار 2\)/));
});

test('R3: dms_app retaining UPDATE/DELETE/TRUNCATE on audit_log ⇒ problem', async () => {
  const st = healthy(); st.tables['public.audit_log'][0].app_writes = true;
  assert.ok(has(await problemsOf(st), /dms_app هنوز UPDATE\/DELETE\/TRUNCATE دارد/));
});

test('R3: dms_app write on inventory is allowed by design, but readonly/maintainer write never is', async () => {
  const inv = healthy(); inv.tables['public.inventory_txn'][0].app_writes = true;
  assert.equal(has(await problemsOf(inv), /dms_app هنوز/), false);
  const ro = healthy(); ro.tables['public.inventory_txn'][0].ro_writes = true;
  assert.ok(has(await problemsOf(ro), /dms_readonly امتیازِ نوشتن روی دفتر/));
  const mt = healthy(); mt.tables['public.inventory_txn'][0].maint_writes = true;
  assert.ok(has(await problemsOf(mt), /dms_maintainer امتیازِ نوشتن روی دفتر/));
});

test('R3: wrong search_path on a wrapper after 0072 ⇒ problem', async () => {
  const st = healthy();
  st.funcs.fn_maintain_audit_partitions[0].config = ['search_path=pg_catalog, public'];
  assert.ok(has(await problemsOf(st), /fn_maintain_audit_partitions: proconfig=/));
});

test('R3: wrapper not SECURITY DEFINER ⇒ problem', async () => {
  const st = healthy(); st.funcs.fn_maintain_inventory_partitions[0].definer = false;
  assert.ok(has(await problemsOf(st), /SECURITY DEFINER نیست/));
});

test('R3: unexpected grants on wrapper (PUBLIC, NULL ACL, dms_app, dms_readonly, missing maintainer) ⇒ problems', async () => {
  const pub = healthy(); pub.funcs.fn_maintain_audit_partitions[0].public_exec = true;
  assert.ok(has(await problemsOf(pub), /PUBLIC هنوز EXECUTE/));
  const nul = healthy(); nul.funcs.fn_maintain_audit_partitions[0].acl_default = true;
  assert.ok(has(await problemsOf(nul), /PUBLIC هنوز EXECUTE/));
  const app = healthy(); app.funcs.fn_maintain_audit_partitions[0].app_exec = true;
  assert.ok(has(await problemsOf(app), /dms_app نباید EXECUTE/));
  const ro = healthy(); ro.funcs.fn_maintain_audit_partitions[0].ro_exec = true;
  assert.ok(has(await problemsOf(ro), /dms_readonly نباید EXECUTE/));
  const mt = healthy(); mt.funcs.fn_maintain_audit_partitions[0].maint_exec = false;
  assert.ok(has(await problemsOf(mt), /dms_maintainer EXECUTE ندارد/));
});

test('R3: wrapper owner must equal the table owner ⇒ problem', async () => {
  const st = healthy(); st.funcs.fn_maintain_audit_partitions[0].owner = 'dms_owner';
  assert.ok(has(await problemsOf(st), /fn_maintain_audit_partitions: مالک «dms_owner» است، انتظار «dms_migrator»/));
});

test('R3: wrapper with duplicate or missing definition ⇒ problem', async () => {
  const dup = healthy(); dup.funcs.fn_maintain_audit_partitions.push({ ...dup.funcs.fn_maintain_audit_partitions[0] });
  assert.ok(has(await problemsOf(dup), /باید دقیقاً یک تعریف داشته باشد \(یافت شد 2\)/));
  const none = healthy(); none.funcs.fn_maintain_audit_partitions = [];
  assert.ok(has(await problemsOf(none), /باید دقیقاً یک تعریف داشته باشد \(یافت شد 0\)/));
});

test('R3 / D1: 0070 applied without 0072 and unpinned ⇒ D1 problem; allowed only in the 0072 preflight', async () => {
  const st = healthy();
  st.ledger = ['0041', '0068', '0069', '0070', '0071'];
  st.objects.inv_cfg = null;
  st.funcs.fn_maintain_inventory_partitions[0].config = ['search_path=pg_catalog, public'];
  assert.ok(has(await problemsOf(st), /D1 باز/));
  assert.equal(has(await problemsOf(st, { pendingD1Fix: true }), /D1 باز/), false);
});

test('R3: after 0072 is recorded, an unpinned wrapper is never accepted, even with pendingD1Fix', async () => {
  const st = healthy();
  st.funcs.fn_maintain_inventory_partitions[0].config = ['search_path=pg_catalog, public'];
  st.objects.inv_cfg = null;
  assert.ok(has(await problemsOf(st, { pendingD1Fix: true }), /proconfig=/));
});

test('R3: pinned wrapper but 0072 not recorded ⇒ problem', async () => {
  const st = healthy(); st.ledger = ['0041', '0068', '0069', '0070', '0071'];
  assert.ok(has(await problemsOf(st), /wrapperِ 0070 پین‌شده است اما نسخهٔ 0072 ثبت نشده/));
});

test('R3: runtime/readonly identity privileges on schema_migrations after 0072 ⇒ problems', async () => {
  const app = healthy(); app.schemaPrivs.app = true;
  assert.ok(has(await problemsOf(app), /dms_app: به schema_migrations دسترسی دارد/));
  const ro = healthy(); ro.schemaPrivs.ro = true;
  assert.ok(has(await problemsOf(ro), /dms_readonly: به schema_migrations دسترسی دارد/));
  const mt = healthy(); mt.schemaPrivs.maint = true;
  assert.ok(has(await problemsOf(mt), /dms_maintainer: به schema_migrations دسترسی دارد/));
});

test('R3: readonly identity gaining membership in owner ⇒ problem; missing readonly role ⇒ problem', async () => {
  const mem = healthy(); mem.roles.dms_readonly.direct_member_of_owner = true;
  assert.ok(has(await problemsOf(mem), /dms_readonly: directMemberOfOwner=true/));
  const absent = healthy(); delete absent.roles.dms_readonly;
  assert.ok(has(await problemsOf(absent), /dms_readonly وجود ندارد/));
});

// ---- databaseProblems ----
function dbClient({ datacl, publicTemp, dbExists = true, roleTemp = {} }) {
  return {
    async query(sql, params = []) {
      if (sql.includes('aclexplode(d.datacl)')) {
        if (!dbExists) return { rows: [] };
        return { rows: [{ public_temp: publicTemp, db: 'greendms' }] };
      }
      if (sql.includes('has_database_privilege')) return { rows: [{ has_temp: roleTemp[params[0]] === true }] };
      throw new Error(`db fake: unexpected ${sql.slice(0, 60)}`);
    },
  };
}

test('R3/TEMP: PUBLIC with TEMP (default ACL) ⇒ problem with the §3-ب remediation', async () => {
  const p = await databaseProblems(dbClient({ publicTemp: true }));
  assert.ok(p.some((x) => x.includes('REVOKE TEMP ON DATABASE greendms FROM PUBLIC') && x.includes('§') === false && x.includes('بخش ۳-ب')));
});

test('R3/TEMP: PUBLIC without TEMP and no runtime TEMP ⇒ clean', async () => {
  assert.deepEqual(await databaseProblems(dbClient({ publicTemp: false })), []);
});

test('R3/TEMP: a runtime role with TEMP ⇒ problem', async () => {
  const p = await databaseProblems(dbClient({ publicTemp: false, roleTemp: { dms_app: true } }));
  assert.ok(p.some((x) => x.startsWith('dms_app: TEMP')));
});

test('R3: database missing from pg_database ⇒ problem (fail-closed)', async () => {
  assert.ok((await databaseProblems(dbClient({ dbExists: false }))).length > 0);
});
