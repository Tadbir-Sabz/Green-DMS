import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { config } from 'dotenv';
import pg from 'pg';
import request from 'supertest';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PG_POOL } from '../src/database/database.module';
import { validationPipeOptions } from '../src/common/validation';
import { hashPassword } from '../src/modules/identity-rbac/password';

/**
 * TASK-PM-01D-M4-F — اثبات امنیتی روی یک پایگاهدادهٔ کاملاً یکبارمصرف و ایزوله،
 * با اتصال TCP واقعی و کمینهامتیازِ dms_app (APP_DATABASE_URL)، نه فقط SET ROLE و نه ابرکاربر.
 *
 * هیچ پایگاهدادهٔ مشترک/تولیدی لمس نمیشود: قبل از اجرا، سرور محلی 127.0.0.1:55432
 * با datadir موقت /tmp، بدون اتصال کلاینت دیگر و بدون DATABASE_URL تولیدی راستیآزمایی
 * شد (گزارش نهایی F). تمام اشیاء/دادهها در همین فایل ساخته و در teardown حذف میشوند.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const PSQL = process.env.PSQL ?? 'psql';
const DB_NAME = `greendms_pm_bulk_security_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
const PREVIEW = '/api/v1/products/bulk-maintenance/preview';
const EXECUTE = '/api/v1/products/bulk-maintenance/execute';
const statusUrl = (id: string) => `/api/v1/products/bulk-maintenance/operations/${id}`;
const reconcileUrl = (id: string) => `${statusUrl(id)}/reconcile`;

interface SecureFixture {
  app: INestApplication;
  admin: pg.Pool;
  appClient: pg.Client;
  roClient: pg.Client;
  companyId: string;
  otherCompanyId: string;
  categoryId: string;
  uomId: string;
  adminUserId: string;
  otherActorId: string;
  adminPassword: string;
  appPassword: string;
  roPassword: string;
  appUrl: string;
  token: string;
  api: (token?: string) => {
    get: (url: string) => request.Test;
    post: (url: string) => request.Test;
    patch: (url: string) => request.Test;
  };
  teardown: () => Promise<void>;
}

let fx: SecureFixture;
const savedEnv: Record<string, string | undefined> = {};

async function setup(): Promise<SecureFixture> {
  for (const k of ['DATABASE_URL', 'APP_DATABASE_URL', 'JWT_SECRET', 'SMS_PROVIDER', 'REDIS_HOST', 'REDIS_PORT', 'NODE_ENV']) {
    savedEnv[k] = process.env[k];
  }
  const adminUrl = new URL(process.env.DATABASE_URL ?? '');
  const testUrl = new URL(adminUrl);
  testUrl.pathname = `/${DB_NAME}`;
  const psqlEnv = {
    ...process.env,
    ...(adminUrl.password ? { PGPASSWORD: decodeURIComponent(adminUrl.password) } : {}),
  };
  const psqlBase = [
    '-h', adminUrl.hostname || '127.0.0.1',
    '-U', adminUrl.username || 'postgres',
    '-p', adminUrl.port || '5432',
    '-v', 'ON_ERROR_STOP=1',
  ];

  const rootAdmin = new pg.Pool({ connectionString: adminUrl.toString(), max: 2 });
  await rootAdmin.query('select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()', [DB_NAME]);
  await rootAdmin.query(`drop database if exists "${DB_NAME}"`);
  await rootAdmin.query(`create database "${DB_NAME}"`);

  const files = readdirSync(path.join(ROOT, 'migrations'))
    .filter((f) => f.endsWith('.up.sql'))
    .sort()
    .flatMap((f) => ['-f', path.join(ROOT, 'migrations', f)]);
  execFileSync(PSQL, [...psqlBase, '-d', DB_NAME, '-1', '-q', ...files], { env: psqlEnv, stdio: 'pipe' });

  // نقشهای واقعی و قابل اتصال (0041 آنها را NOLOGIN ساخته است).
  const appPassword = crypto.randomBytes(18).toString('hex');
  const roPassword = crypto.randomBytes(18).toString('hex');
  await rootAdmin.query(`alter role dms_app login password '${appPassword}'`);
  await rootAdmin.query(`alter role dms_readonly login password '${roPassword}'`);
  await rootAdmin.query(`grant connect on database "${DB_NAME}" to dms_app, dms_readonly`);

  // «admin» در این فایل = اتصال ممتاز به همان DB یکبارمصرف (seed/بوتاسترپ/راستیآزمایی).
  const admin = new pg.Pool({ connectionString: testUrl.toString(), max: 4 });
  const company = await admin.query<{ id: string }>(
    `insert into company (code, legal_name) values ('PMSEC', 'شرکت امنیتی تست') returning id`,
  );
  const companyId = company.rows[0].id;
  const otherCompany = await admin.query<{ id: string }>(
    `insert into company (code, legal_name) values ('PMSEC2', 'شرکت دوم تست') returning id`,
  );
  const otherCompanyId = otherCompany.rows[0].id;
  const cat = await admin.query<{ id: string }>(
    `insert into product_category (company_id, code, name) values ($1,'PMSECCAT','گروه تست') returning id`,
    [companyId],
  );
  const uom = await admin.query<{ id: string }>(
    `insert into uom (code, title, decimal_places) values ('pmsec_piece','عدد',0) returning id`,
  );
  const adminPassword = 'S3cret!pass';
  const passwordHash = await hashPassword(adminPassword);
  const person = await admin.query<{ id: string }>(
    `insert into person (company_id, code, first_name, last_name) values ($1,'SEC-ADM','مدیر','امنیت') returning id`,
    [companyId],
  );
  await admin.query(
    `insert into app_user (person_id, username, password_hash, access_level) values ($1,'pmsec_admin',$2,'web')`,
    [person.rows[0].id, passwordHash],
  );
  const otherPerson = await admin.query<{ id: string }>(
    `insert into person (company_id, code, first_name, last_name) values ($1,'SEC-OTHER','بازیگر','دوم') returning id`,
    [companyId],
  );
  await admin.query(
    `insert into app_user (person_id, username, password_hash, access_level) values ($1,'pmsec_other',$2,'web')`,
    [otherPerson.rows[0].id, passwordHash],
  );
  const role = await admin.query<{ id: string }>(
    `insert into role (company_id, code, name) values ($1,'pmsec_role','نقش تست') returning id`,
    [companyId],
  );
  await admin.query(
    `insert into role_permission (role_id, permission_code)
     select $1, code from permission where code like 'master.product%' or code like 'master.price%'`,
    [role.rows[0].id],
  );
  await admin.query(
    `insert into user_role (app_user_id, role_id)
     select u.id, $1 from app_user u where u.username in ('pmsec_admin','pmsec_other')`,
    [role.rows[0].id],
  );
  const users = await admin.query<{ id: string; username: string }>(
    `select id, username from app_user where username in ('pmsec_admin','pmsec_other')`,
  );
  const adminUserId = users.rows.find((u) => u.username === 'pmsec_admin')!.id;
  const otherActorId = users.rows.find((u) => u.username === 'pmsec_other')!.id;

  const appUrl = `postgres://dms_app:${appPassword}@${adminUrl.hostname || '127.0.0.1'}:${adminUrl.port || '5432'}/${DB_NAME}`;
  process.env.DATABASE_URL = testUrl.toString(); // مهاجرت/seed ادمین
  process.env.APP_DATABASE_URL = appUrl; // اتصال واقعی برنامه = dms_app
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'local_only_secret_not_for_production';
  process.env.SMS_PROVIDER = process.env.SMS_PROVIDER ?? 'log';
  process.env.REDIS_HOST = process.env.REDIS_HOST ?? '127.0.0.1';
  process.env.REDIS_PORT = process.env.REDIS_PORT ?? '6379';
  process.env.NODE_ENV = 'test';

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
  await app.init();

  const login = async (username: string, pw: string): Promise<string> => {
    const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username, password: pw });
    if (res.status !== 200 || !res.body.access_token) {
      throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body).slice(0, 300)}`);
    }
    return res.body.access_token as string;
  };
  const token = await login('pmsec_admin', adminPassword);
  const makeApi = (t?: string) => {
    const bearer = t ?? token;
    const verb = (method: 'get' | 'post' | 'patch') => (url: string): request.Test => {
      const req = request(app.getHttpServer())[method](url);
      return bearer ? req.set('Authorization', `Bearer ${bearer}`) : req;
    };
    return { get: verb('get'), post: verb('post'), patch: verb('patch') };
  };

  const appClient = new pg.Client({ connectionString: appUrl });
  await appClient.connect();
  const roClient = new pg.Client({
    connectionString: `postgres://dms_readonly:${roPassword}@${adminUrl.hostname || '127.0.0.1'}:${adminUrl.port || '5432'}/${DB_NAME}`,
  });
  await roClient.connect();

  const teardown = async () => {
    await appClient.end().catch(() => undefined);
    await roClient.end().catch(() => undefined);
    await app.close();
    await admin.end();
    await rootAdmin.query('select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()', [DB_NAME]);
    await rootAdmin.query(`drop database if exists "${DB_NAME}"`);
    await rootAdmin.end();
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };

  return {
    app,
    admin,
    appClient,
    roClient,
    companyId,
    otherCompanyId,
    categoryId: cat.rows[0].id,
    uomId: uom.rows[0].id,
    adminUserId,
    otherActorId,
    adminPassword,
    appPassword,
    roPassword,
    appUrl,
    token,
    api: makeApi,
    teardown,
  };
}

beforeAll(async () => {
  fx = await setup();
}, 180_000);

afterAll(async () => {
  await fx?.teardown();
});

const mkProducts = async (count = 2): Promise<Array<{ id: string; code: string; row_version: number }>> => {
  const prefix = `SEC-${crypto.randomBytes(4).toString('hex')}`;
  const out: Array<{ id: string; code: string; row_version: number }> = [];
  for (let i = 1; i <= count; i += 1) {
    const res = await fx.api().post('/api/v1/products').send({
      name: `کالای ${i}`,
      code: `${prefix}-${i}`,
      category_id: fx.categoryId,
      base_uom_id: fx.uomId,
      min_order_qty: 1,
      distribution_kind: 'cold',
      requires_permit: false,
    }).expect(201);
    out.push(res.body);
  }
  return out;
};

const preview = (ids: string[], changes: Record<string, unknown>) =>
  fx.api().post(PREVIEW).send({ product_ids: ids, changes });

const execute = (operationId: string, previewToken: string) =>
  fx.api().post(EXECUTE).send({ operation_id: operationId, preview_token: previewToken, confirm: true });

const reconcile = (operationId: string) => fx.api().post(reconcileUrl(operationId));

const getStatus = (operationId: string) => fx.api().get(statusUrl(operationId));

const boundCounts = async (operationId: string) => {
  const { rows } = await fx.admin.query<{ audit: number; history: number; evidence: number }>(
    `select
       (select count(*)::int from audit_log where bulk_operation_id=$1) as audit,
       (select count(*)::int from product_catalog_history where bulk_operation_id=$1) as history,
       (select count(*)::int from product_bulk_history_event where bulk_operation_id=$1) as evidence`,
    [operationId],
  );
  return rows[0];
};

const versions = async (ids: string[]): Promise<Map<string, number>> => {
  const { rows } = await fx.admin.query<{ id: string; row_version: number }>(
    `select id, row_version::int as row_version from product where id = any($1::uuid[])`,
    [ids],
  );
  return new Map(rows.map((r) => [r.id, r.row_version]));
};

const setLedgerUnknown = async (operationId: string) => {
  await fx.admin.query(
    `update product_bulk_operation set status='unknown', outcome='unknown',
        failure_category='unknown', reason_code='commit_outcome_unknown', result=null
      where id=$1`,
    [operationId],
  );
};

describe('TASK-PM-01D-M4-F — isolated DB and real dms_app identity', () => {
  it('runs on a demonstrably disposable local DB with a real dms_app runtime connection, not a superuser', async () => {
    const runtime = fx.app.get<pg.Pool>(PG_POOL);
    const { rows } = await runtime.query<{
      current_user: string;
      is_superuser: boolean;
      bypassrls: boolean;
      owned: number;
      forced: number;
    }>(`select current_user,
          (select rolsuper from pg_roles where rolname=current_user) as is_superuser,
          (select rolbypassrls from pg_roles where rolname=current_user) as bypassrls,
          (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
             where n.nspname='public' and c.relkind in ('r','p') and pg_get_userbyid(c.relowner)=current_user) as owned,
          (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
             where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity and c.relforcerowsecurity) as forced`);
    expect(rows[0].current_user).toBe('dms_app');
    expect(rows[0].is_superuser).toBe(false);
    expect(rows[0].bypassrls).toBe(false);
    expect(rows[0].owned).toBe(0);
    expect(rows[0].forced).toBeGreaterThan(0);
    const who = await fx.appClient.query<{ current_user: string }>('select current_user');
    expect(who.rows[0].current_user).toBe('dms_app');
    const env = await fx.admin.query<{ n: number }>(
      `select count(*)::int as n from pg_stat_activity
        where datname=$1 and backend_type='client backend' and usename not in ('dms_app','dms_readonly','postgres')`,
      [DB_NAME],
    );
    expect(env.rows[0].n).toBe(0);
  });

  it('dms_app has no CREATE/DDL, no evidence INSERT, and cannot self-provision partitions', async () => {
    const { rows } = await fx.admin.query<{ create_schema: boolean; ro: boolean }>(
      `select has_schema_privilege('dms_app','public','CREATE') as create_schema,
              (select rolbypassrls from pg_roles where rolname='dms_app') as ro`,
    );
    expect(rows[0].create_schema).toBe(false);
    expect(rows[0].ro).toBe(false);

    // p_months_ahead=12 ⇒ ماههای فراتر از پارتیشنهای موجود نیازمند CREATEاند؛
    // فراخوانی ۲ ماهه وقتی همه پارتیشنها موجودند هیچ DDL انجام نمیدهد و معیار نیست.
    await expect(fx.appClient.query('select fn_ensure_partitions(12)')).rejects.toThrow();
    await expect(fx.appClient.query('create table pm_dms_app_ddl_probe (id int)')).rejects.toThrow();
    await expect(
      fx.appClient.query(`insert into product_bulk_history_event
        (bulk_operation_id, product_id, company_id, actor_user_id, history_id)
       values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 1)`),
    ).rejects.toThrow();
    await expect(fx.appClient.query('delete from product_bulk_operation')).rejects.toThrow();
    await expect(fx.appClient.query('delete from product_bulk_history_event')).rejects.toThrow();
  });

  it('SET ROLE dms_app and the real connection both enforce forced RLS, grants and tenant GUCs', async () => {
    // یک ردیف دفتر/شواهد متعلق به شرکت دوم، با نقش ادمین (فقط seed تست).
    const opB = crypto.randomUUID();
    await fx.admin.query(
      `insert into product_bulk_operation
        (id, company_id, actor_user_id, status, outcome, failure_category, request_hash,
         preview_token_hash, preview_hash, product_ids, changes, expected_versions, preview, expires_at)
       values ($1,$2,null,'committed','committed','none','rh','pt','ph',
               array[gen_random_uuid()]::uuid[],'{"name":"x"}'::jsonb,'{}'::jsonb,'{"items":[]}'::jsonb,
               now()+interval '1 day')`,
      [opB, fx.otherCompanyId],
    );
    const roleClient = await fx.admin.connect();
    try {
      await roleClient.query('set role dms_app');
      const roleProbe = await roleClient.query<{ u: string }>('select current_user as u');
      expect(roleProbe.rows[0].u).toBe('dms_app');
    } finally {
      await roleClient.query('reset role');
      roleClient.release();
    }

    const setTenant = async (company: string, user: string) => {
      await fx.appClient.query(`select set_config('app.company_id',$1,false), set_config('app.user_id',$2,false)`, [company, user]);
    };
    await setTenant(fx.companyId, fx.adminUserId);

    const crossSelect = await fx.appClient.query(`select id from product_bulk_operation where company_id=$1`, [fx.otherCompanyId]);
    expect(crossSelect.rows).toHaveLength(0);
    await expect(
      fx.appClient.query(
        `insert into product_bulk_operation
          (id, company_id, status, outcome, failure_category, request_hash, preview_token_hash,
           preview_hash, product_ids, changes, expected_versions, preview, expires_at)
         values (gen_random_uuid(),$1,'preview_created','not_started','none','a','b','c',
                 array[gen_random_uuid()]::uuid[],'{"name":"x"}'::jsonb,'{}'::jsonb,'{"items":[]}'::jsonb,
                 now()+interval '1 day')`,
        [fx.otherCompanyId],
      ),
    ).rejects.toThrow();
    const crossUpdate = await fx.appClient.query(
      `update product_bulk_operation set updated_at=now() where company_id=$1`,
      [fx.otherCompanyId],
    );
    expect(crossUpdate.rowCount).toBe(0);

    // GUC جعلی/خالی ⇒ fail-closed (هیچ ردیفی دیده نمیشود، درج رد میشود).
    await fx.appClient.query(`select set_config('app.company_id','',false), set_config('app.user_id','',false)`);
    const noTenant = await fx.appClient.query(`select id from product_bulk_operation`);
    expect(noTenant.rows).toHaveLength(0);
    await expect(
      fx.appClient.query(
        `insert into product_bulk_operation
          (id, company_id, status, outcome, failure_category, request_hash, preview_token_hash,
           preview_hash, product_ids, changes, expected_versions, preview, expires_at)
         values (gen_random_uuid(),$1,'preview_created','not_started','none','a','b','c',
                 array[gen_random_uuid()]::uuid[],'{"name":"x"}'::jsonb,'{}'::jsonb,'{"items":[]}'::jsonb,
                 now()+interval '1 day')`,
        [fx.companyId],
      ),
    ).rejects.toThrow();

    const forced = await fx.admin.query<{ l: boolean; e: boolean }>(
      `select (select relrowsecurity and relforcerowsecurity from pg_class where relname='product_bulk_operation') as l,
              (select relrowsecurity and relforcerowsecurity from pg_class where relname='product_bulk_history_event') as e`,
    );
    expect(forced.rows[0].l).toBe(true);
    expect(forced.rows[0].e).toBe(true);

    // dms_readonly کمینهامتیاز: جدولهای کنترل M4 را نمیبیند، جدول عادی را میبیند.
    await expect(fx.roClient.query('select * from product_bulk_operation')).rejects.toThrow();
    await expect(fx.roClient.query('select * from product_bulk_history_event')).rejects.toThrow();
    await expect(fx.roClient.query('select count(*) from product')).resolves.toBeTruthy();

    await fx.admin.query(`delete from product_bulk_operation where id=$1`, [opB]);
    await setTenant(fx.companyId, fx.adminUserId);
  });

  it('intended M4 workflow succeeds under dms_app and writes operation-bound evidence in one transaction', async () => {
    const ps = await mkProducts(2);
    const ids = ps.map((p) => p.id);
    const before = await versions(ids);
    const pre = await preview(ids, { name: 'نام امن' }).expect(200);
    const run = await execute(pre.body.operation_id, pre.body.preview_token).expect(200);
    expect(run.body.status).toBe('committed');
    expect(run.body.updated_count).toBe(2);
    const after = await versions(ids);
    for (const p of ps) expect(after.get(p.id)).toBe((before.get(p.id) ?? 0) + 1);
    const counts = await boundCounts(pre.body.operation_id);
    expect(counts.audit).toBe(1);
    expect(counts.history).toBe(2);
    expect(counts.evidence).toBe(2);
    // request_id کلاینت هرگز مبنای همبستگی نیست.
    const req = await fx.admin.query(
      `select count(*)::int as n from audit_log where bulk_operation_id=$1 and request_id is not null`,
      [pre.body.operation_id],
    );
    expect(req.rows[0].n).toBe(0);
  });
});

describe('TASK-PM-01D-M4-F — operation-bound reconciliation is non-forgeable', () => {
  it('ordinary PATCH with a forged x-request-id cannot create bound history/evidence or a false committed', async () => {
    const [p] = await mkProducts(1);
    const pre = await preview([p.id], { name: 'نام جعلی' }).expect(200);
    const patched = await fx.api().patch(`/api/v1/products/${p.id}`)
      .set('x-request-id', pre.body.operation_id)
      .send({ name: 'نام جعلی', row_version: p.row_version })
      .expect(200);
    expect(patched.body.name).toBe('نام جعلی');
    const counts = await boundCounts(pre.body.operation_id);
    expect(counts.audit).toBe(0);
    expect(counts.history).toBe(0);
    expect(counts.evidence).toBe(0);
    await setLedgerUnknown(pre.body.operation_id);
    const rec = await reconcile(pre.body.operation_id).expect(200);
    expect(rec.body.status).not.toBe('committed');
    expect(rec.body.reconciled).not.toBe(true);
  });

  it('a genuinely committed operation reconciles when the ledger is artificially unknown', async () => {
    const ps = await mkProducts(2);
    const ids = ps.map((p) => p.id);
    const pre = await preview(ids, { name: 'نام قطعی' }).expect(200);
    await execute(pre.body.operation_id, pre.body.preview_token).expect(200);
    await setLedgerUnknown(pre.body.operation_id);
    const readOnly = await getStatus(pre.body.operation_id).expect(200);
    expect(readOnly.body.status).toBe('unknown');
    expect(readOnly.body.reconciled).toBe(false);
    const rec = await reconcile(pre.body.operation_id).expect(200);
    expect(rec.body.status).toBe('committed');
    expect(rec.body.reconciled).toBe(true);
    expect(rec.body.updated_count).toBe(2);
    const again = await reconcile(pre.body.operation_id).expect(200);
    expect(again.body.status).toBe('committed');
  });

  it('incomplete, inconsistent, duplicated, cross-operation and wrong-actor evidence all fail closed', async () => {
    const ps = await mkProducts(2);
    const ids = ps.map((p) => p.id);
    const pre = await preview(ids, { name: 'نام شاهد' }).expect(200);
    await execute(pre.body.operation_id, pre.body.preview_token).expect(200);
    const opId = pre.body.operation_id as string;
    expect((await boundCounts(opId)).evidence).toBe(2);

    const historyFor = async (productId: string): Promise<string> => {
      const r = await fx.admin.query<{ id: string }>(
        `select id from product_catalog_history where bulk_operation_id=$1 and product_id=$2`,
        [opId, productId],
      );
      return r.rows[0].id;
    };
    const restoreEvidence = async (productId: string) => {
      await fx.admin.query(
        `delete from product_bulk_history_event where bulk_operation_id=$1 and product_id=$2`,
        [opId, productId],
      );
      await fx.admin.query(
        `insert into product_bulk_history_event
          (bulk_operation_id, product_id, company_id, actor_user_id, history_id)
         values ($1,$2,$3,$4,$5)`,
        [opId, productId, fx.companyId, fx.adminUserId, await historyFor(productId)],
      );
    };

    // ناقص: حذف یکی از شواهد ⇒ نامشخص.
    await fx.admin.query(`delete from product_bulk_history_event where bulk_operation_id=$1 and product_id=$2`, [opId, ids[1]]);
    await setLedgerUnknown(opId);
    const partial = await reconcile(opId).expect(200);
    expect(partial.body.status).toBe('unknown');
    expect(partial.body.reconciled).toBe(false);
    await restoreEvidence(ids[1]);

    // ناسازگار: شرکت/بازیگر اشتباه روی یکی از شواهد ⇒ نامشخص.
    await fx.admin.query(
      `update product_bulk_history_event set company_id=$2, actor_user_id=$3
        where bulk_operation_id=$1 and product_id=$4`,
      [opId, fx.otherCompanyId, fx.otherActorId, ids[0]],
    );
    await setLedgerUnknown(opId);
    const wrongActor = await reconcile(opId).expect(200);
    expect(wrongActor.body.status).toBe('unknown');
    await restoreEvidence(ids[0]);

    // شاهد عملیات دیگر که به تاریخچهٔ همین عملیات وصل شده ⇒ نامشخص.
    await fx.admin.query(`delete from product_bulk_history_event where bulk_operation_id=$1 and product_id=$2`, [opId, ids[0]]);
    await fx.admin.query(
      `insert into product_bulk_history_event
        (bulk_operation_id, product_id, company_id, actor_user_id, history_id)
       values ($1,$2,$3,$4,$5)`,
      [crypto.randomUUID(), ids[0], fx.companyId, fx.adminUserId, await historyFor(ids[0])],
    );
    await setLedgerUnknown(opId);
    const crossOp = await reconcile(opId).expect(200);
    expect(crossOp.body.status).toBe('unknown');
    await fx.admin.query(
      `delete from product_bulk_history_event where bulk_operation_id <> $1 and history_id in (
         select id from product_catalog_history where bulk_operation_id=$1)`,
      [opId],
    );
    await restoreEvidence(ids[0]);

    // تکرار همان (عملیات، محصول) توسط قید یکتایی DB رد میشود.
    await expect(
      fx.admin.query(
        `insert into product_bulk_history_event
          (bulk_operation_id, product_id, company_id, actor_user_id, history_id)
         values ($1,$2,$3,$4,$5)`,
        [opId, ids[0], fx.companyId, fx.adminUserId, await historyFor(ids[0])],
      ),
    ).rejects.toThrow();

    // شاهد اضافه/مبهم برای محصولی خارج از انتخاب ⇒ نامشخص.
    const strayProduct = crypto.randomUUID();
    const strayHist = await fx.admin.query<{ id: string }>(
      `insert into product_catalog_history
        (company_id, product_id, entity_type, entity_id, action, actor_user_id, bulk_operation_id)
       values ($1,$2,'product',$2,'UPDATE',$3,$4) returning id`,
      [fx.companyId, strayProduct, fx.adminUserId, opId],
    );
    await fx.admin.query(
      `insert into product_bulk_history_event
        (bulk_operation_id, product_id, company_id, actor_user_id, history_id)
       values ($1,$2,$3,$4,$5)`,
      [opId, strayProduct, fx.companyId, fx.adminUserId, strayHist.rows[0].id],
    );
    await setLedgerUnknown(opId);
    const ambiguous = await reconcile(opId).expect(200);
    expect(ambiguous.body.status).toBe('unknown');
    await fx.admin.query(`delete from product_bulk_history_event where product_id=$1`, [strayProduct]);
    await fx.admin.query(`delete from product_catalog_history where id=$1`, [strayHist.rows[0].id]);

    // پس از پاکسازی، شواهد کامل و سازگار ⇒ committed قطعی.
    await setLedgerUnknown(opId);
    const clean = await reconcile(opId).expect(200);
    expect(clean.body.status).toBe('committed');
    expect(clean.body.reconciled).toBe(true);
  });

  it('an accepted ledger with complete committed evidence is durably reconciled, not just reported', async () => {
    const ps = await mkProducts(2);
    const ids = ps.map((p) => p.id);
    const pre = await preview(ids, { name: 'نام پذیرفته' }).expect(200);
    await execute(pre.body.operation_id, pre.body.preview_token).expect(200);
    await fx.admin.query(
      `update product_bulk_operation set status='accepted', outcome='not_started',
         failure_category='none', reason_code=null, result=null where id=$1`,
      [pre.body.operation_id],
    );
    const rec = await reconcile(pre.body.operation_id).expect(200);
    expect(rec.body.status).toBe('committed');
    expect(rec.body.reconciled).toBe(true);
    const ledger = await fx.admin.query<{ status: string; result: Record<string, unknown> | null }>(
      `select status, result from product_bulk_operation where id=$1`, [pre.body.operation_id],
    );
    expect(ledger.rows[0].status).toBe('committed');
    expect((ledger.rows[0].result as { status?: string })?.status).toBe('committed');
    const readOnly = await getStatus(pre.body.operation_id).expect(200);
    expect(readOnly.body.status).toBe('committed');
    // نتیجهٔ ذخیرهشده حاصل همان اکشن صریح است؛ GET فقط آن را بازمیخواند و تطبیق تازهای انجام نمیدهد.
    expect(readOnly.body.reconciled).toBe(true);
  });

  it('an accepted ledger with no evidence and untouched products is durably rolled back', async () => {
    const ps = await mkProducts(1);
    const ids = ps.map((p) => p.id);
    const before = await versions(ids);
    const pre = await preview(ids, { name: 'نام برگشت' }).expect(200);
    await fx.admin.query(
      `update product_bulk_operation set status='accepted', outcome='not_started',
         failure_category='none', reason_code=null, result=null,
         expected_versions=$2::jsonb where id=$1`,
      [pre.body.operation_id, JSON.stringify(Object.fromEntries(before))],
    );
    const rec = await reconcile(pre.body.operation_id).expect(200);
    expect(rec.body.status).toBe('rejected');
    expect(rec.body.outcome).toBe('rolled_back');
    expect(rec.body.reconciled).toBe(true);
    const ledger = await fx.admin.query<{ status: string; outcome: string }>(
      `select status, outcome from product_bulk_operation where id=$1`, [pre.body.operation_id],
    );
    expect(ledger.rows[0].status).toBe('rejected');
    expect(ledger.rows[0].outcome).toBe('rolled_back');
  });

  it('repeated execute/status retries do not false-success and do not block a legitimate replay', async () => {
    const [p] = await mkProducts(1);
    const pre = await preview([p.id], { name: 'نام تکرار' }).expect(200);
    const first = await execute(pre.body.operation_id, pre.body.preview_token).expect(200);
    expect(first.body.status).toBe('committed');
    const replay = await execute(pre.body.operation_id, pre.body.preview_token).expect(200);
    expect(replay.body.status).toBe('committed');
    expect(replay.body.idempotent_replay).toBe(true);
    const s1 = await getStatus(pre.body.operation_id).expect(200);
    const s2 = await getStatus(pre.body.operation_id).expect(200);
    expect(s1.body.status).toBe('committed');
    expect(s2.body.status).toBe('committed');
    expect(s2.body.reconciled).toBe(false); // GET فقطخواندنی، تطبیقی انجام نداده
  });
});

describe('TASK-PM-01D-M4-F — missing audit partition fails closed under dms_app', () => {
  it('rolls back atomically, gives an operational error, then privileged bootstrap restores the workflow', async () => {
    // محصولات پیش از حذف پارتیشن ساخته میشوند تا audit.record بلعیدهشدهٔ مسیر
    // ایجاد کالا تراکنش آن را abort نکند؛ موضوع تست فقط executeی M4 است.
    const ps = await mkProducts(2);
    const ids = ps.map((p) => p.id);
    const month = (await fx.admin.query<{ name: string }>(
      `select 'audit_log_' || to_char(date_trunc('month', current_date),'YYYY_MM') as name`,
    )).rows[0].name;
    await fx.admin.query(`drop table if exists "${month}"`);
    const before = await versions(ids);
    const pre = await preview(ids, { name: 'نام بیپارتیشن' }).expect(200);
    const run = await execute(pre.body.operation_id, pre.body.preview_token).expect(200);
    expect(run.body.status).toBe('rejected');
    expect(run.body.outcome).toBe('rolled_back');
    expect(run.body.reason_code).toBe('audit_partition_missing');
    expect(run.body.message_fa).toContain('fn_ensure_partitions');
    expect(await versions(ids)).toEqual(before);
    const counts = await boundCounts(pre.body.operation_id);
    expect(counts.audit).toBe(0);
    expect(counts.history).toBe(0);
    expect(counts.evidence).toBe(0);
    const ledger = await fx.admin.query<{ status: string }>(
      `select status from product_bulk_operation where id=$1`, [pre.body.operation_id],
    );
    expect(ledger.rows[0].status).toBe('rejected');

    // TASK-PM-01D-M4-G / F-R-02: dms_app حتی EXECUTE روی تابع نگهداشت را هم
    // ندارد؛ ترمیم فقط با هویت مالک اشیاء (همان DATABASE_URL که مهاجرتها را
    // اعمال کرده؛ اینجا fx.admin) مجاز است، نه dms_migrator/dms_owner بیملکیت.
    const execProbe = await fx.admin.query<{ app_exec: boolean; migrator_exec: boolean }>(
      `select has_function_privilege('dms_app','public.fn_ensure_partitions(integer)','EXECUTE') as app_exec,
              has_function_privilege('dms_migrator','public.fn_ensure_partitions(integer)','EXECUTE') as migrator_exec`,
    );
    expect(execProbe.rows[0].app_exec).toBe(false);
    expect(execProbe.rows[0].migrator_exec).toBe(false);
    await expect(fx.appClient.query('select fn_ensure_partitions(2)')).rejects.toThrow();
    await fx.admin.query(`select fn_ensure_partitions(2)`);
    const restored = await fx.admin.query<{ ok: boolean }>(
      `select to_regclass($1) is not null as ok`, [month],
    );
    expect(restored.rows[0].ok).toBe(true);
    const policy = await fx.admin.query<{ n: number }>(
      `select count(*)::int as n from pg_policy where polname like 'p_audit_log_tenant%'`,
    );
    expect(policy.rows[0].n).toBeGreaterThan(0);
    const appSelect = await fx.admin.query<{ s: boolean }>(
      `select has_table_privilege('dms_app',$1,'SELECT') as s`, [month],
    );
    expect(appSelect.rows[0].s).toBe(true);

    // عملیات تازه پس از بوتاسترپ ممتاز موفق میشود.
    const ps2 = await mkProducts(1);
    const pre2 = await preview([ps2[0].id], { name: 'نام پس از بوتاسترپ' }).expect(200);
    const run2 = await execute(pre2.body.operation_id, pre2.body.preview_token).expect(200);
    expect(run2.body.status).toBe('committed');
    const counts2 = await boundCounts(pre2.body.operation_id);
    expect(counts2.audit).toBe(1);
    expect(counts2.evidence).toBe(1);
  });
});
