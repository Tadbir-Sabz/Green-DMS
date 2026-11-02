"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const vitest_1 = require("vitest");
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const node_url_1 = require("node:url");
const dotenv_1 = require("dotenv");
const pg_1 = __importDefault(require("pg"));
const supertest_1 = __importDefault(require("supertest"));
const yaml_1 = require("yaml");
const _2020_1 = __importDefault(require("ajv/dist/2020"));
const ajv_formats_1 = __importDefault(require("ajv-formats"));
const common_1 = require("@nestjs/common");
const testing_1 = require("@nestjs/testing");
const app_module_1 = require("../src/app.module");
const database_module_1 = require("../src/database/database.module");
const validation_1 = require("../src/common/validation");
const password_1 = require("../src/modules/identity-rbac/password");
/**
 * تست API مشتریان — /customers، /customers/{id} و PUT /customers/{id}/location
 * با همان گاردهای ماژول (AuthGuard + PermissionsGuard روی master.customer.* و
 * tracking.customer_geo.update):
 * ۱) دیتابیس موقت «greendms_customers_test» از صفر + همه مهاجرت‌ها
 * ۲) seed حداقلی: شرکت + شعبه، اشخاص (حقیقی و حقوقی)، ادمینِ همه‌مجوز و بیننده
 * ۳) بالا آوردن واقعی AppModule با همان ValidationPipe سراسری
 * ۴) اسناد HTTP با supertest + اعتبارسنجی بدنه‌ها با ajv (JSON Schema 2020-12)
 * ۵) assertion پوششی: همه خطاهای مستندشدهٔ /customers آزموده شده‌اند و هر خطای
 *    آزموده‌شده خودش در قرارداد هست
 * ۶) حذف دیتابیس در پایان (حتی در حالت شکست)
 */
const ROOT = node_path_1.default.resolve(node_path_1.default.dirname((0, node_url_1.fileURLToPath)(import.meta.url)), '..', '..', '..');
(0, dotenv_1.config)({ path: node_path_1.default.join(ROOT, '.env'), quiet: true });
const TEST_DB = 'greendms_customers_test';
const PSQL = process.env.PSQL ?? 'C:/Program Files/PostgreSQL/16/bin/psql.exe';
const SPEC_FILE = node_path_1.default.join(ROOT, 'packages', 'contracts', 'openapi.yaml');
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
let adminPool;
let pool;
let app;
const ADMIN_USER = 'cust_admin';
const ADMIN_PASSWORD = 'S3cret!pass';
const VIEWER_USER = 'cust_viewer';
const VIEWER_PASSWORD = 'View!pass1';
let adminToken = '';
let viewerToken = '';
let companyId = '';
let personId1 = '';
let personId2 = '';
let customerId = '';
/** همه پاسخ‌های خطایی که واقعاً آزموده شده‌اند — مبنای assertion پوششی /customers */
const exercisedErrors = new Set();
let spec;
let ajv;
const api = (token) => {
    const base = (0, supertest_1.default)(app.getHttpServer());
    const use = token === undefined ? adminToken : token;
    const verb = (method) => (url) => {
        const req = base[method](url);
        return use ? req.set('Authorization', `Bearer ${use}`) : req;
    };
    return { get: verb('get'), post: verb('post'), patch: verb('patch'), put: verb('put') };
};
const login = async (username, password) => {
    const res = await (0, supertest_1.default)(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username, password })
        .expect(200);
    return res.body.access_token;
};
/** ارجاع JSON Pointer داخل سند (برای resolve کردن $ref) */
const resolvePointer = (doc, ref) => ref
    .replace(/^#\//, '')
    .split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((node, seg) => (node == null ? node : node[seg]), doc);
/** اعتبارسنجی بدنه پاسخ علیه اسکیمای همان پاسخ در openapi.yaml (مثل تست قرارداد) */
const expectBodyMatchesSchema = (method, contractPath, status, body) => {
    const responses = spec.paths[contractPath]?.[method]?.responses ?? {};
    (0, vitest_1.expect)(Object.keys(responses), `کد ${status} برای ${method.toUpperCase()} ${contractPath} در قرارداد نیست (تعریف‌شده: ${Object.keys(responses).join(', ')})`).toContain(String(status));
    const responseNode = responses[String(status)];
    const baseRef = typeof responseNode.$ref === 'string'
        ? responseNode.$ref
        : `#/paths/${contractPath.replace(/\//g, '~1')}/${method}/responses/${status}`;
    const resolved = resolvePointer(spec, baseRef);
    const schemaNode = resolved?.content?.['application/json']?.schema;
    if (!schemaNode)
        return; // پاسخ بدون بدنه
    const pointer = `${baseRef}/content/application~1json/schema`;
    const validate = ajv.getSchema(`openapi${pointer}`);
    (0, vitest_1.expect)(validate, `اسکیمای ${pointer} در ajv کامپایل نشد`).toBeTruthy();
    const ok = validate(body);
    if (!ok) {
        console.error(`✗ ناسازگاری قرارداد ${method.toUpperCase()} ${contractPath} → ${status}:`, JSON.stringify(validate.errors, null, 2));
    }
    (0, vitest_1.expect)(ok, `بدنه پاسخ با اسکیمای قرارداد نمی‌خواند (${pointer})`).toBe(true);
    exercisedErrors.add(`${method.toUpperCase()} ${contractPath} ${status}`);
};
(0, vitest_1.beforeAll)(async () => {
    // ۱) دیتابیس موقت تمیز
    adminPool = new pg_1.default.Pool({ connectionString: adminUrl.toString(), max: 1 });
    await adminPool.query('select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()', [TEST_DB]);
    await adminPool.query(`drop database if exists "${TEST_DB}"`);
    await adminPool.query(`create database "${TEST_DB}"`);
    // ۲) همه مهاجرت‌ها در یک تراکنش واحد (معادل psql -1)
    const files = (0, node_fs_1.readdirSync)(node_path_1.default.join(ROOT, 'migrations'))
        .filter((f) => f.endsWith('.up.sql'))
        .sort()
        .flatMap((f) => ['-f', node_path_1.default.join(ROOT, 'migrations', f)]);
    (0, node_child_process_1.execFileSync)(PSQL, [...psqlBase, '-d', TEST_DB, '-1', '-q', ...files], {
        env: psqlEnv,
        stdio: 'pipe',
    });
    // ۳) seed حداقلی
    pool = new pg_1.default.Pool({ connectionString: testUrl.toString(), max: 1 });
    const adminHash = await (0, password_1.hashPassword)(ADMIN_PASSWORD);
    const viewerHash = await (0, password_1.hashPassword)(VIEWER_PASSWORD);
    const company = await pool.query(`insert into company (code, legal_name) values ('CUSTCO', 'شرکت تست مشتریان') returning id`);
    companyId = company.rows[0].id;
    await pool.query(`insert into branch (company_id, code, name) values ($1, 'MAIN', 'شعبه مرکزی')`, [companyId]);
    // ادمین با همه مجوزها + بینندهٔ بدون مجوز مشتری (برای 403)
    const adminPerson = await pool.query(`insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'ADM-1', 'natural', 'مدیر', 'سیستم') returning id`, [companyId]);
    await pool.query(`insert into app_user (person_id, username, password_hash, access_level)
     values ($1, $2, $3, 'web')`, [adminPerson.rows[0].id, ADMIN_USER, adminHash]);
    const adminRole = await pool.query(`insert into role (company_id, code, name) values ($1, 'admin_full', 'مدیر کامل') returning id`, [companyId]);
    await pool.query(`insert into role_permission (role_id, permission_code)
     select $1, code from permission`, [adminRole.rows[0].id]);
    await pool.query(`insert into user_role (app_user_id, role_id)
     select u.id, $1 from app_user u where u.username = $2`, [adminRole.rows[0].id, ADMIN_USER]);
    const viewerRole = await pool.query(`insert into role (company_id, code, name) values ($1, 'viewer', 'بیننده') returning id`, [companyId]);
    await pool.query(`insert into role_permission (role_id, permission_code)
     select $1, code from permission where code = 'master.product.view'`, [viewerRole.rows[0].id]);
    const viewerPerson = await pool.query(`insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'VW-1', 'natural', 'بیننده', 'آزمایشی') returning id`, [companyId]);
    await pool.query(`insert into app_user (person_id, username, password_hash, access_level)
     values ($1, $2, $3, 'web')`, [viewerPerson.rows[0].id, VIEWER_USER, viewerHash]);
    await pool.query(`insert into user_role (app_user_id, role_id)
     select u.id, $1 from app_user u where u.username = $2`, [viewerRole.rows[0].id, VIEWER_USER]);
    // اشخاصِ موضوع مشتری — دو حقیقی و یک حقوقی
    // نام حقوقی باید همراه ردیف باشد؛ قید ck_person_name اجازهٔ ردیف بدون نام نمی‌دهد
    await pool.query(`insert into person (company_id, code, legal_type, first_name, last_name, legal_name)
     values ($1, 'CP-1', 'natural', 'مشتری', 'اول', null),
            ($1, 'CP-2', 'natural', 'مشتری', 'دوم', null),
            ($1, 'CL-1', 'legal', null, null, 'شرکت پخش حقوقی')`, [companyId]);
    personId1 = (await pool.query(`select id from person where company_id = $1 and code = 'CP-1'`, [companyId])).rows[0].id;
    personId2 = (await pool.query(`select id from person where company_id = $1 and code = 'CP-2'`, [companyId])).rows[0].id;
    // ۴) اپ واقعی با همان پایپ سراسری
    process.env.DATABASE_URL = testUrl.toString();
    const moduleRef = await testing_1.Test.createTestingModule({ imports: [app_module_1.AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });
    app.useGlobalPipes(new common_1.ValidationPipe(validation_1.validationPipeOptions));
    await app.init();
    // سند قرارداد + اعتبارسنج JSON Schema 2020-12 (سازگار با OpenAPI 3.1)
    spec = (0, yaml_1.parse)((0, node_fs_1.readFileSync)(SPEC_FILE, 'utf8'));
    ajv = new _2020_1.default({ strict: false, allErrors: true });
    (0, ajv_formats_1.default)(ajv);
    ajv.addSchema(spec, 'openapi');
    adminToken = await login(ADMIN_USER, ADMIN_PASSWORD);
    viewerToken = await login(VIEWER_USER, VIEWER_PASSWORD);
}, 180_000);
(0, vitest_1.afterAll)(async () => {
    const appPool = app?.get(database_module_1.PG_POOL);
    await app?.close();
    await appPool?.end();
    await pool?.end();
    if (adminPool) {
        await adminPool.query('select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()', [TEST_DB]);
        await adminPool.query(`drop database if exists "${TEST_DB}"`);
        await adminPool.end();
    }
}, 60_000);
(0, vitest_1.describe)('C — گاردها: 401 بدون توکن و 403 بدون مجوز (هر پنج عملیات)', () => {
    const missing = '11111111-1111-4111-8111-111111111111';
    (0, vitest_1.it)('بدون توکن 401 ← Error', async () => {
        expectBodyMatchesSchema('get', '/customers', 401, (await api(null).get('/api/v1/customers').expect(401)).body);
        expectBodyMatchesSchema('post', '/customers', 401, (await api(null).post('/api/v1/customers').send({ person_id: personId1, code: 'X' }).expect(401))
            .body);
        expectBodyMatchesSchema('get', '/customers/{id}', 401, (await api(null).get(`/api/v1/customers/${missing}`).expect(401)).body);
        expectBodyMatchesSchema('patch', '/customers/{id}', 401, (await api(null).patch(`/api/v1/customers/${missing}`).send({ channel: 'retail' }).expect(401))
            .body);
        expectBodyMatchesSchema('put', '/customers/{id}/location', 401, (await api(null)
            .put(`/api/v1/customers/${missing}/location`)
            .send({ geo: { type: 'Point', coordinates: [51.39, 35.69] } })
            .expect(401)).body);
    });
    (0, vitest_1.it)('بدون مجوز 403 ← Error با جزئیات مجوز خواسته‌شده', async () => {
        const viewer = { Authorization: `Bearer ${viewerToken}` };
        const assertForbidden = (b) => {
            (0, vitest_1.expect)(b.code).toBe('forbidden');
            (0, vitest_1.expect)(b.details?.required?.[0]).toMatch(/^(master\.customer\.|tracking\.customer_geo)/);
        };
        const list = await api(null).get('/api/v1/customers').set(viewer).expect(403);
        expectBodyMatchesSchema('get', '/customers', 403, list.body);
        assertForbidden(list.body);
        const create = await api(null)
            .post('/api/v1/customers')
            .set(viewer)
            .send({ person_id: personId1, code: 'NOPE-1' })
            .expect(403);
        expectBodyMatchesSchema('post', '/customers', 403, create.body);
        assertForbidden(create.body);
        const get = await api(null).get(`/api/v1/customers/${missing}`).set(viewer).expect(403);
        expectBodyMatchesSchema('get', '/customers/{id}', 403, get.body);
        assertForbidden(get.body);
        const patch = await api(null)
            .patch(`/api/v1/customers/${missing}`)
            .set(viewer)
            .send({ channel: 'retail' })
            .expect(403);
        expectBodyMatchesSchema('patch', '/customers/{id}', 403, patch.body);
        assertForbidden(patch.body);
        const loc = await api(null)
            .put(`/api/v1/customers/${missing}/location`)
            .set(viewer)
            .send({ geo: { type: 'Point', coordinates: [51.39, 35.69] } })
            .expect(403);
        expectBodyMatchesSchema('put', '/customers/{id}/location', 403, loc.body);
        assertForbidden(loc.body);
    });
});
(0, vitest_1.describe)('C — CRUD مشتریان علیه قرارداد', () => {
    (0, vitest_1.it)('لیست 200 ← Page + items[Customer]', async () => {
        const res = await api().get('/api/v1/customers').expect(200);
        expectBodyMatchesSchema('get', '/customers', 200, res.body);
        (0, vitest_1.expect)(res.body).toHaveProperty('next_cursor');
        (0, vitest_1.expect)(res.body).toHaveProperty('has_more');
        (0, vitest_1.expect)(Array.isArray(res.body.items)).toBe(true);
    });
    (0, vitest_1.it)('فیلتر نامعتبر کانال 400 ← Error (قید اعتبارسنجی query)', async () => {
        const res = await api().get('/api/v1/customers').query({ channel: 'bogus' }).expect(400);
        expectBodyMatchesSchema('get', '/customers', 400, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('validation_failed');
        (0, vitest_1.expect)(res.body.details.fields.channel[0]).toMatch(/[؀-ۿ]/);
    });
    (0, vitest_1.it)('ساخت مشتری 201 ← Customer (شعبه پیش‌فرض شرکت)', async () => {
        const res = await api()
            .post('/api/v1/customers')
            .send({
            person_id: personId1,
            code: 'CUST-01',
            channel: 'retail',
            credit_limit: '5000000',
        })
            .expect(201);
        expectBodyMatchesSchema('post', '/customers', 201, res.body);
        customerId = res.body.id;
        (0, vitest_1.expect)(res.body.code).toBe('CUST-01');
        (0, vitest_1.expect)(res.body.status).toBe('active');
        (0, vitest_1.expect)(res.body).toHaveProperty('branch_id');
        (0, vitest_1.expect)(res.body).toHaveProperty('credit_limit');
    });
    (0, vitest_1.it)('ساخت بدون person_id 400 ← validation_failed با پیام فارسی', async () => {
        const res = await api().post('/api/v1/customers').send({ code: 'CUST-NO-P' }).expect(400);
        expectBodyMatchesSchema('post', '/customers', 400, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('validation_failed');
        (0, vitest_1.expect)(res.body.details.fields.person_id[0]).toMatch(/[؀-ۿ]/);
    });
    (0, vitest_1.it)('شخصِ ناموجود 400 ← person_not_found (ارجاع باید مال همین شرکت باشد)', async () => {
        const res = await api()
            .post('/api/v1/customers')
            .send({
            person_id: '22222222-2222-4222-8222-222222222222',
            code: 'CUST-BAD-P',
        })
            .expect(400);
        expectBodyMatchesSchema('post', '/customers', 400, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('person_not_found');
        (0, vitest_1.expect)(res.body.message_fa).toMatch(/[؀-ۿ]/);
    });
    (0, vitest_1.it)('کد تکراری در شعبه 409 ← duplicate_code', async () => {
        const res = await api()
            .post('/api/v1/customers')
            .send({ person_id: personId2, code: 'CUST-01' })
            .expect(409);
        expectBodyMatchesSchema('post', '/customers', 409, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('duplicate_code');
    });
    (0, vitest_1.it)('شخصِ تکراری 409 ← duplicate_person (هر شخص فقط یک ردیف مشتری دارد)', async () => {
        const res = await api()
            .post('/api/v1/customers')
            .send({ person_id: personId1, code: 'CUST-01-B' })
            .expect(409);
        expectBodyMatchesSchema('post', '/customers', 409, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('duplicate_person');
    });
    (0, vitest_1.it)('جزئیات 200 ← Customer؛ شناسه خراب 400 و ناموجود 404 ← Error', async () => {
        const detail = await api().get(`/api/v1/customers/${customerId}`).expect(200);
        expectBodyMatchesSchema('get', '/customers/{id}', 200, detail.body);
        (0, vitest_1.expect)(detail.body.person_id).toBe(personId1);
        const invalid = await api().get('/api/v1/customers/abc').expect(400);
        expectBodyMatchesSchema('get', '/customers/{id}', 400, invalid.body);
        (0, vitest_1.expect)(invalid.body.code).toBe('invalid_id');
        const missing = await api()
            .get('/api/v1/customers/11111111-1111-4111-8111-111111111111')
            .expect(404);
        expectBodyMatchesSchema('get', '/customers/{id}', 404, missing.body);
    });
    (0, vitest_1.it)('ویرایش 200 ← Customer؛ شناسه خراب 400 و ناموجود 404 ← Error', async () => {
        const patched = await api()
            .patch(`/api/v1/customers/${customerId}`)
            .send({ channel: 'wholesale', credit_limit: '8000000' })
            .expect(200);
        expectBodyMatchesSchema('patch', '/customers/{id}', 200, patched.body);
        (0, vitest_1.expect)(patched.body.channel).toBe('wholesale');
        const invalid = await api()
            .patch('/api/v1/customers/abc')
            .send({ channel: 'retail' })
            .expect(400);
        expectBodyMatchesSchema('patch', '/customers/{id}', 400, invalid.body);
        const missing = await api()
            .patch('/api/v1/customers/11111111-1111-4111-8111-111111111111')
            .send({ channel: 'retail' })
            .expect(404);
        expectBodyMatchesSchema('patch', '/customers/{id}', 404, missing.body);
    });
    (0, vitest_1.it)('مشتری دوم با شخص حقوقی 201 ← Customer', async () => {
        const legal = await pool.query(`select id from person where company_id = $1 and code = 'CL-1'`, [companyId]);
        const res = await api()
            .post('/api/v1/customers')
            .send({ person_id: legal.rows[0].id, code: 'CUST-L1', channel: 'chain' })
            .expect(201);
        expectBodyMatchesSchema('post', '/customers', 201, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('CUST-L1');
        (0, vitest_1.expect)(res.body.person_id).toBe(legal.rows[0].id);
    });
});
(0, vitest_1.describe)('C — PUT /customers/{id}/location (موقعیت روی نقشه)', () => {
    (0, vitest_1.it)('ثبت موقعیت 200 ← Customer با geo و منبع', async () => {
        const res = await api()
            .put(`/api/v1/customers/${customerId}/location`)
            .send({
            geo: { type: 'Point', coordinates: [51.389, 35.689] },
            accuracy_m: 12,
            source: 'gps',
        })
            .expect(200);
        expectBodyMatchesSchema('put', '/customers/{id}/location', 200, res.body);
        (0, vitest_1.expect)(res.body.geo?.coordinates).toEqual([51.389, 35.689]);
        (0, vitest_1.expect)(res.body.geo_source).toBe('gps');
        (0, vitest_1.expect)(res.body).toHaveProperty('geo_captured_at');
    });
    (0, vitest_1.it)('مختصات خارج از محدوده 400 ← invalid_geo با details.fields', async () => {
        const res = await api()
            .put(`/api/v1/customers/${customerId}/location`)
            .send({ geo: { type: 'Point', coordinates: [500, 35.6] }, source: 'gps' })
            .expect(400);
        expectBodyMatchesSchema('put', '/customers/{id}/location', 400, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('invalid_geo');
        (0, vitest_1.expect)(res.body.details.fields.geo[0]).toMatch(/[؀-ۿ]/);
    });
    (0, vitest_1.it)('بدون geo 400 ← validation_failed (فیلد الزامی فارسی)', async () => {
        const res = await api().put(`/api/v1/customers/${customerId}/location`).send({}).expect(400);
        expectBodyMatchesSchema('put', '/customers/{id}/location', 400, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('validation_failed');
        (0, vitest_1.expect)(res.body.details.fields.geo[0]).toContain('الزامی');
    });
    (0, vitest_1.it)('مشتری ناموجود 404 ← Error و شناسه خراب 400 ← Error', async () => {
        const missing = await api()
            .put('/api/v1/customers/11111111-1111-4111-8111-111111111111/location')
            .send({ geo: { type: 'Point', coordinates: [51.39, 35.69] }, source: 'gps' })
            .expect(404);
        expectBodyMatchesSchema('put', '/customers/{id}/location', 404, missing.body);
        const invalid = await api()
            .put('/api/v1/customers/abc/location')
            .send({ geo: { type: 'Point', coordinates: [51.39, 35.69] }, source: 'gps' })
            .expect(400);
        expectBodyMatchesSchema('put', '/customers/{id}/location', 400, invalid.body);
        (0, vitest_1.expect)(invalid.body.code).toBe('invalid_id');
    });
    (0, vitest_1.it)('فیلتر has_location بعد از ثبت موقعیت', async () => {
        const withGeo = await api()
            .get('/api/v1/customers')
            .query({ has_location: 'true' })
            .expect(200);
        expectBodyMatchesSchema('get', '/customers', 200, withGeo.body);
        (0, vitest_1.expect)(withGeo.body.items.map((c) => c.code)).toContain('CUST-01');
        (0, vitest_1.expect)(withGeo.body.items.every((c) => c.geo != null)).toBe(true);
    });
});
(0, vitest_1.describe)('C — پوشش خطاهای مستندشدهٔ /customers', () => {
    (0, vitest_1.it)('همه خطاهای مستندشده در همین فایل آزموده شده‌اند', () => {
        const ops = [
            ['get', '/customers'],
            ['post', '/customers'],
            ['get', '/customers/{id}'],
            ['patch', '/customers/{id}'],
            ['put', '/customers/{id}/location'],
        ];
        const documented = new Set();
        for (const [method, contractPath] of ops) {
            const responses = spec.paths[contractPath]?.[method]?.responses ?? {};
            (0, vitest_1.expect)(Object.keys(responses).length, `${method} ${contractPath} در سند نیست`).toBeGreaterThan(0);
            for (const status of Object.keys(responses)) {
                if (Number(status) >= 400)
                    documented.add(`${method.toUpperCase()} ${contractPath} ${status}`);
            }
        }
        (0, vitest_1.expect)(documented.size).toBeGreaterThan(0);
        const missed = [...documented].filter((key) => !exercisedErrors.has(key));
        (0, vitest_1.expect)(missed, `این خطاهای مستندشدهٔ /customers هنوز آزموده نشده‌اند:\n  ${missed.join('\n  ')}`).toEqual([]);
        const stray = [...exercisedErrors].filter((key) => ops.some(([m, p]) => key.startsWith(`${m.toUpperCase()} ${p} `)) &&
            Number(key.split(' ').at(-1)) >= 400 &&
            !documented.has(key));
        (0, vitest_1.expect)(stray, `پاسخ خطای آزموده‌شده خارج از قرارداد:\n  ${stray.join('\n  ')}`).toEqual([]);
    });
});
//# sourceMappingURL=customers.api.test.js.map