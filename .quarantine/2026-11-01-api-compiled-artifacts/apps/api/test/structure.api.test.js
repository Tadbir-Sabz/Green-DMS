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
 * تست API ساختار فروش: /areas و /routes با گاردهای ماژول
 * (master.structure.view/update).
 * ۱) دیتابیس موقت «greendms_structure_test» + مهاجرت‌ها
 * ۲) seed: شرکت، شعبه، کالا/مشتری برای ترتیب مسیر، ادمین همه‌مجوز و بیننده بدون مجوز ساختار
 * ۳) اعتبارسنجی ajv + assertion پوششی خطاهای مستندشده
 */
const ROOT = node_path_1.default.resolve(node_path_1.default.dirname((0, node_url_1.fileURLToPath)(import.meta.url)), '..', '..', '..');
(0, dotenv_1.config)({ path: node_path_1.default.join(ROOT, '.env'), quiet: true });
const TEST_DB = 'greendms_structure_test';
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
const ADMIN_USER = 'st_admin';
const ADMIN_PASSWORD = 'S3cret!pass';
const VIEWER_USER = 'st_viewer';
const VIEWER_PASSWORD = 'View!pass1';
let adminToken = '';
let viewerToken = '';
let companyId = '';
let areaId = '';
let routeId = '';
let otherAreaId = '';
const customerIds = [];
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
    return { get: verb('get'), post: verb('post'), patch: verb('patch') };
};
const login = async (username, password) => {
    const res = await (0, supertest_1.default)(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username, password })
        .expect(200);
    return res.body.access_token;
};
const resolvePointer = (doc, ref) => ref
    .replace(/^#\//, '')
    .split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((node, seg) => (node == null ? node : node[seg]), doc);
const expectBodyMatchesSchema = (method, contractPath, status, body) => {
    const responses = spec.paths[contractPath]?.[method]?.responses ?? {};
    (0, vitest_1.expect)(Object.keys(responses), `کد ${status} برای ${method.toUpperCase()} ${contractPath} در قرارداد نیست`).toContain(String(status));
    const responseNode = responses[String(status)];
    const baseRef = typeof responseNode.$ref === 'string'
        ? responseNode.$ref
        : `#/paths/${contractPath.replace(/\//g, '~1')}/${method}/responses/${status}`;
    const resolved = resolvePointer(spec, baseRef);
    const schemaNode = resolved?.content?.['application/json']?.schema;
    if (!schemaNode)
        return;
    const pointer = `${baseRef}/content/application~1json/schema`;
    const validate = ajv.getSchema(`openapi${pointer}`);
    (0, vitest_1.expect)(validate, `اسکیمای ${pointer} در ajv کامپایل نشد`).toBeTruthy();
    const ok = validate(body);
    if (!ok) {
        console.error(`✗ ناسازگاری قرارداد ${method.toUpperCase()} ${contractPath} → ${status}:`, JSON.stringify(validate.errors, null, 2));
    }
    (0, vitest_1.expect)(ok, `بدنه پاسخ با اسکیمای قرارداد نمی‌خواند (${pointer})`).toBe(true);
    if (status >= 400)
        exercisedErrors.add(`${method.toUpperCase()} ${contractPath} ${status}`);
};
(0, vitest_1.beforeAll)(async () => {
    adminPool = new pg_1.default.Pool({ connectionString: adminUrl.toString(), max: 1 });
    await adminPool.query('select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()', [TEST_DB]);
    await adminPool.query(`drop database if exists "${TEST_DB}"`);
    await adminPool.query(`create database "${TEST_DB}"`);
    const files = (0, node_fs_1.readdirSync)(node_path_1.default.join(ROOT, 'migrations'))
        .filter((f) => f.endsWith('.up.sql'))
        .sort()
        .flatMap((f) => ['-f', node_path_1.default.join(ROOT, 'migrations', f)]);
    (0, node_child_process_1.execFileSync)(PSQL, [...psqlBase, '-d', TEST_DB, '-1', '-q', ...files], {
        env: psqlEnv,
        stdio: 'pipe',
    });
    pool = new pg_1.default.Pool({ connectionString: testUrl.toString(), max: 1 });
    const adminHash = await (0, password_1.hashPassword)(ADMIN_PASSWORD);
    const viewerHash = await (0, password_1.hashPassword)(VIEWER_PASSWORD);
    const company = await pool.query(`insert into company (code, legal_name) values ('STCO', 'شرکت تست ساختار') returning id`);
    companyId = company.rows[0].id;
    await pool.query(`insert into branch (company_id, code, name) values ($1, 'MAIN', 'شعبه مرکزی')`, [companyId]);
    // ۳ مشتری برای ترتیب مسیر
    for (let i = 1; i <= 3; i += 1) {
        const person = await pool.query(`insert into person (company_id, code, legal_type, first_name, last_name)
       values ($1, $2, 'natural', 'مشتری', $3) returning id`, [companyId, `C-P-${i}`, `شماره ${i}`]);
        const customer = await pool.query(`insert into customer (person_id, branch_id, code) values ($1, (select id from branch where company_id = $2), $3) returning id`, [person.rows[0].id, companyId, `CU-${i}`]);
        customerIds.push(customer.rows[0].id);
    }
    // ادمین همه‌مجوز + بینندهٔ بدون مجوز ساختار
    const adminPerson = await pool.query(`insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'ADM-1', 'natural', 'مدیر', 'سیستم') returning id`, [companyId]);
    await pool.query(`insert into app_user (person_id, username, password_hash, access_level) values ($1, $2, $3, 'web')`, [adminPerson.rows[0].id, ADMIN_USER, adminHash]);
    const adminRole = await pool.query(`insert into role (company_id, code, name) values ($1, 'admin_full', 'مدیر کامل') returning id`, [companyId]);
    await pool.query(`insert into role_permission (role_id, permission_code) select $1, code from permission`, [adminRole.rows[0].id]);
    await pool.query(`insert into user_role (app_user_id, role_id) select u.id, $1 from app_user u where u.username = $2`, [adminRole.rows[0].id, ADMIN_USER]);
    const viewerRole = await pool.query(`insert into role (company_id, code, name) values ($1, 'viewer', 'بیننده') returning id`, [companyId]);
    await pool.query(`insert into role_permission (role_id, permission_code)
     select $1, code from permission where code = 'master.product.view'`, [viewerRole.rows[0].id]);
    const viewerPerson = await pool.query(`insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'VW-1', 'natural', 'بیننده', 'آزمایشی') returning id`, [companyId]);
    await pool.query(`insert into app_user (person_id, username, password_hash, access_level) values ($1, $2, $3, 'web')`, [viewerPerson.rows[0].id, VIEWER_USER, viewerHash]);
    await pool.query(`insert into user_role (app_user_id, role_id) select u.id, $1 from app_user u where u.username = $2`, [viewerRole.rows[0].id, VIEWER_USER]);
    process.env.DATABASE_URL = testUrl.toString();
    const moduleRef = await testing_1.Test.createTestingModule({ imports: [app_module_1.AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });
    app.useGlobalPipes(new common_1.ValidationPipe(validation_1.validationPipeOptions));
    await app.init();
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
const MISSING = '11111111-1111-4111-8111-111111111111';
(0, vitest_1.describe)('ST — 401 بدون توکن روی همه مسیرها', () => {
    (0, vitest_1.it)('areas و routes بدون توکن 401 ← Error', async () => {
        const cases = [
            ['get', '/areas', '/api/v1/areas'],
            ['post', '/areas', '/api/v1/areas', { code: 'X', name: 'X' }],
            ['get', '/areas/{id}', `/api/v1/areas/${MISSING}`],
            ['patch', '/areas/{id}', `/api/v1/areas/${MISSING}`, {}],
            ['get', '/routes', '/api/v1/routes'],
            ['post', '/routes', '/api/v1/routes', { area_id: MISSING, code: 'X', name: 'X' }],
            ['get', '/routes/{id}', `/api/v1/routes/${MISSING}`],
            ['patch', '/routes/{id}', `/api/v1/routes/${MISSING}`, {}],
        ];
        for (const [method, contractPath, url, body] of cases) {
            const m = method;
            let req = api(null)[m](url);
            if (body !== undefined)
                req = req.send(body);
            const res = await req.expect(401);
            expectBodyMatchesSchema(method, contractPath, 401, res.body);
        }
    });
});
(0, vitest_1.describe)('ST — 403 بدون مجوز روی همه مسیرها', () => {
    (0, vitest_1.it)('بیننده روی structure 403 ← Error با جزئیات مجوز', async () => {
        const viewer = { Authorization: `Bearer ${viewerToken}` };
        const cases = [
            ['get', '/areas', '/api/v1/areas'],
            ['post', '/areas', '/api/v1/areas', { code: 'X', name: 'X' }],
            ['get', '/areas/{id}', `/api/v1/areas/${MISSING}`],
            ['patch', '/areas/{id}', `/api/v1/areas/${MISSING}`, {}],
            ['get', '/routes', '/api/v1/routes'],
            ['post', '/routes', '/api/v1/routes', { area_id: MISSING, code: 'X', name: 'X' }],
            ['get', '/routes/{id}', `/api/v1/routes/${MISSING}`],
            ['patch', '/routes/{id}', `/api/v1/routes/${MISSING}`, {}],
        ];
        for (const [method, contractPath, url, body] of cases) {
            const m = method;
            let req = api(null)[m](url).set(viewer);
            if (body !== undefined)
                req = req.send(body);
            const res = await req.expect(403);
            expectBodyMatchesSchema(method, contractPath, 403, res.body);
            (0, vitest_1.expect)(res.body.code).toBe('forbidden');
            (0, vitest_1.expect)(res.body.details?.required?.[0]).toMatch(/^master\.structure\./);
        }
    });
});
(0, vitest_1.describe)('ST — /areas', () => {
    (0, vitest_1.it)('ساخت 201 ← Area با شعبهٔ پیش‌فرض', async () => {
        const res = await api().post('/api/v1/areas').send({ code: 'AR-1', name: 'حوزه مرکزی' }).expect(201);
        expectBodyMatchesSchema('post', '/areas', 201, res.body);
        areaId = res.body.id;
        (0, vitest_1.expect)(res.body.code).toBe('AR-1');
        (0, vitest_1.expect)(res.body.is_active).toBe(true);
        (0, vitest_1.expect)(res.body.parent_area_id).toBeNull();
        (0, vitest_1.expect)(res.body.branch_id).toBeTruthy();
    });
    (0, vitest_1.it)('ساخت فرزند با parent_area_id ← سلسله‌مراتب', async () => {
        const res = await api()
            .post('/api/v1/areas')
            .send({ code: 'AR-1-1', name: 'حوزه شمال', parent_area_id: areaId })
            .expect(201);
        expectBodyMatchesSchema('post', '/areas', 201, res.body);
        (0, vitest_1.expect)(res.body.parent_area_id).toBe(areaId);
    });
    (0, vitest_1.it)('بدون name 400 ← validation_failed', async () => {
        const res = await api().post('/api/v1/areas').send({ code: 'AR-NO-N' }).expect(400);
        expectBodyMatchesSchema('post', '/areas', 400, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('validation_failed');
    });
    (0, vitest_1.it)('کد تکراری در شعبه 409 ← duplicate_code', async () => {
        const res = await api().post('/api/v1/areas').send({ code: 'AR-1', name: 'تکراری' }).expect(409);
        expectBodyMatchesSchema('post', '/areas', 409, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('duplicate_code');
    });
    (0, vitest_1.it)('والد ناموجود 400 ← parent_area_not_found', async () => {
        const res = await api()
            .post('/api/v1/areas')
            .send({ code: 'AR-P', name: 'X', parent_area_id: MISSING })
            .expect(400);
        expectBodyMatchesSchema('post', '/areas', 400, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('parent_area_not_found');
    });
    (0, vitest_1.it)('شعبهٔ ناموجود 400 ← branch_not_found', async () => {
        const res = await api()
            .post('/api/v1/areas')
            .send({ code: 'AR-B', name: 'X', branch_id: MISSING })
            .expect(400);
        expectBodyMatchesSchema('post', '/areas', 400, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('branch_not_found');
    });
    (0, vitest_1.it)('فهرست 200 ← Page + items[Area]؛ فیلتر parent_area_id و limit نامعتبر 400', async () => {
        const list = await api().get('/api/v1/areas').expect(200);
        expectBodyMatchesSchema('get', '/areas', 200, list.body);
        (0, vitest_1.expect)(list.body.items.length).toBeGreaterThan(0);
        const children = await api().get('/api/v1/areas').query({ parent_area_id: areaId }).expect(200);
        expectBodyMatchesSchema('get', '/areas', 200, children.body);
        (0, vitest_1.expect)(children.body.items.every((a) => a.parent_area_id === areaId)).toBe(true);
        const bad = await api().get('/api/v1/areas').query({ limit: 999 }).expect(400);
        expectBodyMatchesSchema('get', '/areas', 400, bad.body);
    });
    (0, vitest_1.it)('جزئیات 200 ← Area؛ شناسه خراب 400 و ناموجود 404', async () => {
        const detail = await api().get(`/api/v1/areas/${areaId}`).expect(200);
        expectBodyMatchesSchema('get', '/areas/{id}', 200, detail.body);
        (0, vitest_1.expect)(detail.body.id).toBe(areaId);
        const bad = await api().get('/api/v1/areas/abc').expect(400);
        expectBodyMatchesSchema('get', '/areas/{id}', 400, bad.body);
        const miss = await api().get(`/api/v1/areas/${MISSING}`).expect(404);
        expectBodyMatchesSchema('get', '/areas/{id}', 404, miss.body);
    });
    (0, vitest_1.it)('ویرایش 200 ← Area (null کردن صریح parent)؛ خراب 400 و ناموجود 404', async () => {
        const child = await api()
            .get('/api/v1/areas')
            .query({ parent_area_id: areaId })
            .expect(200);
        const childId = child.body.items[0].id;
        // جدا کردن فرزند از والد (null صریح باید حفظ شود)
        const patched = await api()
            .patch(`/api/v1/areas/${childId}`)
            .send({ name: 'حوزه شمال (به‌روز)', parent_area_id: null })
            .expect(200);
        expectBodyMatchesSchema('patch', '/areas/{id}', 200, patched.body);
        (0, vitest_1.expect)(patched.body.name).toBe('حوزه شمال (به‌روز)');
        (0, vitest_1.expect)(patched.body.parent_area_id).toBeNull();
        const bad = await api().patch('/api/v1/areas/abc').send({ name: 'X' }).expect(400);
        expectBodyMatchesSchema('patch', '/areas/{id}', 400, bad.body);
        const miss = await api().patch(`/api/v1/areas/${MISSING}`).send({ name: 'X' }).expect(404);
        expectBodyMatchesSchema('patch', '/areas/{id}', 404, miss.body);
    });
    (0, vitest_1.it)('ویرایش با کد تکراری 409 ← duplicate_code', async () => {
        // کد فرزند (AR-1-1) در همان شعبه ثبت شده و تغییر کد والد به آن باید 409 بدهد
        const res = await api().patch(`/api/v1/areas/${areaId}`).send({ code: 'AR-1-1' }).expect(409);
        expectBodyMatchesSchema('patch', '/areas/{id}', 409, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('duplicate_code');
    });
});
(0, vitest_1.describe)('ST — /routes', () => {
    (0, vitest_1.it)('ساخت 201 ← Route با ترتیب مشتریان', async () => {
        const res = await api()
            .post('/api/v1/routes')
            .send({
            area_id: areaId,
            code: 'RT-1',
            name: 'مسیر مرکزی',
            visit_weekday: 0,
            customer_ids: [customerIds[2], customerIds[0], customerIds[1]],
        })
            .expect(201);
        expectBodyMatchesSchema('post', '/routes', 201, res.body);
        routeId = res.body.id;
        (0, vitest_1.expect)(res.body.code).toBe('RT-1');
        (0, vitest_1.expect)(res.body.visit_weekday).toBe(0);
        (0, vitest_1.expect)(res.body.customer_ids).toEqual([customerIds[2], customerIds[0], customerIds[1]]);
    });
    (0, vitest_1.it)('بدون area_id 400 ← validation_failed', async () => {
        const res = await api().post('/api/v1/routes').send({ code: 'RT-NO-A', name: 'X' }).expect(400);
        expectBodyMatchesSchema('post', '/routes', 400, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('validation_failed');
    });
    (0, vitest_1.it)('حوزهٔ ناموجود 400 ← area_not_found', async () => {
        const res = await api()
            .post('/api/v1/routes')
            .send({ area_id: MISSING, code: 'RT-A', name: 'X' })
            .expect(400);
        expectBodyMatchesSchema('post', '/routes', 400, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('area_not_found');
    });
    (0, vitest_1.it)('مشتری ناموجود در ترتیب 400 ← customer_not_found', async () => {
        const res = await api()
            .post('/api/v1/routes')
            .send({ area_id: areaId, code: 'RT-C', name: 'X', customer_ids: [MISSING] })
            .expect(400);
        expectBodyMatchesSchema('post', '/routes', 400, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('customer_not_found');
    });
    (0, vitest_1.it)('کد تکراری در حوزه 409 ← duplicate_code', async () => {
        const res = await api()
            .post('/api/v1/routes')
            .send({ area_id: areaId, code: 'RT-1', name: 'تکراری' })
            .expect(409);
        expectBodyMatchesSchema('post', '/routes', 409, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('duplicate_code');
    });
    (0, vitest_1.it)('فهرست 200 ← Page + items[Route]؛ فیلتر area_id و limit نامعتبر 400', async () => {
        const list = await api().get('/api/v1/routes').expect(200);
        expectBodyMatchesSchema('get', '/routes', 200, list.body);
        (0, vitest_1.expect)(list.body.items.length).toBeGreaterThan(0);
        const filtered = await api().get('/api/v1/routes').query({ area_id: areaId }).expect(200);
        expectBodyMatchesSchema('get', '/routes', 200, filtered.body);
        (0, vitest_1.expect)(filtered.body.items.every((r) => r.area_id === areaId)).toBe(true);
        const bad = await api().get('/api/v1/routes').query({ limit: 0 }).expect(400);
        expectBodyMatchesSchema('get', '/routes', 400, bad.body);
    });
    (0, vitest_1.it)('جزئیات 200 ← Route با customer_ids مرتب؛ خراب 400 و ناموجود 404', async () => {
        const detail = await api().get(`/api/v1/routes/${routeId}`).expect(200);
        expectBodyMatchesSchema('get', '/routes/{id}', 200, detail.body);
        (0, vitest_1.expect)(detail.body.customer_ids).toEqual([customerIds[2], customerIds[0], customerIds[1]]);
        const bad = await api().get('/api/v1/routes/abc').expect(400);
        expectBodyMatchesSchema('get', '/routes/{id}', 400, bad.body);
        const miss = await api().get(`/api/v1/routes/${MISSING}`).expect(404);
        expectBodyMatchesSchema('get', '/routes/{id}', 404, miss.body);
    });
    (0, vitest_1.it)('ویرایش 200 ← Route (بازچینی ترتیب مشتریان + null کردن visit_weekday)', async () => {
        const patched = await api()
            .patch(`/api/v1/routes/${routeId}`)
            .send({
            name: 'مسیر مرکزی (به‌روز)',
            visit_weekday: null,
            customer_ids: [customerIds[0], customerIds[1]],
        })
            .expect(200);
        expectBodyMatchesSchema('patch', '/routes/{id}', 200, patched.body);
        (0, vitest_1.expect)(patched.body.name).toBe('مسیر مرکزی (به‌روز)');
        (0, vitest_1.expect)(patched.body.visit_weekday).toBeNull();
        (0, vitest_1.expect)(patched.body.customer_ids).toEqual([customerIds[0], customerIds[1]]);
        // مشتریِ حذف‌شده باید از مسیر جدا شده باشد
        const removed = await pool.query('select route_id, visit_sequence from customer where id = $1', [customerIds[2]]);
        (0, vitest_1.expect)(removed.rows[0].route_id).toBeNull();
        (0, vitest_1.expect)(removed.rows[0].visit_sequence).toBeNull();
    });
    (0, vitest_1.it)('ویرایش 400/404 ← حوزهٔ ناموجود در به‌روزرسانی، شناسه خراب و ناموجود', async () => {
        const badArea = await api()
            .patch(`/api/v1/routes/${routeId}`)
            .send({ area_id: MISSING })
            .expect(400);
        expectBodyMatchesSchema('patch', '/routes/{id}', 400, badArea.body);
        (0, vitest_1.expect)(badArea.body.code).toBe('area_not_found');
        const bad = await api().patch('/api/v1/routes/abc').send({ name: 'X' }).expect(400);
        expectBodyMatchesSchema('patch', '/routes/{id}', 400, bad.body);
        const miss = await api().patch(`/api/v1/routes/${MISSING}`).send({ name: 'X' }).expect(404);
        expectBodyMatchesSchema('patch', '/routes/{id}', 404, miss.body);
    });
    (0, vitest_1.it)('ویرایش با کد تکراری 409 ← duplicate_code', async () => {
        await api().post('/api/v1/routes').send({ area_id: areaId, code: 'RT-2', name: 'مسیر دوم' }).expect(201);
        const res = await api().patch(`/api/v1/routes/${routeId}`).send({ code: 'RT-2' }).expect(409);
        expectBodyMatchesSchema('patch', '/routes/{id}', 409, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('duplicate_code');
    });
});
(0, vitest_1.describe)('ST — پوشش خطاهای مستندشده', () => {
    (0, vitest_1.it)('همه خطاهای مستندشده در این فایل آزموده شده‌اند', () => {
        const ops = [
            ['get', '/areas'],
            ['post', '/areas'],
            ['get', '/areas/{id}'],
            ['patch', '/areas/{id}'],
            ['get', '/routes'],
            ['post', '/routes'],
            ['get', '/routes/{id}'],
            ['patch', '/routes/{id}'],
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
        (0, vitest_1.expect)(missed, `این خطاهای مستندشده هنوز آزموده نشده‌اند:\n  ${missed.join('\n  ')}`).toEqual([]);
        const stray = [...exercisedErrors].filter((key) => ops.some(([m, p]) => key.startsWith(`${m.toUpperCase()} ${p} `)) &&
            Number(key.split(' ').at(-1)) >= 400 &&
            !documented.has(key));
        (0, vitest_1.expect)(stray, `پاسخ خطای آزموده‌شده خارج از قرارداد:\n  ${stray.join('\n  ')}`).toEqual([]);
    });
});
//# sourceMappingURL=structure.api.test.js.map