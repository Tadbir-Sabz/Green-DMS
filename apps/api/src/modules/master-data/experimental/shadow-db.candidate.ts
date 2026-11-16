/**
 * TASK-C13-EXECUTION-ENABLEMENT-01 — آداپتورِ فقط‌خواندنیِ بازرسیِ پایگاه‌دادهٔ ایزوله برای Track B.
 *
 * ⚠️ **آزمایشی و غیردادنی.** هیچ مسیرِ تولیدی این ماژول را import نمی‌کند.
 *
 * این ماژول **تنها** برای یک محیطِ ایزولهٔ دورریختنی (disposable) یا replicaٔ مسلّماً فقط‌خواندنی
 * در نظر گرفته شده است. ضمانت‌ها و راستی‌آزمایی‌ها:
 *
 *   ۱. نقشِ اتصال باید `default_transaction_read_only=on` داشته باشد (از rolconfig یا SHOW) — در غیر این صورت خطا.
 *   ۲. `statement_timeout` باید تنظیم باشد (پیش‌فرض سخت‌گیرانه؛ با requireStrictRole=false فقط هشدار ثبت می‌شود).
 *   ۳. «تستِ منفیِ INSERT» اجرا می‌شود: یک تراکنشِ read-only با INSERT تقریباً‌محال‌است‌که‌موفق‌شود — اگر موفق شود
 *      یعنی دروازه باز است و بازرسی **تصویر نمی‌کند** (خطای حیاتی). نوشتنی‌ای رخ نمی‌دهد؛ تراکنش rollback می‌شود.
 *   ۴. کشفِ اسکیمای الزامی (جدول‌ها/ستون‌ها) — هر نقص یعنی `AssessmentPreconditionError` با فهرستِ دقیق.
 *   ۵. RLS روی جدول‌های هویتی (product_family/product_alias/product_barcode طبق 0047) باید enable+force باشد.
 *   ۶. شمارشِ رکوردِ هر جدول روی خودِ منبع ثبت می‌شود — کامل‌بودنِ export قابلِ وارسی است.
 *   ۷. خوانش به‌صورتِ حلقهٔ per-company با `set_config('app.company_id', …)` انجام می‌شود (الگوی الفِ Track B)؛
 *      مسیرِ cross-company عمداً **پیاده نشده** — در صورت خواست، خطای صریح داده می‌شود (نه خاموش).
 *   ۸. هیچ مقداری چاپ/لاگ نمی‌شود؛ فقط شمارش‌ها، اثرانگشت‌ها و نامِ جدول/ستون برمی‌گردد.
 *
 * در صورت هرگونه نقصِ پیش‌شرط: `AssessmentPreconditionError` با فهرستِ `issues` — هیچ ردیفی خوانده نمی‌شود
 * تا همهٔ پیش‌شرط‌ها برقرار نباشند.
 */
import { Client } from 'pg';
import type { CrossTypeRow } from './cross-type-collision.candidate';

/** جدول‌های الزامی برای بازرسی — schema_migrations برای ثبتِ نسخهٔ اعمال‌شده اجباری است */
export const REQUIRED_TABLES = [
  'company',
  'product',
  'product_category',
  'product_family',
  'product_alias',
  'product_packaging',
  'product_barcode',
  'schema_migrations',
] as const;

/** جدول‌های هویتی که 0047 روی آن‌ها RLS اجباری کرده — وضعیتِ آن‌ها باید ثابت شود */
export const RLS_ENFORCED_TABLES = [
  'product_family',
  'product_alias',
  'product_barcode',
] as const;

const REQUIRED_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  company: ['id'],
  product: [
    'id',
    'company_id',
    'code',
    'name',
    'name_latin',
    'variant_signature',
    'family_id',
    'category_id',
    'deleted_at',
  ],
  product_category: ['id', 'company_id', 'code'],
  product_family: ['id', 'company_id', 'code'],
  product_alias: ['id', 'company_id', 'product_id', 'alias', 'alias_norm', 'kind'],
  product_packaging: ['id', 'product_id', 'barcode'],
  product_barcode: ['id', 'company_id', 'product_id', 'packaging_id', 'barcode', 'kind', 'is_primary'],
  schema_migrations: ['version'],
};

export class AssessmentPreconditionError extends Error {
  readonly issues: readonly string[];
  constructor(issues: readonly string[]) {
    super(`بازرسی رد شد — پیش‌شرط‌های محیطِ ایزوله برقرار نیست:\n- ${issues.join('\n- ')}`);
    this.name = 'AssessmentPreconditionError';
    this.issues = issues;
  }
}

export interface ReadOnlyRoleState {
  readonly role: string;
  readonly rolconfig: readonly string[];
  readonly defaultTransactionReadOnly: boolean;
  readonly statementTimeout: string | null;
}

export interface RlsTableState {
  readonly table: string;
  readonly relrowsecurity: boolean;
  readonly relforcerowsecurity: boolean;
}

export interface NegativeWriteProbe {
  readonly attempted: boolean;
  /** true = نوشتن رد شد (صحیح و مورد انتظار). false = فاجعه */
  readonly rejected: boolean;
  readonly errorCode: string | null;
}

export interface InspectionResult {
  readonly engineVersion: string;
  readonly schemaMigration: string | null;
  readonly migrationsApplied: number;
  /** شمارشِ tenant-scoped (مجموع روی همهٔ شرکت‌ها در زمینهٔ همان tenant) — قابلِ مقایسه با exportedCounts */
  readonly recordCounts: Readonly<Record<string, number>>;
  readonly exportedCounts: Readonly<Record<string, number>>;
  /** true = recordCounts زیرِ RLS با زمینهٔ tenant سنجیده شده (خوانشِ per-company)، نه کور */
  readonly recordCountsTenantScoped: boolean;
  readonly rows: readonly CrossTypeRow[];
  readonly rls: readonly RlsTableState[];
  readonly readOnly: ReadOnlyRoleState;
  readonly probeWrite: NegativeWriteProbe;
  /** برچسبِ ماتِ منبع — هرگز DSN/میزبان/رمز; فقط یک نامِ نمایشیِ مصوب */
  readonly sourceLabel: string;
  /** منشأ کامل برای ثبت در شواهد (مثلاً 'disposable-synthetic-fixture:c13-ee01') */
  readonly provenance: string;
  readonly warnings: readonly string[];
}

export interface InspectOptions {
  /** رشتهٔ اتصال — هرگز لاگ/چاپ نمی‌شود؛ فقط به pg Client داده می‌شود */
  readonly dsn: string;
  /** برچسبِ ماتِ منبع (در شواهد) */
  readonly sourceLabel: string;
  /** منشأِ کامل برای provenance */
  readonly provenance: string;
  /** پیش‌فرض true — RLS روی جدول‌های هویتی اجباری */
  readonly requireRls?: boolean;
  /** پیش‌فرض true — وجود و خوانش schema_migrations اجباری */
  readonly requireMigrationState?: boolean;
  /** پیش‌فرض true — اجرای تستِ منفیِ INSERT */
  readonly probeWrite?: boolean;
  /** پیش‌فرض true — default_transaction_read_only و statement_timeout سخت‌گیرانه */
  readonly requireStrictRole?: boolean;
  /** اختیاری — محدود‌سازی به زیرمجموعه‌ای از شرکت‌ها (شناسه‌های خام؛ در لاگ چاپ نمی‌شوند) */
  readonly companies?: readonly string[];
  /** شمارشِ رکوردِ schema_migrations هم در خروجی ثبت می‌شود */
  readonly applicationName?: string;
}

const DEFAULT_APP_NAME = 'c13-assessment';

async function currentSetting(client: Client, name: string): Promise<string | null> {
  const r = await client.query<{ v: string | null }>('select current_setting($1, true) as v', [name]);
  return r.rows[0]?.v ?? null;
}

async function inspectRole(client: Client): Promise<ReadOnlyRoleState> {
  const me = await client.query<{ rolname: string; rolconfig: string[] | null }>(
    'select rolname, rolconfig from pg_roles where rolname = current_user',
  );
  const role = me.rows[0]?.rolname ?? 'unknown';
  const rolconfig = me.rows[0]?.rolconfig ?? [];
  const showRO = (await currentSetting(client, 'default_transaction_read_only')) === 'on';
  const fromRolconfig = rolconfig.some((e) => /^default_transaction_read_only\s*=\s*on$/i.test(e.trim()));
  const statementTimeout = await currentSetting(client, 'statement_timeout');
  return {
    role,
    rolconfig,
    defaultTransactionReadOnly: showRO || fromRolconfig,
    statementTimeout,
  };
}

async function negativeWriteProbe(client: Client): Promise<NegativeWriteProbe> {
  let rejected = false;
  let errorCode: string | null = null;
  try {
    await client.query('begin read only');
    await client.query(
      `insert into product (id, company_id, code, name)
       values ('00000000-0000-0000-0000-00000000c13a', '00000000-0000-0000-0000-00000000c13a', '__c13_probe__', '__c13_probe__')`,
    );
    // به اینجا رسیدن یعنی نوشتن رد نشد
    rejected = false;
  } catch (err) {
    const code = (err as { code?: string }).code;
    const codeStr = typeof code === 'string' ? code : 'unknown';
    // فقط SQLSTATE 25006 (read_only_sql_transaction) اثباتِ «فقط‌خواندنی بودن» است؛
    // هر خطای دیگر (42501=فقدانِ مجوز، 42P01=جدولِ غایب، 23503=FK و…)نشانهٔ کافی نیست ⇒ توقفِ سخت
    if (codeStr !== '25006') {
      throw new AssessmentPreconditionError([
        `تستِ منفیِ INSERT با خطای غیرمنتظره متوقف شد (SQLSTATE=${codeStr})؛ «فقط‌خواندنی بودنِ» نقش اثبات نشد — مبانیِ محیط را پیش از هر بازرسیِ دیگر اصلاح کنید.`,
      ]);
    }
    rejected = true;
    errorCode = codeStr;
  } finally {
    try {
      await client.query('rollback');
    } catch {
      /* تراکنش از قبل بسته شده */
    }
  }
  return { attempted: true, rejected, errorCode };
}

async function discoverSchema(client: Client): Promise<{
  missingTables: string[];
  missingColumns: string[];
}> {
  const tables = await client.query<{ table_name: string }>(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'`,
  );
  const present = new Set(tables.rows.map((r) => r.table_name));
  const missingTables = REQUIRED_TABLES.filter((t) => !present.has(t));
  const cols = await client.query<{ table_name: string; column_name: string }>(
    `select table_name, column_name from information_schema.columns where table_schema = 'public'`,
  );
  const colSet = new Map<string, Set<string>>();
  for (const r of cols.rows) {
    const s = colSet.get(r.table_name) ?? new Set<string>();
    s.add(r.column_name);
    colSet.set(r.table_name, s);
  }
  const missingColumns: string[] = [];
  for (const [table, required] of Object.entries(REQUIRED_COLUMNS)) {
    if (!present.has(table)) continue; // گزارشِ جدولِ غایب جداگانه ثبت شده
    const have = colSet.get(table) ?? new Set<string>();
    for (const c of required) {
      if (!have.has(c)) missingColumns.push(`${table}.${c}`);
    }
  }
  return { missingTables, missingColumns };
}

async function readRlsState(client: Client): Promise<RlsTableState[]> {
  const r = await client.query<{
    relname: string;
    relrowsecurity: boolean;
    relforcerowsecurity: boolean;
  }>(
    `select relname, relrowsecurity, relforcerowsecurity
       from pg_class
      where relname = any($1::text[]) and relkind = 'r'`,
    [RLS_ENFORCED_TABLES as unknown as string[]],
  );
  return RLS_ENFORCED_TABLES.map((t) => {
    const row = r.rows.find((x) => x.relname === t);
    return {
      table: t,
      relrowsecurity: row?.relrowsecurity ?? false,
      relforcerowsecurity: row?.relforcerowsecurity ?? false,
    };
  });
}

async function readMigrationState(client: Client): Promise<{ maxVersion: string | null; applied: number }> {
  const r = await client.query<{ max_version: string | null; n: string }>(
    'select max(version) as max_version, count(*)::text as n from schema_migrations',
  );
  return { maxVersion: r.rows[0]?.max_version ?? null, applied: Number(r.rows[0]?.n ?? '0') };
}

async function countRows(client: Client, table: string): Promise<number> {
  const r = await client.query<{ n: string }>(`select count(*)::text as n from ${table}`);
  return Number(r.rows[0]?.n ?? '0');
}

/** شمارشِ ردیف‌های exportشده به‌ازایِ هر منشأ — برای تطبیقِ کامل‌بودنِ export */
export type ExportedCounts = Readonly<Record<string, number>>;

interface ExportAcc {
  rows: CrossTypeRow[];
  counts: Record<string, number>;
  recordCounts: Record<string, number>;
}

async function exportForCompany(
  client: Client,
  companyId: string,
  acc: ExportAcc,
): Promise<void> {
  const push = (r: CrossTypeRow) => acc.rows.push(r);
  const bump = (k: string, n: number) => {
    acc.counts[k] = (acc.counts[k] ?? 0) + n;
  };

  await client.query('begin read only');
  try {
    await client.query(`select set_config('app.company_id', $1, true)`, [companyId]);

    // شمارشِ «جهانیِ واجدِ شرایطِ export» در همان زمینهٔ tenant — با predicateِ صریحِ شرکت (صادق چه با RLS چه بدون)؛
    // semantics: دقیقاً همان ردیف‌هایی که یک export کامل باید در بر داشته باشد
    const scopedCounts: Record<string, string> = {
      product: 'select count(*)::text as n from product where company_id = $1 and deleted_at is null',
      product_category: 'select count(*)::text as n from product_category where company_id = $1',
      product_family: 'select count(*)::text as n from product_family where company_id = $1',
      product_alias: `select count(*)::text as n from product_alias a
                        join product p on p.id = a.product_id and p.company_id = a.company_id
                       where p.deleted_at is null and a.company_id = $1`,
      product_barcode: `select count(*)::text as n from product_barcode b
                          join product p on p.id = b.product_id and p.company_id = b.company_id
                         where p.deleted_at is null and b.company_id = $1`,
      product_packaging: `select count(*)::text as n from product_packaging pp
                             join product p on p.id = pp.product_id
                            where pp.barcode is not null and btrim(pp.barcode) <> '' and p.deleted_at is null and p.company_id = $1`,
    };
    for (const [t, sql] of Object.entries(scopedCounts)) {
      const c = await client.query<{ n: string }>(sql, [companyId]);
      acc.recordCounts[t] = (acc.recordCounts[t] ?? 0) + Number(c.rows[0]?.n ?? '0');
    }

    // ── product → product_code / product_name / product_name_latin / variant_signature
    const products = await client.query<{
      id: string;
      company_id: string;
      code: string;
      name: string;
      name_latin: string | null;
      variant_signature: string | null;
      family_id: string | null;
      category_id: string | null;
    }>(
      `select id, company_id, code, name, name_latin, variant_signature, family_id, category_id
         from product
        where deleted_at is null and company_id = $1`,
      [companyId],
    );
    for (const p of products.rows) {
      const base = {
        entity_id: p.id,
        entity_type: 'product' as const,
        company_id: p.company_id,
        category_id: p.category_id,
        family_id: p.family_id,
      };
      push({ ...base, identity_type: 'product_code', display_value: p.code, stored_normalized: p.code, source_ref: `product:${p.id}` });
      push({ ...base, identity_type: 'product_name', display_value: p.name, stored_normalized: p.name, source_ref: `product:${p.id}` });
      if (p.name_latin && p.name_latin.trim().length > 0) {
        push({ ...base, identity_type: 'product_name_latin', display_value: p.name_latin, stored_normalized: p.name_latin, source_ref: `product:${p.id}` });
      }
      if (p.variant_signature && p.variant_signature.trim().length > 0) {
        push({ ...base, identity_type: 'variant_signature', display_value: p.variant_signature, stored_normalized: p.variant_signature, source_ref: `product:${p.id}` });
      }
    }
    bump('product', products.rows.length);

    // ── product_family → family_code
    const families = await client.query<{ id: string; company_id: string; code: string }>(
      'select id, company_id, code from product_family where company_id = $1',
      [companyId],
    );
    for (const f of families.rows) {
      push({
        entity_id: f.id,
        entity_type: 'product_family',
        company_id: f.company_id,
        identity_type: 'family_code',
        display_value: f.code,
        stored_normalized: f.code,
        source_ref: `product_family:${f.id}`,
      });
    }
    bump('product_family', families.rows.length);

    // ── product_category → category_code
    const categories = await client.query<{ id: string; company_id: string; code: string }>(
      'select id, company_id, code from product_category where company_id = $1',
      [companyId],
    );
    for (const c of categories.rows) {
      push({
        entity_id: c.id,
        entity_type: 'product_category',
        company_id: c.company_id,
        identity_type: 'category_code',
        display_value: c.code,
        stored_normalized: c.code,
        source_ref: `product_category:${c.id}`,
      });
    }
    bump('product_category', categories.rows.length);

    // ── product_alias → alias (با family/category برای حاشیه‌نویسی)
    const aliases = await client.query<{
      id: string;
      company_id: string;
      product_id: string;
      alias: string;
      alias_norm: string;
      kind: string;
      family_id: string | null;
      category_id: string | null;
    }>(
      `select a.id, a.company_id, a.product_id, a.alias, a.alias_norm, a.kind, p.family_id, p.category_id
         from product_alias a
         join product p on p.id = a.product_id and p.company_id = a.company_id
        where p.deleted_at is null and a.company_id = $1`,
      [companyId],
    );
    for (const a of aliases.rows) {
      push({
        entity_id: a.product_id,
        entity_type: 'product',
        company_id: a.company_id,
        identity_type: 'alias',
        subtype: a.kind,
        family_id: a.family_id,
        category_id: a.category_id,
        display_value: a.alias,
        stored_normalized: a.alias_norm,
        source_ref: `product_alias:${a.id}`,
      });
    }
    bump('product_alias', aliases.rows.length);

    // ── product_barcode → barcode (همهٔ kindها؛ packaging_id فقط بافت است)
    const barcodes = await client.query<{
      id: string;
      company_id: string;
      product_id: string;
      packaging_id: string | null;
      barcode: string;
      kind: string;
      family_id: string | null;
      category_id: string | null;
    }>(
      `select b.id, b.company_id, b.product_id, b.packaging_id, b.barcode, b.kind, p.family_id, p.category_id
         from product_barcode b
         join product p on p.id = b.product_id and p.company_id = b.company_id
        where p.deleted_at is null and b.company_id = $1`,
      [companyId],
    );
    for (const b of barcodes.rows) {
      push({
        entity_id: b.product_id,
        entity_type: 'product',
        company_id: b.company_id,
        identity_type: 'barcode',
        subtype: b.kind,
        family_id: b.family_id,
        category_id: b.category_id,
        display_value: b.barcode,
        stored_normalized: b.barcode,
        source_ref: `product_barcode:${b.id}`,
      });
    }
    bump('product_barcode', barcodes.rows.length);

    // ── product_packaging (legacy) → packaging_barcode
    const packaging = await client.query<{
      id: string;
      company_id: string;
      product_id: string;
      barcode: string;
      family_id: string | null;
      category_id: string | null;
    }>(
      `select pp.id, p.company_id, pp.product_id, pp.barcode, p.family_id, p.category_id
         from product_packaging pp
         join product p on p.id = pp.product_id
        where pp.barcode is not null and btrim(pp.barcode) <> '' and p.deleted_at is null and p.company_id = $1`,
      [companyId],
    );
    for (const pp of packaging.rows) {
      push({
        entity_id: pp.product_id,
        entity_type: 'product',
        company_id: pp.company_id,
        identity_type: 'packaging_barcode',
        subtype: 'packaging:legacy',
        family_id: pp.family_id,
        category_id: pp.category_id,
        display_value: pp.barcode,
        stored_normalized: pp.barcode,
        source_ref: `product_packaging:${pp.id}`,
      });
    }
    bump('product_packaging', packaging.rows.length);

    await client.query('commit');
  } catch (err) {
    try {
      await client.query('rollback');
    } catch {
      /* noop */
    }
    throw err;
  }
}

/**
 * بازرسیِ کاملِ یک منبعِ ایزوله. در صورتِ هرگونه نقصِ پیش‌شرط،
 * `AssessmentPreconditionError` پرتاب می‌شود و هیچ گزارش/فایلی ساخته نمی‌شود.
 */
export async function inspectIsolatedDb(opts: InspectOptions): Promise<InspectionResult> {
  const requireRls = opts.requireRls ?? true;
  const requireMigrationState = opts.requireMigrationState ?? true;
  const probeWrite = opts.probeWrite ?? true;
  const requireStrictRole = opts.requireStrictRole ?? true;
  const appName = opts.applicationName ?? DEFAULT_APP_NAME;
  const warnings: string[] = [];

  const client = new Client({ connectionString: opts.dsn, application_name: appName });
  await client.connect();
  try {
    // ── ۱) نقش فقط‌خواندنی؟
    const role = await inspectRole(client);
    const roleIssues: string[] = [];
    if (!role.defaultTransactionReadOnly) {
      roleIssues.push(
        `نقشِ اتصال (current_user) «${role.role}» مقدارِ default_transaction_read_only=on را نه از rolconfig و نه از SHOW اثبات نمی‌کند.`,
      );
    }
    if (!role.statementTimeout || role.statementTimeout === '0') {
      const msg = `statement_timeout برای نقشِ «${role.role}» تنظیم نشده (مقدار: ${role.statementTimeout ?? 'خالی'}).`;
      if (requireStrictRole) roleIssues.push(msg);
      else warnings.push(msg);
    }
    if (roleIssues.length > 0) throw new AssessmentPreconditionError(roleIssues);

    // ── ۲) تستِ منفیِ INSERT — اگر نوشته شود، بازرسی نمی‌آغازد
    const probe: NegativeWriteProbe = probeWrite
      ? await negativeWriteProbe(client)
      : { attempted: false, rejected: true, errorCode: null };
    if (probe.attempted && !probe.rejected) {
      throw new AssessmentPreconditionError([
        'فاجعهٔ امنیتی: INSERT در تراکنشِ read-only رد نشد؛ نقش عملاً فقط‌خواندنی نیست. اتصال قطع شد؛ هیچ فرایندِ دیگری اجرا نمی‌شود. این ناهنجاری باید به DBA/مالک داده فوراً گزارش شود.',
      ]);
    }

    // ── ۳) کشفِ اسکیما
    const { missingTables, missingColumns } = await discoverSchema(client);
    const schemaIssues: string[] = [];
    if (missingTables.length > 0) schemaIssues.push(`جدول‌های غایب: ${missingTables.join(', ')}`);
    if (missingColumns.length > 0) schemaIssues.push(`ستون‌های غایب: ${missingColumns.join(', ')}`);
    if (schemaIssues.length > 0) throw new AssessmentPreconditionError(schemaIssues);

    // ── ۴) RLS روی جدول‌های هویتی
    const rls = await readRlsState(client);
    if (requireRls) {
      const rlsIssues = rls
        .filter((t) => !t.relrowsecurity || !t.relforcerowsecurity)
        .map((t) => `RLS روی «${t.table}» برقرار نیست (enable=${t.relrowsecurity}, force=${t.relforcerowsecurity}) — صفرِ یافته زیرِ این وضعیت معتبر نیست.`);
      if (rlsIssues.length > 0) throw new AssessmentPreconditionError(rlsIssues);
    } else {
      for (const t of rls) {
        if (!t.relrowsecurity || !t.relforcerowsecurity) {
          warnings.push(`RLS روی «${t.table}» برقرار نیست — فقط به‌دلیلِ requireRls=false ادامه یافت؛ این بازبینی جایگزینِ تأییدِ RLS نیست.`);
        }
      }
    }

    // ── ۵) وضعیتِ مهاجرت‌ها
    let schemaMigration: string | null = null;
    let migrationsApplied = 0;
    if (requireMigrationState) {
      const mig = await readMigrationState(client);
      schemaMigration = mig.maxVersion;
      migrationsApplied = mig.applied;
      if (!schemaMigration) {
        throw new AssessmentPreconditionError([
          'جدولِ schema_migrations تهی یا max(version) نامعتبر است؛ نسخهٔ اعمال‌شدهٔ اسکیما اثبات نمی‌شود.',
        ]);
      }
    } else {
      try {
        const mig = await readMigrationState(client);
        schemaMigration = mig.maxVersion;
        migrationsApplied = mig.applied;
      } catch {
        warnings.push('schema_migrations خوانده نشد — با requireMigrationState=false ادامه یافت.');
      }
    }

    // ── ۶) شمارشِ company (جدولِ ریشهٔ tenant؛ بدون RLS) — بقیه در حلقهٔ tenant سنجیده می‌شوند
    const recordCounts: Record<string, number> = {};
    recordCounts['company'] = await countRows(client, 'company');

    // ── ۷) خوانشِ per-company (الگوی الف)
    const companyRows = await client.query<{ id: string }>('select id from company order by id');
    const wanted = opts.companies ? new Set(opts.companies) : null;
    const companies = companyRows.rows.map((r) => r.id).filter((id) => !wanted || wanted.has(id));
    if (wanted && companies.length !== wanted.size) {
      const unseen = [...wanted].filter((id) => !companies.includes(id));
      warnings.push(`${unseen.length} شرکتِ درخواستی در company یافت نشد؛ فقط شرکت‌هایِ موجود خوانده شدند.`);
    }

    const acc: ExportAcc = { rows: [], counts: {}, recordCounts };
    for (const c of companies) {
      await exportForCompany(client, c, acc);
    }

    if (acc.rows.length === 0) {
      warnings.push(
        'صفر ردیف صادر شد — اگر داده‌ای وجود داشت ولی RLS/شرکت‌ها آن را پنهان کردند، این «صفرِ مشاهده‌نشده» است، نه «صفرِ واقعی». provenance را بررسی کنید.',
      );
    }

    const engine = await client.query<{ v: string }>('show server_version');

    return {
      engineVersion: engine.rows[0]?.v ?? 'unknown',
      schemaMigration,
      migrationsApplied,
      recordCounts,
      recordCountsTenantScoped: true,
      exportedCounts: acc.counts,
      rows: acc.rows,
      rls,
      readOnly: role,
      probeWrite: probe,
      sourceLabel: opts.sourceLabel,
      provenance: opts.provenance,
      warnings,
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}
