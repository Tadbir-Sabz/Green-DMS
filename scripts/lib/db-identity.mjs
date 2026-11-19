/**
 * راستی‌آزماییِ هویت‌های پایگاه‌داده (S8) — یک منبعِ حقیقت برای ابزارهای عملیاتی و آزمون‌ها.
 *
 * این ماژول فقط **می‌خواند** (کاتالوگ‌ها، aclexplode و pg_has_role). هیچ ALTER/GRANT انجام نمی‌دهد و
 * هیچ رمزی را چاپ نمی‌کند. مغایرت‌ها (problems) با پیامِ فارسی برگردانده می‌شوند.
 *
 * قواعدِ معماری (docs/db-privilege-architecture.md):
 *   - dms_owner           : NOLOGIN، بدون SUPERUSER/BYPASSRLS؛ مالکِ دفترِ موجودی (inventory_txn) و توابعِ آن.
 *   - dms_migrator        : هویتِ مهاجرت. فقط در «پنجرهٔ مهاجرت» عضوِ dms_owner (با SET) است.
 *   - dms_app             : هویتِ زمانِ اجرای API. هرگز عضو/قادر به SET dms_owner نیست (مستقیم یا غیرمستقیم)،
 *                           مالکِ هیچ شیءیِ public نیست، عضوِ dms_maintainer نیست، EXECUTE روی wrapper ندارد.
 *   - dms_maintainer      : هویتِ نگه‌داریِ پارتیشن. فقط EXECUTE روی wrapperهای محدود؛
 *                           هرگز عضو/قادر به SET dms_owner نیست؛ هیچ امتیازِ نوشتن روی جدولِ دفتر ندارد.
 *
 * تذکر: «ownership» و «EXECUTE» جدا هستند. مالکِ یک تابع همیشه EXECUTE دارد؛ لذا برای wrapperهای
 * 0071 (مالک = مالکِ جدول = dms_migrator) EXECUTE برای مالک بررسی نمی‌شود، فقط PUBLIC/dms_app/dms_readonly.
 */

export const ROLE = Object.freeze({
  owner: 'dms_owner',
  migrator: 'dms_migrator',
  app: 'dms_app',
  readonly: 'dms_readonly',
  maintainer: 'dms_maintainer',
});

/** پیشوندِ امنِ search_path برای توابعِ SECURITY DEFINER (pg_temp باید آخر باشد) */
export const PINNED_SEARCH_PATH = 'search_path=pg_catalog, public, pg_temp';

/**
 * کوئریِ یک‌ردیفه برای یک نقش. عضویت‌ها هم مستقیم (pg_auth_members) و هم مؤثر (pg_has_role، با
 * ارثِ غیرمستقیم) گزارش می‌شوند؛ عضویتِ غیرمستقیم از راهِ زنجیرهٔ نقش‌ها هم گرفته می‌شود.
 */
const IDENTITY_SQL = `
select r.rolname                                        as name,
       r.rolsuper                                       as is_super,
       r.rolbypassrls                                   as bypass_rls,
       r.rolcanlogin                                    as can_login,
       r.rolcreaterole                                  as can_create_role,
       (select count(*)::int from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relowner = r.oid
           and not exists (select 1 from pg_depend d
                            where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e'))
                                                        as owned_relations,
       (select count(*)::int from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proowner = r.oid)
                                                        as owned_functions,
       exists (select 1 from pg_auth_members m
                 join pg_roles a on a.oid = m.roleid
                 join pg_roles b on b.oid = m.member
                where a.rolname = 'dms_owner' and b.oid = r.oid)
                                                        as direct_member_of_owner,
       case when exists (select 1 from pg_roles where rolname = 'dms_owner')
            then pg_has_role(r.rolname, 'dms_owner', 'MEMBER') else false end
                                                        as indirect_member_of_owner,
       case when exists (select 1 from pg_roles where rolname = 'dms_owner')
            then pg_has_role(r.rolname, 'dms_owner', 'SET') else false end
                                                        as can_set_owner,
       exists (select 1 from pg_auth_members m
                 join pg_roles a on a.oid = m.roleid
                 join pg_roles b on b.oid = m.member
                where a.rolname = 'dms_maintainer' and b.oid = r.oid)
                                                        as direct_member_of_maintainer,
       case when exists (select 1 from pg_roles where rolname = 'dms_maintainer')
            then pg_has_role(r.rolname, 'dms_maintainer', 'MEMBER') else false end
                                                        as indirect_member_of_maintainer
  from pg_roles r
 where r.rolname = $1`;

/** وضعیتِ یک نقش را از اتصالِ داده‌شده می‌خواند (client از نوعِ pg.Client/Pool). */
export async function identityOf(client, roleName) {
  const { rows } = await client.query(IDENTITY_SQL, [roleName]);
  const r = rows[0];
  if (!r) return null;
  return {
    name: r.name,
    isSuper: !!r.is_super,
    bypassRls: !!r.bypass_rls,
    canLogin: !!r.can_login,
    canCreateRole: !!r.can_create_role,
    ownedRelations: Number(r.owned_relations ?? 0),
    ownedFunctions: Number(r.owned_functions ?? 0),
    directMemberOfOwner: !!r.direct_member_of_owner,
    indirectMemberOfOwner: !!r.indirect_member_of_owner,
    canSetOwner: !!r.can_set_owner,
    directMemberOfMaintainer: !!r.direct_member_of_maintainer,
    indirectMemberOfMaintainer: !!r.indirect_member_of_maintainer,
  };
}

/** وضعیتِ هویتِ جاریِ یک اتصال (برای CURRENT_USER واقعی، نه نام‌دلخواه). */
export async function currentIdentity(client) {
  const { rows } = await client.query('select current_user::text as name');
  return identityOf(client, rows[0].name);
}

/**
 * قواعدِ مورد انتظار برای هر هویتِ زمانِ اجرا/نگه‌داری.
 * opts.windowOpen = true فقط برای dms_migrator معنا دارد (SET روی dms_owner مجاز است).
 */
export function expectationsFor(roleName, opts = {}) {
  const common = { isSuper: false, bypassRls: false };
  switch (roleName) {
    case ROLE.owner:
      return { ...common, canLogin: false, ownedRelations: 'any' };
    case ROLE.migrator:
      return {
        ...common,
        canLogin: true,
        directMemberOfOwner: opts.windowOpen ? 'any' : false,
        indirectMemberOfOwner: opts.windowOpen ? 'any' : false,
        canSetOwner: opts.windowOpen ? 'any' : false,
      };
    case ROLE.app:
      return {
        ...common,
        canLogin: true,
        ownedRelations: 0,
        ownedFunctions: 0,
        directMemberOfOwner: false,
        indirectMemberOfOwner: false,
        canSetOwner: false,
        directMemberOfMaintainer: false,
        indirectMemberOfMaintainer: false,
      };
    case ROLE.maintainer:
      return {
        ...common,
        canLogin: true,
        ownedRelations: 0,
        ownedFunctions: 0,
        directMemberOfOwner: false,
        indirectMemberOfOwner: false,
        canSetOwner: false,
      };
    case ROLE.readonly:
      // S8-07 / R3: هویتِ فقط‌خواندنی هرگز مالک، عضوِ owner/maintainer یا SET‌پذیرِ owner نیست.
      return {
        ...common,
        ownedRelations: 0,
        ownedFunctions: 0,
        directMemberOfOwner: false,
        indirectMemberOfOwner: false,
        canSetOwner: false,
        directMemberOfMaintainer: false,
        indirectMemberOfMaintainer: false,
      };
    default:
      throw new Error(`نقشِ ناشناخته برای راستی‌آزمایی: ${roleName}`);
  }
}

/** مقایسهٔ گزارش با قواعد؛ فهرستِ مغایرت‌ها (خالی یعنی سالم). */
export function collectIdentityProblems(roleName, report, opts = {}) {
  const problems = [];
  if (!report) {
    return [`نقشِ «${roleName}» وجود ندارد.`];
  }
  const exp = expectationsFor(roleName, opts);
  for (const [key, want] of Object.entries(exp)) {
    if (want === 'any') continue;
    const got = report[key];
    if (got !== want) problems.push(`${roleName}: ${key}=${got} (انتظار ${want})`);
  }
  if (roleName === ROLE.owner && report.canLogin) {
    problems.push(`${roleName}: باید NOLOGIN باشد`);
  }
  return problems;
}

/**
 * پایگاه‌داده: TEMP برای PUBLIC بسته باشد (S8-06).
 * دلیل: در PostgreSQL نشست‌های دارای TEMP می‌توانند جدولِ موقت بسازند؛ جدولِ موقتی به نامِ
 * pg_inherits/pg_class در مسیرِ جست‌وجوی relation «اول» دیده می‌شود (نه pg_temp انتهایی).
 * datacl = NULL یعنی پیش‌فرض (TEMP برای PUBLIC) ⇒ مغایرت.
 */
export async function databaseProblems(client) {
  const problems = [];
  const { rows } = await client.query(`
    select (d.datacl is null or exists (
              select 1 from aclexplode(d.datacl) a
               where a.grantee = 0 and a.privilege_type = 'TEMP')) as public_temp,
           current_database()::text as db
      from pg_database d
     where d.datname = current_database()`);
  if (rows.length === 0) {
    return ['پایگاه‌داده جاری در pg_database یافت نشد.'];
  }
  if (rows[0].public_temp) {
    problems.push(
      `${rows[0].db}: PUBLIC هنوز TEMP دارد؛ مدیرِ استقرار باید «REVOKE TEMP ON DATABASE ${rows[0].db} FROM PUBLIC» را اجرا کند (docs/deploy/PRODUCTION_DEPLOYMENT.md، بخش ۳-ب)`,
    );
  }
  for (const role of [ROLE.app, ROLE.readonly, ROLE.maintainer]) {
    const r = await client.query(
      `select exists (select 1 from pg_roles where rolname = $1)
              and has_database_privilege($1, current_database(), 'TEMP') as has_temp`,
      [role],
    );
    if (r.rows[0]?.has_temp) problems.push(`${role}: TEMP روی پایگاه‌داده دارد (باید نداشته باشد)`);
  }
  return problems;
}

/** wrapper/تابع‌هایِ نگه‌داریِ دفتر و پارتیشن‌ها (S8-06). */
const MAINTAIN_FUNCTIONS = [
  // table: مالکِ مورد انتظار = مالکِ جدولِ والد؛ inventory = dms_owner (0070)
  { fn: 'fn_maintain_inventory_partitions', ownerOf: 'dms_owner', from: '0070' },
  { fn: 'fn_maintain_audit_partitions', ownerOf: 'public.audit_log', from: '0071' },
  { fn: 'fn_maintain_location_partitions', ownerOf: 'public.location_sample', from: '0071' },
];

/**
 * راستی‌آزماییِ دفتر و نگه‌داری (S8-05/S8-06/S8-07). فقط خواندنی؛ fail-closed.
 *
 * S8-07 / R3:
 *   - دفترِ خالی یا ناخواندنی هرگز PASS نمی‌شود.
 *   - وضعیتِ دفتر (schema_migrations) با وضعیتِ «اشیای» واقعی مقایسه می‌شود (دو طرفه):
 *     وجودِ اشیای 0070/0071/0072 بدونِ ثبتِ نسخه، و ثبتِ نسخه بدونِ اشیا، هر دو مغایرت‌اند.
 *   - D1 قبل از 0072: wrapperِ 0070 بدونِ search_path پین‌شده یعنی سطحِ D1 باز است؛ فقط وقتی
 *     مهاجرتِ 0072 همین پنجره اعمال می‌شود (pendingD1Fix) مجاز است، و پس‌بررسی آن را نمی‌پذیرد.
 *   - dms_readonly: هویت، و نبودنِ UPDATE/DELETE/TRUNCATE روی هر جدولِ دفتر (شامل inventory).
 *   - NULL ACL روی توابع (= EXECUTE پیش‌فرض برای PUBLIC) مغایرت است.
 *
 * opts.pendingD1Fix: true فقط در preflight پنجرهٔ مهاجرتی که 0072 را اعمال می‌کند.
 */
export async function ledgerProblems(client, opts = {}) {
  const pendingD1Fix = opts.pendingD1Fix === true;
  let applied;
  try {
    applied = new Set((await client.query('select version from schema_migrations')).rows.map((r) => r.version));
  } catch {
    return ['schema_migrations وجود ندارد یا خوانده نمی‌شود؛ راستی‌آزماییِ دفتر ممکن نیست (fail-closed).'];
  }
  if (applied.size === 0) {
    return ['schema_migrations خالی است؛ دفتر با اشیای پایگاه‌داده همخوان نیست (fail-closed).'];
  }
  const problems = [];

  // ---- اشیای واقعی (منبعِ انتظار از روی اشیا، نه فقط از روی دفتر) ----
  const { rows: objRows } = await client.query(
    `select to_regprocedure('public.fn_maintain_inventory_partitions(integer)') is not null as inv_fn,
            to_regprocedure('public.fn_maintain_audit_partitions(integer)') is not null as audit_fn,
            to_regprocedure('public.fn_maintain_location_partitions(integer)') is not null as loc_fn,
            (select p.proconfig from pg_proc p
              where p.pronamespace = 'public'::regnamespace and p.proname = 'fn_maintain_inventory_partitions') as inv_cfg`,
  );
  const obj = objRows[0] ?? {};
  // 0068 تریگرهای محافظ را می‌سازد؛ نشانهٔ «اشیای 0070» فقط تابعِ نگه‌داریِ 0070 است.
  const invPresent = obj.inv_fn === true;
  const invPinned = Array.isArray(obj.inv_cfg) && obj.inv_cfg.includes(PINNED_SEARCH_PATH);

  if (invPresent !== applied.has('0070')) {
    problems.push(`دفتر/اشیا: اشیای 0070 ${invPresent ? 'وجود دارند' : 'وجود ندارند'} اما نسخهٔ 0070 ${applied.has('0070') ? 'ثبت شده' : 'ثبت نشده'}`);
  }
  // S8-07 (R3): هر wrapperِ 0071 جداگانه سنجیده می‌شود (یکی‌ازدوتا گم‌شده نباید پنهان بماند).
  if ((obj.audit_fn === true) !== applied.has('0071')) {
    problems.push(`دفتر/اشیا: wrapperِ نگه‌داریِ ممیزی (0071) با ثبتِ نسخهٔ 0071 همخوان نیست`);
  }
  if ((obj.loc_fn === true) !== applied.has('0071')) {
    problems.push(`دفتر/اشیا: wrapperِ نگه‌داریِ موقعیت (0071) با ثبتِ نسخهٔ 0071 همخوان نیست`);
  }
  if (invPinned && !applied.has('0072')) {
    problems.push('دفتر/اشیا: wrapperِ 0070 پین‌شده است اما نسخهٔ 0072 ثبت نشده است');
  }
  if (applied.has('0070') && !applied.has('0072') && !invPinned && !pendingD1Fix) {
    problems.push(
      'D1 باز: fn_maintain_inventory_partitions بدونِ search_path پین‌شده (pg_temp) است؛ مهاجرت 0072 باید اعمال شود',
    );
  }

  // ---- جدول‌های دفتر و پارتیشن‌ها ----
  const parents = [];
  if (applied.has('0070')) parents.push({ table: 'inventory_txn', guards: 2, appAllowsWrite: true, policy: 'p_inventory_txn_tenant' });
  if (applied.has('0071')) {
    parents.push({ table: 'audit_log', guards: 0, appAllowsWrite: false, policy: 'p_audit_log_tenant' });
    parents.push({ table: 'location_sample', guards: 0, appAllowsWrite: false, policy: 'p_location_sample_tenant' });
  }

  for (const p of parents) {
    const { rows } = await client.query(
      `select c.relname                              as name,
              pg_get_userbyid(c.relowner)            as owner,
              (select pg_get_userbyid(pp.relowner) from pg_class pp where pp.oid = to_regclass($1)) as parent_owner,
              c.relrowsecurity                       as rls_enabled,
              c.relforcerowsecurity                  as forced,
              (select count(*)::int from pg_trigger t
                where t.tgrelid = c.oid and not t.tgisinternal
                  and t.tgname in ('trg_inventory_txn_append_only','trg_inventory_txn_no_truncate')) as guards,
              exists (select 1 from pg_policy pol where pol.polrelid = c.oid and pol.polname = $2) as has_policy,
              has_table_privilege('dms_app', c.oid, 'UPDATE,DELETE,TRUNCATE')      as app_writes,
              has_table_privilege('dms_readonly', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE') as ro_writes,
              has_table_privilege('dms_maintainer', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE') as maint_writes
         from pg_class c
        where c.oid = to_regclass($1)
           or c.oid in (select i.inhrelid from pg_inherits i where i.inhparent = to_regclass($1))`,
      [`public.${p.table}`, p.policy],
    );
    if (rows.length === 0) {
      problems.push(`${p.table}: جدول یا پارتیشنی یافت نشد`);
      continue;
    }
    for (const r of rows) {
      if (r.owner !== r.parent_owner) {
        problems.push(`${r.name}: مالک «${r.owner}» است، انتظار مالکِ والد «${r.parent_owner}»`);
      }
      if (p.table === 'inventory_txn' && r.owner !== ROLE.owner) {
        problems.push(`${r.name}: مالکِ inventory_txn باید ${ROLE.owner} باشد (مالک «${r.owner}»)`);
      }
      if (!r.rls_enabled) problems.push(`${r.name}: RLS فعال نیست`);
      if (!r.forced) problems.push(`${r.name}: RLS اجباری (FORCE) نیست`);
      if (!r.has_policy) problems.push(`${r.name}: سیاستِ ${p.policy} وجود ندارد`);
      if (r.guards !== p.guards) problems.push(`${r.name}: تریگرهای محافظ=${r.guards} (انتظار ${p.guards})`);
      if (!p.appAllowsWrite && r.app_writes) {
        problems.push(`${r.name}: ${ROLE.app} هنوز UPDATE/DELETE/TRUNCATE دارد`);
      }
      // S8-07: dms_readonly هیچ نوشتنی روی هیچ جدولِ دفتر (inventory هم) نباید داشته باشد
      if (r.ro_writes) {
        problems.push(`${r.name}: ${ROLE.readonly} امتیازِ نوشتن روی دفتر دارد (نباید داشته باشد)`);
      }
      if (r.maint_writes) {
        problems.push(`${r.name}: ${ROLE.maintainer} امتیازِ نوشتن روی دفتر دارد (نباید داشته باشد)`);
      }
    }
  }

  // ---- توابعِ نگه‌داری (wrapper) ----
  for (const f of MAINTAIN_FUNCTIONS) {
    if (!applied.has(f.from)) continue;
    const { rows } = await client.query(
      `select p.oid,
              pg_get_userbyid(p.proowner)                     as owner,
              p.prosecdef                                      as definer,
              p.proconfig                                      as config,
              (p.proacl is null)                               as acl_default,
              exists (select 1 from aclexplode(p.proacl) a
                       where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_exec,
              has_function_privilege('dms_maintainer', p.oid, 'EXECUTE') as maint_exec,
              has_function_privilege('dms_app', p.oid, 'EXECUTE')        as app_exec,
              has_function_privilege('dms_readonly', p.oid, 'EXECUTE')   as ro_exec,
              case when $2 = 'dms_owner' then 'dms_owner'::text
                   else (select pg_get_userbyid(c.relowner)::text from pg_class c where c.oid = to_regclass($2)) end
                                                               as want_owner
         from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.proname = $1`,
      [f.fn, f.ownerOf],
    );
    if (rows.length !== 1) {
      problems.push(`${f.fn}: باید دقیقاً یک تعریف داشته باشد (یافت شد ${rows.length})`);
      continue;
    }
    const r = rows[0];
    if (r.owner !== r.want_owner) {
      problems.push(`${f.fn}: مالک «${r.owner}» است، انتظار «${r.want_owner}»`);
    }
    if (!r.definer) problems.push(`${f.fn}: SECURITY DEFINER نیست`);
    if (r.acl_default || r.public_exec) problems.push(`${f.fn}: PUBLIC هنوز EXECUTE دارد (ACL پیش‌فرض یا صریح)`);
    if (!r.maint_exec) problems.push(`${f.fn}: ${ROLE.maintainer} EXECUTE ندارد`);
    if (r.app_exec) problems.push(`${f.fn}: ${ROLE.app} نباید EXECUTE داشته باشد`);
    if (r.ro_exec) problems.push(`${f.fn}: ${ROLE.readonly} نباید EXECUTE داشته باشد`);
    const cfg = r.config ?? [];
    const pinned = cfg.includes(PINNED_SEARCH_PATH);
    const allowedOpen = f.from === '0070' && pendingD1Fix && !applied.has('0072');
    if (!pinned && !allowedOpen) {
      problems.push(`${f.fn}: proconfig=${JSON.stringify(cfg)} (انتظار ${PINNED_SEARCH_PATH})`);
    }
  }

  // ---- هویتِ dms_readonly (S8-07 / R3) ----
  if (applied.has('0041')) {
    const ro = await identityOf(client, ROLE.readonly);
    if (!ro) problems.push(`${ROLE.readonly} وجود ندارد`);
    else problems.push(...collectIdentityProblems(ROLE.readonly, ro));
  }

  // ---- schema_migrations برای نقش‌های زمانِ اجرا (0072) ----
  if (applied.has('0072')) {
    const { rows } = await client.query(`
      select has_table_privilege('dms_app', 'public.schema_migrations', 'SELECT,INSERT,UPDATE,DELETE') as app,
             has_table_privilege('dms_readonly', 'public.schema_migrations', 'SELECT,INSERT,UPDATE,DELETE') as ro,
             has_table_privilege('dms_maintainer', 'public.schema_migrations', 'SELECT,INSERT,UPDATE,DELETE') as maint`);
    if (rows[0]?.app) problems.push(`${ROLE.app}: به schema_migrations دسترسی دارد (نباید)`);
    if (rows[0]?.ro) problems.push(`${ROLE.readonly}: به schema_migrations دسترسی دارد (نباید)`);
    if (rows[0]?.maint) problems.push(`${ROLE.maintainer}: به schema_migrations دسترسی دارد (نباید)`);
  }

  return problems;
}
