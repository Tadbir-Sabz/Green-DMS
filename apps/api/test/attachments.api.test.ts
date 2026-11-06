import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';
import request from 'supertest';
import { parse } from 'yaml';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import type { ValidateFunction } from 'ajv';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { PG_POOL } from '../src/database/database.module';
import { validationPipeOptions } from '../src/common/validation';
import { hashPassword } from '../src/modules/identity-rbac/password';

/**
 * تستِ سرتاسریِ خطِ لولهٔ آپلود ضمیمه (ماژول attachments) با سرویسِ زنده:
 *   ۱) دیتابیس موقت «greendms_attachments_test» از صفر + همهٔ مهاجرت‌ها ( incl. 0035)
 *   ۲) MinIO واقعی (در CI با docker بالا می‌آید) — round-trip بایت‌ها از آبجکت‌استوریج
 *   ۳) POST /attachments (multipart) و GET /attachments/{id}/url با گاردهای AuthGuard/
 *      PermissionsGuard، اعتبارسنجی بدنه با ajv در برابر قرارداد، جداسازی اجاره‌ها
 *      (شرکت B نمی‌تواند ضمیمهٔ شرکت A را بگیرد) و خطاهای ۴۰۱/۴۰۳/۴۰۴/۴۱۵.
 *
 * این تست به Postgres+PostGIS و MinIO زنده نیاز دارد (مانند سایر *.api.test.ts) و در
 * CI اجرا می‌شود؛ منطقِ خالصِ سرویس هم در attachments.test.ts (بدون DB/MinIO) پوشش دارد.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_attachments_test';
const PSQL = process.env.PSQL ?? 'C:/Program Files/PostgreSQL/16/bin/psql.exe';
const SPEC_FILE = path.join(ROOT, 'packages', 'contracts', 'openapi.yaml');

const adminUrl = new URL(process.env.DATABASE_URL ?? '');
const testUrl = new URL(adminUrl);
testUrl.pathname = `/${TEST_DB}`;
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

let adminPool: pg.Pool;
let pool: pg.Pool;
let app: INestApplication;

const ADMIN_USER = 'att_admin';
const ADMIN_PASSWORD = 'S3cret!pass';
const OTHER_USER = 'att_other';
const OTHER_PASSWORD = 'Other!pass1';
const VIEWER_USER = 'att_viewer';
const VIEWER_PASSWORD = 'View!pass1';

let adminToken = '';
let otherToken = '';
let viewerToken = '';
let companyId = '';
let otherCompanyId = '';
let podOwnerId = '';

// یک PNG کوچک (بایت‌های معین) برای round-trip؛ محتوا لازم نیست PNG معتبر باشد،
// فقط نوعِ mime (از پسوند .png) و یکسان‌ماندنِ بایت‌ها پس از بازیابی سنجیده می‌شود.
/**
 * یک PNG «ساختارمعتبرِ» حداقلی: امضای ۸ بایتی + چانکِ کاملِ IHDR.
 *
 * پیش‌تر این fixture فقط ۱۶ بایت بود (امضا + چند بایتِ دلخواه). از آنجا که سرویس اکنون
 * محتوایِ واقعی را با magic bytes و حداقلِ ساختار راستی‌آزمایی می‌کند، آن بایت‌ها به‌درستی
 * «مخدوش» تشخیص داده می‌شدند و round-trip واقعیِ آپلود شکست می‌خورد.
 */
const PNG_BYTES = (() => {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); // طولِ دادهٔ IHDR
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(1, 16); // width
  b.writeUInt32BE(1, 20); // height
  b[24] = 8; // bit depth
  b[25] = 2; // color type: RGB
  b[26] = 0; // compression
  b[27] = 0; // filter
  b[28] = 0; // interlace
  return b;
})();

const exercisedErrors = new Set<string>();

interface SpecDoc {
  paths: Record<string, Record<string, any>>;
  [key: string]: unknown;
}
let spec: SpecDoc;
let ajv: Ajv2020;

const login = async (username: string, password: string): Promise<string> => {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ username, password })
    .expect(200);
  return res.body.access_token as string;
};

const resolvePointer = (doc: unknown, ref: string): any =>
  ref
    .replace(/^#\//, '')
    .split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((node, seg) => (node == null ? node : node[seg]), doc);

const expectBodyMatchesSchema = (
  method: string,
  contractPath: string,
  status: number,
  body: unknown,
): void => {
  const responses = spec.paths[contractPath]?.[method]?.responses ?? {};
  expect(
    Object.keys(responses),
    `کد ${status} برای ${method.toUpperCase()} ${contractPath} در قرارداد نیست`,
  ).toContain(String(status));

  const responseNode = responses[String(status)];
  const baseRef: string =
    typeof responseNode.$ref === 'string'
      ? responseNode.$ref
      : `#/paths/${contractPath.replace(/\//g, '~1')}/${method}/responses/${status}`;
  const resolved = resolvePointer(spec, baseRef);
  const schemaNode = resolved?.content?.['application/json']?.schema;
  if (!schemaNode) return;

  const pointer = `${baseRef}/content/application~1json/schema`;
  const validate = ajv.getSchema(`openapi${pointer}`) as ValidateFunction | undefined;
  expect(validate, `اسکیمای ${pointer} در ajv کامپایل نشد`).toBeTruthy();
  const ok = validate!(body);
  if (!ok) {
    console.error(
      `✗ ناسازگاری قرارداد ${method.toUpperCase()} ${contractPath} → ${status}:`,
      JSON.stringify(validate!.errors, null, 2),
    );
  }
  expect(ok, `بدنهٔ پاسخ با اسکیمای قرارداد نمی‌خواند (${pointer})`).toBe(true);
  if (status >= 400) exercisedErrors.add(`${method.toUpperCase()} ${contractPath} ${status}`);
};

/** آپلود multipart با توکنِ داده‌شده. */
const upload = (token: string | null, opts: {
  bytes: Buffer;
  filename: string;
  contentType?: string;
  owner_type: string;
  owner_id: string;
}) => {
  let req = request(app.getHttpServer()).post('/api/v1/attachments');
  if (token) req = req.set('Authorization', `Bearer ${token}`);
  const attach = opts.contentType
    ? req.attach('file', opts.bytes, { filename: opts.filename, contentType: opts.contentType })
    : req.attach('file', opts.bytes, opts.filename);
  return attach.field('owner_type', opts.owner_type).field('owner_id', opts.owner_id);
};

beforeAll(async () => {
  // MinIO باید در دسترس باشد (در CI با docker). مقادیر پیش‌فرض هم‌خوان با ci.yml.
  process.env.MINIO_ENDPOINT ??= 'localhost:9000';
  process.env.MINIO_ACCESS_KEY ??= 'minio';
  process.env.MINIO_SECRET_KEY ??= 'minio123';
  process.env.MINIO_BUCKET ??= 'greendms';
  process.env.MINIO_USE_SSL ??= 'false';

  adminPool = new pg.Pool({ connectionString: adminUrl.toString(), max: 1 });
  await adminPool.query(
    'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
    [TEST_DB],
  );
  await adminPool.query(`drop database if exists "${TEST_DB}"`);
  await adminPool.query(`create database "${TEST_DB}"`);

  const files = readdirSync(path.join(ROOT, 'migrations'))
    .filter((f) => f.endsWith('.up.sql'))
    .sort()
    .flatMap((f) => ['-f', path.join(ROOT, 'migrations', f)]);
  execFileSync(PSQL, [...psqlBase, '-d', TEST_DB, '-1', '-q', ...files], {
    env: psqlEnv,
    stdio: 'pipe',
  });

  pool = new pg.Pool({ connectionString: testUrl.toString(), max: 1 });
  const adminHash = await hashPassword(ADMIN_PASSWORD);
  const otherHash = await hashPassword(OTHER_PASSWORD);
  const viewerHash = await hashPassword(VIEWER_PASSWORD);

  // شرکت A (ادمینِ همه‌مجوز) + شرکت B (ادمینِ همه‌مجوز، برای تست جداسازی اجاره)
  const company = await pool.query<{ id: string }>(
    `insert into company (code, legal_name) values ('ATTCO', 'شرکت تست ضمیمه') returning id`,
  );
  companyId = company.rows[0].id;
  const otherCompany = await pool.query<{ id: string }>(
    `insert into company (code, legal_name) values ('ATTOTHER', 'شرکت دیگر تست ضمیمه') returning id`,
  );
  otherCompanyId = otherCompany.rows[0].id;

  const seedAdmin = async (
    coId: string,
    username: string,
    hash: string,
    personCode: string,
    roleCode: string,
  ) => {
    const person = await pool.query<{ id: string }>(
      `insert into person (company_id, code, legal_type, first_name, last_name)
       values ($1, $2, 'natural', 'مدیر', 'ضمیمه') returning id`,
      [coId, personCode],
    );
    await pool.query(
      `insert into app_user (person_id, username, password_hash, access_level) values ($1, $2, $3, 'web')`,
      [person.rows[0].id, username, hash],
    );
    const role = await pool.query<{ id: string }>(
      `insert into role (company_id, code, name) values ($1, $2, 'مدیر کامل') returning id`,
      [coId, roleCode],
    );
    // همهٔ مجوزها (شامل attachment.upload/attachment.view از مهاجرت 0035)
    await pool.query(
      `insert into role_permission (role_id, permission_code) select $1, code from permission`,
      [role.rows[0].id],
    );
    await pool.query(
      `insert into user_role (app_user_id, role_id) select u.id, $1 from app_user u where u.username = $2`,
      [role.rows[0].id, username],
    );
  };

  await seedAdmin(companyId, ADMIN_USER, adminHash, 'ATT-ADM', 'admin_full');
  await seedAdmin(otherCompanyId, OTHER_USER, otherHash, 'ATT-OTH', 'admin_full_other');

  // بیننده بدون مجوز ضمیمه (فقط master.product.view) → برای تست ۴۰۳
  const viewerRole = await pool.query<{ id: string }>(
    `insert into role (company_id, code, name) values ($1, 'viewer', 'بیننده') returning id`,
    [companyId],
  );
  await pool.query(
    `insert into role_permission (role_id, permission_code)
     select $1, code from permission where code = 'master.product.view'`,
    [viewerRole.rows[0].id],
  );
  const viewerPerson = await pool.query<{ id: string }>(
    `insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'ATT-VW', 'natural', 'بیننده', 'آزمایشی') returning id`,
    [companyId],
  );
  await pool.query(
    `insert into app_user (person_id, username, password_hash, access_level) values ($1, $2, $3, 'web')`,
    [viewerPerson.rows[0].id, VIEWER_USER, viewerHash],
  );
  await pool.query(
    `insert into user_role (app_user_id, role_id) select u.id, $1 from app_user u where u.username = $2`,
    [viewerRole.rows[0].id, VIEWER_USER],
  );

  process.env.DATABASE_URL = testUrl.toString();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
  await app.init();

  spec = parse(readFileSync(SPEC_FILE, 'utf8')) as SpecDoc;
  ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  ajv.addSchema(spec, 'openapi');

  // TASK-19 — مالکِ واقعیِ POD: از TASK-14 سرویسِ ضمیمه پیش از هر دسترسی، «وجودِ
  // موجودیتِ مالک» را از زنجیرهٔ pod→delivery→branch اثبات می‌کند (404 owner_not_found
  // برایِ UUID ساختگی — رفتارِ امنیتیِ درست). پس fixture باید زنجیرهٔ واقعی بسازد،
  // نه اینکه تست با ownerِ تصادفی از کنارِ قراردادِ امنیتی رد شود.
  const seedPodOwner = async (coId: string): Promise<string> => {
    const branch = await pool.query<{ id: string }>(
      `insert into branch (company_id, code, name) values ($1, 'ATT-BR1', 'شعبهٔ تست ضمیمه') returning id`,
      [coId],
    );
    const customerPerson = await pool.query<{ id: string }>(
      `insert into person (company_id, code, legal_type, first_name, last_name)
       values ($1, 'ATT-CUS', 'natural', 'مشتری', 'تست ضمیمه') returning id`,
      [coId],
    );
    const customer = await pool.query<{ id: string }>(
      `insert into customer (person_id, branch_id, code) values ($1, $2, 'ATT-CUS') returning id`,
      [customerPerson.rows[0].id, branch.rows[0].id],
    );
    const warehouse = await pool.query<{ id: string }>(
      `insert into warehouse (branch_id, code, name) values ($1, 'ATT-WH1', 'انبار تست ضمیمه') returning id`,
      [branch.rows[0].id],
    );
    const waybill = await pool.query<{ id: string }>(
      `insert into waybill (branch_id, doc_number, fiscal_year, customer_id, warehouse_id)
       values ($1, 'ATT-WB-1', 1404, $2, $3) returning id`,
      [branch.rows[0].id, customer.rows[0].id, warehouse.rows[0].id],
    );
    const delivery = await pool.query<{ id: string }>(
      `insert into delivery (branch_id, doc_number, waybill_id, customer_id, planned_date)
       values ($1, 'ATT-DL-1', $2, $3, current_date) returning id`,
      [branch.rows[0].id, waybill.rows[0].id, customer.rows[0].id],
    );
    const pod = await pool.query<{ id: string }>(
      `insert into pod (delivery_id, received_by_name) values ($1, 'تحویل‌گیرندهٔ تست') returning id`,
      [delivery.rows[0].id],
    );
    return pod.rows[0].id;
  };
  podOwnerId = await seedPodOwner(companyId);

  adminToken = await login(ADMIN_USER, ADMIN_PASSWORD);
  otherToken = await login(OTHER_USER, OTHER_PASSWORD);
  viewerToken = await login(VIEWER_USER, VIEWER_PASSWORD);
}, 180_000);

afterAll(async () => {
  const appPool = app?.get<pg.Pool>(PG_POOL);
  await app?.close();
  await appPool?.end();
  await pool?.end();
  if (adminPool) {
    await adminPool.query(
      'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
      [TEST_DB],
    );
    await adminPool.query(`drop database if exists "${TEST_DB}"`);
    await adminPool.end();
  }
}, 60_000);

describe('ATT — گاردها', () => {
  it('۴۰۱ بدون توکن (POST و GET url)', async () => {
    const postRes = await upload(null, {
      bytes: PNG_BYTES, filename: 'pod.png', owner_type: 'pod', owner_id: crypto.randomUUID(),
    });
    const r1 = await postRes;
    expectBodyMatchesSchema('post', '/attachments', r1.status, r1.body);
    expect(r1.status).toBe(401);

    const r2 = await request(app.getHttpServer()).get(`/api/v1/attachments/${crypto.randomUUID()}/url`);
    expectBodyMatchesSchema('get', '/attachments/{id}/url', r2.status, r2.body);
    expect(r2.status).toBe(401);
  });

  it('۴۰۳ برای کاربر بدون attachment.upload', async () => {
    const r = await upload(viewerToken, {
      bytes: PNG_BYTES, filename: 'pod.png', owner_type: 'pod', owner_id: crypto.randomUUID(),
    });
    expectBodyMatchesSchema('post', '/attachments', r.status, r.body);
    expect(r.status).toBe(403);
  });
});

describe('ATT — round-trip آپلود و دانلود', () => {
  let attachmentId = '';

  it('۲۰۱ آپلود PNG → Attachment، ذخیرهٔ واقعی در MinIO و ثبت در DB', async () => {
    const ownerId = podOwnerId; // مالکِ واقعیِ seedشده (زنجیرهٔ pod→delivery→branch)
    const r = await upload(adminToken, {
      bytes: PNG_BYTES, filename: 'pod/shot.png', owner_type: 'pod', owner_id: ownerId,
    });
    expectBodyMatchesSchema('post', '/attachments', r.status, r.body);
    expect(r.status).toBe(201);
    attachmentId = r.body.id;

    expect(r.body.owner_type).toBe('pod');
    expect(r.body.owner_id).toBe(ownerId);
    expect(r.body.content_type).toBe('image/png');
    expect(r.body.size_bytes).toBe(PNG_BYTES.length);
    // لایهٔ HTTP: busboy/multer خودش basename را می‌گیرد (originalname='shot.png' به
    // سرویس می‌رسد)؛ پس قاعدهٔ «/»→«_»ِ sanitizeFileName در این لایه دیده نمی‌شود و
    // با تستِ واحدِ attachments.test.ts (pod_shot.jpg) پین شده است. خاصیتِ امنیتیِ
    // این سطح که باید برقرار بماند: هیچ جداکنندهٔ مسیری در نامِ ذخیره‌شده نیست.
    expect(r.body.file_name).toBe('shot.png');
    expect(r.body.file_name).not.toMatch(/[/\\]/);
    expect(r.body.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof r.body.url).toBe('string');

    // بایت‌ها واقعاً از آبجکت‌استوریج قابل بازیابی‌اند (round-trip با MinIO زنده)
    const fetched = await fetch(r.body.url);
    expect(fetched.status).toBe(200);
    const got = Buffer.from(await fetched.arrayBuffer());
    expect(got.equals(PNG_BYTES)).toBe(true);

    // در DB: company_id از نشست، storage_key نام‌فضاشده با company، uploaded_by درست
    const row = await pool.query(
      `select company_id, storage_key, uploaded_by, sha256 from attachment where id = $1`,
      [attachmentId],
    );
    expect(row.rowCount).toBe(1);
    expect(row.rows[0].company_id).toBe(companyId);
    expect(row.rows[0].storage_key.startsWith(`${companyId}/pod/${ownerId}/`)).toBe(true);
  });

  it('۲۰۰ GET /attachments/{id}/url → AttachmentUrl و لینکِ کارآمد', async () => {
    const r = await request(app.getHttpServer())
      .get(`/api/v1/attachments/${attachmentId}/url`)
      .set('Authorization', `Bearer ${adminToken}`);
    expectBodyMatchesSchema('get', '/attachments/{id}/url', r.status, r.body);
    expect(r.status).toBe(200);
    expect(typeof r.body.url).toBe('string');
    expect(r.body.expires_in).toBeGreaterThan(0);

    const fetched = await fetch(r.body.url);
    expect(fetched.status).toBe(200);
  });

  it('۴۰۴ برای ضمیمهٔ شرکتِ دیگر (جداسازی اجاره‌ها)', async () => {
    // ادمین شرکت B همان id را درخواست کند → چون company_id نمی‌خورد، ۴۰۴
    const r = await request(app.getHttpServer())
      .get(`/api/v1/attachments/${attachmentId}/url`)
      .set('Authorization', `Bearer ${otherToken}`);
    expectBodyMatchesSchema('get', '/attachments/{id}/url', r.status, r.body);
    expect(r.status).toBe(404);
  });

  it('۴۰۴ برای id نامعتبر/ناموجود', async () => {
    const r = await request(app.getHttpServer())
      .get(`/api/v1/attachments/${crypto.randomUUID()}/url`)
      .set('Authorization', `Bearer ${adminToken}`);
    expectBodyMatchesSchema('get', '/attachments/{id}/url', r.status, r.body);
    expect(r.status).toBe(404);
  });

  it('۴۱۵ برای نوعِ غیرمجاز', async () => {
    const r = await upload(adminToken, {
      bytes: Buffer.from('MZ-not-allowed'),
      filename: 'payload.exe',
      contentType: 'application/octet-stream',
      owner_type: 'pod',
      owner_id: crypto.randomUUID(),
    });
    expectBodyMatchesSchema('post', '/attachments', r.status, r.body);
    expect(r.status).toBe(415);
  });

  it('۴۰۰ برای owner_type نامعتبر (اعتبارسنجی DTO)', async () => {
    const r = await upload(adminToken, {
      bytes: PNG_BYTES, filename: 'x.png', owner_type: 'not_a_type', owner_id: crypto.randomUUID(),
    });
    expect(r.status).toBe(400);
  });

  it('همهٔ خطاهای مستندشدهٔ قرارداد پوشش داده شدند', () => {
    for (const e of [
      'POST /attachments 401',
      'POST /attachments 403',
      'POST /attachments 415',
      'GET /attachments/{id}/url 401',
      'GET /attachments/{id}/url 404',
    ]) {
      expect(exercisedErrors, `خطای ${e} پوشش داده نشد`).toContain(e);
    }
  });
});
