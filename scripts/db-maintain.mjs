#!/usr/bin/env node
/**
 * نگه‌داریِ زمان‌بندی‌شدهٔ پارتیشن‌های دفتر موجودی (S8 / task -04)
 *
 * فقط با هویت نگه‌داری (MAINTENANCE_DATABASE_URL = dms_maintainer، LOGIN) اجرا می‌شود.
 * این ابزار هیچ‌وقت با DATABASE_URL (مهاجرت) یا APP_DATABASE_URL (API) کار نمی‌کند،
 * و هیچ DDL مستقیمی صادر نمی‌کند: تنها تابع wrapper با ورودیِ عددیِ محدود فراخوانی می‌شود.
 *
 *   node scripts/db-maintain.mjs check                  راستی‌آزماییِ هویت (فقط خواندنی)
 *   node scripts/db-maintain.mjs partitions [--months N] (۰..۱۲، پیش‌فرض ۲) ساخت پارتیشن‌های آتی + محافظت
 *
 * خروجی JSON است؛ شکست = کد خروج غیرصفر.
 *
 * محدوده (S8-05): سه والد پارتیشن‌شده، هر کدام با wrapper اختصاصیِ خود:
 *   inventory_txn  ⇒ fn_maintain_inventory_partitions   (0070)
 *   audit_log      ⇒ fn_maintain_audit_partitions       (0071)
 *   location_sample⇒ fn_maintain_location_partitions    (0071)
 * fn_ensure_partitions (0064، SECURITY INVOKER) برای نگه‌داری استفاده نمی‌شود و dms_maintainer
 * هیچ EXECUTE روی آن ندارد. مالکِ هر پارتیشن باید با مالکِ والدش یکی باشد (inventory_txn: dms_owner؛
 * audit_log/location_sample: مالکِ فعلیِ جدول، بدونِ انتقال)؛ انحراف = FAIL.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';
import { ROLE, collectIdentityProblems, currentIdentity } from './lib/db-identity.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const [cmd, ...args] = process.argv.slice(2);

/** والدها و wrapperِ نگه‌داریِ هر کدام (ترتیبِ ثابت؛ هیچ ورودیِ نام‌جدول از کاربر گرفته نمی‌شود). */
const PARENTS = [
  { table: 'inventory_txn', fn: 'fn_maintain_inventory_partitions', guardTriggers: 2 },
  { table: 'audit_log', fn: 'fn_maintain_audit_partitions', guardTriggers: 0 },
  { table: 'location_sample', fn: 'fn_maintain_location_partitions', guardTriggers: 0 },
];

function maintenanceUrl() {
  const raw = process.env.MAINTENANCE_DATABASE_URL;
  if (!raw) throw new Error('MAINTENANCE_DATABASE_URL تنظیم نشده است (هویت dms_maintainer).');
  return raw;
}

async function identityProblems(client) {
  const me = await currentIdentity(client);
  const problems = collectIdentityProblems(ROLE.maintainer, me);
  if (me?.name !== ROLE.maintainer) {
    problems.push(`اتصال با «${me?.name ?? '?'}» است؛ انتظار «${ROLE.maintainer}».`);
  }
  // دفاعِ عمق: نگه‌دار نباید بتواند با SET به dms_owner برود (pg_has_role = SET)
  if (me?.canSetOwner) problems.push('dms_maintainer نباید قادر به SET ROLE dms_owner باشد.');
  // هویت نباید dms_app یا dms_migrator باشد
  if (me && ['dms_app', 'dms_migrator', 'dms_owner'].includes(me.name)) {
    problems.push(`نقشِ ${me.name} هویتِ نگه‌داری نیست.`);
  }
  return problems;
}

async function cmdCheck() {
  const c = new pg.Client({ connectionString: maintenanceUrl() });
  await c.connect();
  try {
    const problems = await identityProblems(c);
    const sigs = PARENTS.map((p) => `public.${p.fn}(integer)`);
    const fn = await c.query(
      `select s as sig, has_function_privilege(current_user, s, 'EXECUTE') as can_exec
         from unnest($1::text[]) as s`,
      [sigs],
    );
    for (const row of fn.rows) {
      if (!row.can_exec) problems.push(`dms_maintainer اجازهٔ EXECUTE روی ${row.sig} ندارد.`);
    }
    const ensure = await c.query(
      `select has_function_privilege(current_user, 'public.fn_ensure_partitions(integer)', 'EXECUTE') as can_ensure`,
    );
    if (ensure.rows[0].can_ensure) problems.push('dms_maintainer نباید EXECUTE روی fn_ensure_partitions داشته باشد.');
    console.log(JSON.stringify({ status: problems.length ? 'FAIL' : 'PASS', role: ROLE.maintainer, problems }, null, 2));
    if (problems.length) process.exitCode = 1;
  } finally {
    await c.end();
  }
}

async function cmdPartitions() {
  const idx = args.indexOf('--months');
  const raw = idx >= 0 ? args[idx + 1] : '2';
  const months = Number(raw);
  if (!Number.isInteger(months) || months < 0 || months > 12) {
    throw new Error('--months باید عدد صحیح بین ۰ و ۱۲ باشد.');
  }
  const c = new pg.Client({ connectionString: maintenanceUrl() });
  await c.connect();
  try {
    const pre = await identityProblems(c);
    if (pre.length) {
      console.log(JSON.stringify({ status: 'FAIL', stage: 'preflight', problems: pre }, null, 2));
      process.exitCode = 1;
      return;
    }
    const perParent = [];
    for (const p of PARENTS) {
      await c.query(`select ${p.fn}($1)`, [months]);
      const { rows } = await c.query(
        `select c.relname as partition,
                pg_get_userbyid(c.relowner) as owner,
                pg_get_userbyid(p.relowner) as parent_owner,
                (select count(*)::int from pg_trigger t where t.tgrelid = c.oid and not t.tgisinternal
                   and t.tgname in ('trg_inventory_txn_append_only','trg_inventory_txn_no_truncate')) as guard_triggers,
                c.relrowsecurity as rls, c.relforcerowsecurity as rls_forced,
                has_table_privilege('dms_app', c.oid, 'UPDATE') as app_update,
                has_table_privilege('dms_app', c.oid, 'DELETE') as app_delete,
                has_table_privilege('dms_app', c.oid, 'TRUNCATE') as app_truncate
           from pg_inherits i join pg_class c on c.oid = i.inhrelid
                join pg_class p on p.oid = i.inhparent
          where i.inhparent = to_regclass($1)
          order by c.relname`,
        [`public.${p.table}`],
      );
      const bad = rows.filter((r) =>
        r.owner !== r.parent_owner
        || r.guard_triggers !== p.guardTriggers
        || !r.rls_forced
        || (p.table !== 'inventory_txn' && (r.app_update || r.app_delete || r.app_truncate)));
      perParent.push({ table: p.table, partitions: rows.length, deviating: bad });
    }
    const deviating = perParent.flatMap((x) => x.deviating);
    const post = await identityProblems(c);
    const status = deviating.length || post.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify({ status, months_ahead: months, parents: perParent, problems: post }, null, 2));
    if (status === 'FAIL') process.exitCode = 1;
  } finally {
    await c.end();
  }
}

const run = { check: cmdCheck, partitions: cmdPartitions }[cmd];
if (!run) {
  console.log('روش مصرف:\n  node scripts/db-maintain.mjs check\n  node scripts/db-maintain.mjs partitions [--months N]');
  process.exit(cmd ? 1 : 0);
}
try {
  await run();
} catch (err) {
  console.error(`خطا: ${err.message}`);
  process.exitCode = 1;
}
