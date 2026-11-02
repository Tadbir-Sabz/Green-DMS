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
 * تست API انبار: GET /stock، POST /stock/adjustments، چرخهٔ کامل /stocktakes
 * و /transfers — با همان گاردهای ماژول (AuthGuard + PermissionsGuard).
 * ۱) دیتابیس موقت «greendms_inventory_test» از صفر + مهاجرت‌ها
 * ۲) seed: شرکت/شعبه، دسته/کالا/واحد، دو انبار، ادمین همه‌مجوز و بینندهٔ بدون مجوز انبار
 * ۳) اعتبارسنجی بدنه‌ها با ajv (JSON Schema 2020-12) + assertion پوششی خطاهای مستندشده
 */
const ROOT = node_path_1.default.resolve(node_path_1.default.dirname((0, node_url_1.fileURLToPath)(import.meta.url)), '..', '..', '..');
(0, dotenv_1.config)({ path: node_path_1.default.join(ROOT, '.env'), quiet: true });
const TEST_DB = 'greendms_inventory_test';
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
const ADMIN_USER = 'inv_admin';
const ADMIN_PASSWORD = 'S3cret!pass';
const VIEWER_USER = 'inv_viewer';
const VIEWER_PASSWORD = 'View!pass1';
let adminToken = '';
let viewerToken = '';
let companyId = '';
let productId = '';
let wh1 = '';
let wh2 = '';
let stocktakeId = '';
let transferId = '';
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
    const company = await pool.query(`insert into company (code, legal_name) values ('INVCO', 'شرکت تست انبار') returning id`);
    companyId = company.rows[0].id;
    await pool.query(`insert into branch (company_id, code, name) values ($1, 'MAIN', 'شعبه مرکزی')`, [companyId]);
    // دسته + کالا (unit از seed 0022: pcs)
    const category = await pool.query(`insert into product_category (company_id, code, name) values ($1, 'BEV', 'نوشیدنی') returning id`, [companyId]);
    const product = await pool.query(`insert into product (company_id, code, name, category_id, base_uom_id)
     values ($1, 'P-1', 'کالای تست', $2, (select id from uom where code = 'pcs'))
     returning id`, [companyId, category.rows[0].id]);
    productId = product.rows[0].id;
    // دو انبار (WH1 بدون موجودی منفی برای آزمون 422)
    const w1 = await pool.query(`insert into warehouse (branch_id, code, name, kind)
     select id, 'WH1', 'انبار ۱', 'main' from branch where company_id = $1 returning id`, [companyId]);
    wh1 = w1.rows[0].id;
    const w2 = await pool.query(`insert into warehouse (branch_id, code, name, kind)
     select id, 'WH2', 'انبار ۲', 'main' from branch where company_id = $1 returning id`, [companyId]);
    wh2 = w2.rows[0].id;
    // ادمین همه‌مجوز + بینندهٔ بدون مجوز انبار
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
(0, vitest_1.describe)('INV — 401 بدون توکن روی همه مسیرها', () => {
    (0, vitest_1.it)('همه endpoint ها بدون توکن 401 ← Error', async () => {
        const cases = [
            ['get', '/stock', '/api/v1/stock'],
            ['post', '/stock/adjustments', '/api/v1/stock/adjustments', { warehouse_id: wh1, product_id: productId, qty_delta: 1, reason_code: 'damage' }],
            ['get', '/stocktakes', '/api/v1/stocktakes'],
            ['post', '/stocktakes', '/api/v1/stocktakes', { warehouse_id: wh1 }],
            ['get', '/stocktakes/{id}', `/api/v1/stocktakes/${MISSING}`],
            ['patch', '/stocktakes/{id}', `/api/v1/stocktakes/${MISSING}`, {}],
            ['post', '/stocktakes/{id}/submit', `/api/v1/stocktakes/${MISSING}/submit`],
            ['get', '/transfers', '/api/v1/transfers'],
            ['post', '/transfers', '/api/v1/transfers', { from_warehouse_id: wh1, to_warehouse_id: wh2, lines: [] }],
            ['get', '/transfers/{id}', `/api/v1/transfers/${MISSING}`],
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
(0, vitest_1.describe)('INV — 403 بدون مجوز روی همه مسیرها', () => {
    (0, vitest_1.it)('همه endpoint ها برای بیننده 403 ← Error با جزئیات مجوز inventory', async () => {
        const viewer = { Authorization: `Bearer ${viewerToken}` };
        const cases = [
            ['get', '/stock', '/api/v1/stock'],
            ['post', '/stock/adjustments', '/api/v1/stock/adjustments', { warehouse_id: wh1, product_id: productId, qty_delta: 1, reason_code: 'damage' }],
            ['get', '/stocktakes', '/api/v1/stocktakes'],
            ['post', '/stocktakes', '/api/v1/stocktakes', { warehouse_id: wh1 }],
            ['get', '/stocktakes/{id}', `/api/v1/stocktakes/${MISSING}`],
            ['patch', '/stocktakes/{id}', `/api/v1/stocktakes/${MISSING}`, {}],
            ['post', '/stocktakes/{id}/submit', `/api/v1/stocktakes/${MISSING}/submit`],
            ['get', '/transfers', '/api/v1/transfers'],
            ['post', '/transfers', '/api/v1/transfers', { from_warehouse_id: wh1, to_warehouse_id: wh2, lines: [] }],
            ['get', '/transfers/{id}', `/api/v1/transfers/${MISSING}`],
        ];
        for (const [method, contractPath, url, body] of cases) {
            const m = method;
            let req = api(null)[m](url).set(viewer);
            if (body !== undefined)
                req = req.send(body);
            const res = await req.expect(403);
            expectBodyMatchesSchema(method, contractPath, 403, res.body);
            (0, vitest_1.expect)(res.body.code).toBe('forbidden');
            (0, vitest_1.expect)(res.body.details?.required?.[0]).toMatch(/^inventory\./);
        }
    });
});
(0, vitest_1.describe)('INV — GET /stock', () => {
    (0, vitest_1.it)('200 ← Page + items[StockBalance]', async () => {
        const res = await api().get('/api/v1/stock').expect(200);
        expectBodyMatchesSchema('get', '/stock', 200, res.body);
        (0, vitest_1.expect)(Array.isArray(res.body.items)).toBe(true);
    });
    (0, vitest_1.it)('فیلتر warehouse_id نامعتبر 400 ← Error', async () => {
        const res = await api().get('/api/v1/stock').query({ warehouse_id: 'not-a-uuid' }).expect(400);
        expectBodyMatchesSchema('get', '/stock', 400, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('validation_failed');
    });
});
(0, vitest_1.describe)('INV — POST /stock/adjustments', () => {
    (0, vitest_1.it)('ساخت اصلاحیه مثبت 201 ← StockAdjustment', async () => {
        const res = await api()
            .post('/api/v1/stock/adjustments')
            .send({ warehouse_id: wh1, product_id: productId, qty_delta: 10, reason_code: 'count_fix', note: 'اصلاح اولیه' })
            .expect(201);
        expectBodyMatchesSchema('post', '/stock/adjustments', 201, res.body);
        (0, vitest_1.expect)(res.body.warehouse_id).toBe(wh1);
        (0, vitest_1.expect)(res.body.product_id).toBe(productId);
        (0, vitest_1.expect)(res.body.qty_delta).toBe(10);
        (0, vitest_1.expect)(res.body.reason_code).toBe('count_fix');
    });
    (0, vitest_1.it)('موجودی منفی 422 ← RuleRejected (fn_apply_stock_txn)', async () => {
        const res = await api()
            .post('/api/v1/stock/adjustments')
            .send({ warehouse_id: wh1, product_id: productId, qty_delta: -100, reason_code: 'damage' })
            .expect(422);
        expectBodyMatchesSchema('post', '/stock/adjustments', 422, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('negative_stock_forbidden');
        (0, vitest_1.expect)(res.body.message_fa).toMatch(/[؀-ۿ]/);
    });
    (0, vitest_1.it)('انبار ناموجود 400 ← Error', async () => {
        const res = await api()
            .post('/api/v1/stock/adjustments')
            .send({ warehouse_id: MISSING, product_id: productId, qty_delta: 1, reason_code: 'damage' })
            .expect(400);
        expectBodyMatchesSchema('post', '/stock/adjustments', 400, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('warehouse_not_found');
    });
    (0, vitest_1.it)('بدون product_id 400 ← validation_failed', async () => {
        const res = await api()
            .post('/api/v1/stock/adjustments')
            .send({ warehouse_id: wh1, qty_delta: 1, reason_code: 'damage' })
            .expect(400);
        expectBodyMatchesSchema('post', '/stock/adjustments', 400, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('validation_failed');
    });
});
(0, vitest_1.describe)('INV — GET /stocktakes', () => {
    (0, vitest_1.it)('200 ← Page + items[StockTake]', async () => {
        const res = await api().get('/api/v1/stocktakes').expect(200);
        expectBodyMatchesSchema('get', '/stocktakes', 200, res.body);
        (0, vitest_1.expect)(Array.isArray(res.body.items)).toBe(true);
    });
    (0, vitest_1.it)('فیلتر status نامعتبر 400 ← Error', async () => {
        const res = await api().get('/api/v1/stocktakes').query({ status: 'bogus' }).expect(400);
        expectBodyMatchesSchema('get', '/stocktakes', 400, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('validation_failed');
    });
});
(0, vitest_1.describe)('INV — چرخه کامل /stocktakes', () => {
    (0, vitest_1.it)('ساخت 201 ← StockTake (draft)', async () => {
        const res = await api().post('/api/v1/stocktakes').send({ warehouse_id: wh1 }).expect(201);
        expectBodyMatchesSchema('post', '/stocktakes', 201, res.body);
        stocktakeId = res.body.id;
        (0, vitest_1.expect)(res.body.status).toBe('draft');
        (0, vitest_1.expect)(res.body.warehouse_id).toBe(wh1);
    });
    (0, vitest_1.it)('ساخت بدون warehouse_id 400 ← validation_failed', async () => {
        const res = await api().post('/api/v1/stocktakes').send({}).expect(400);
        expectBodyMatchesSchema('post', '/stocktakes', 400, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('validation_failed');
    });
    (0, vitest_1.it)('جزئیات 200 ← StockTake با اقلام', async () => {
        const res = await api().get(`/api/v1/stocktakes/${stocktakeId}`).expect(200);
        expectBodyMatchesSchema('get', '/stocktakes/{id}', 200, res.body);
        (0, vitest_1.expect)(Array.isArray(res.body.lines)).toBe(true);
    });
    (0, vitest_1.it)('جزئیات شناسه خراب 400 و ناموجود 404', async () => {
        const bad = await api().get('/api/v1/stocktakes/abc').expect(400);
        expectBodyMatchesSchema('get', '/stocktakes/{id}', 400, bad.body);
        const miss = await api().get(`/api/v1/stocktakes/${MISSING}`).expect(404);
        expectBodyMatchesSchema('get', '/stocktakes/{id}', 404, miss.body);
    });
    (0, vitest_1.it)('ثبت شمارش اقلام 200 ← system_qty/counted_qty/variance', async () => {
        const res = await api()
            .patch(`/api/v1/stocktakes/${stocktakeId}`)
            .send({ lines: [{ product_id: productId, counted_qty: 12 }] })
            .expect(200);
        expectBodyMatchesSchema('patch', '/stocktakes/{id}', 200, res.body);
        const line = res.body.lines.find((l) => l.product_id === productId);
        (0, vitest_1.expect)(line).toBeTruthy();
        (0, vitest_1.expect)(line.system_qty).toBe(10); // مانده پس از اصلاحیه +10
        (0, vitest_1.expect)(line.counted_qty).toBe(12);
        (0, vitest_1.expect)(line.variance_qty).toBe(2);
    });
    (0, vitest_1.it)('patch شناسه خراب 400 و ناموجود 404', async () => {
        const bad = await api().patch('/api/v1/stocktakes/abc').send({ status: 'counting' }).expect(400);
        expectBodyMatchesSchema('patch', '/stocktakes/{id}', 400, bad.body);
        const miss = await api().patch(`/api/v1/stocktakes/${MISSING}`).send({ status: 'counting' }).expect(404);
        expectBodyMatchesSchema('patch', '/stocktakes/{id}', 404, miss.body);
    });
    (0, vitest_1.it)('submit 200 ← اعمال مغایرت و وضعیت posted', async () => {
        const res = await api().post(`/api/v1/stocktakes/${stocktakeId}/submit`).expect(200);
        expectBodyMatchesSchema('post', '/stocktakes/{id}/submit', 200, res.body);
        (0, vitest_1.expect)(res.body.status).toBe('posted');
    });
    (0, vitest_1.it)('submit دوباره 409 ← already_final', async () => {
        const res = await api().post(`/api/v1/stocktakes/${stocktakeId}/submit`).expect(409);
        expectBodyMatchesSchema('post', '/stocktakes/{id}/submit', 409, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('already_final');
    });
    (0, vitest_1.it)('submit بدون قلم شمارش‌شده 400 ← no_counted_lines', async () => {
        const empty = await api().post('/api/v1/stocktakes').send({ warehouse_id: wh2 }).expect(201);
        const res = await api().post(`/api/v1/stocktakes/${empty.body.id}/submit`).expect(400);
        expectBodyMatchesSchema('post', '/stocktakes/{id}/submit', 400, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('no_counted_lines');
    });
    (0, vitest_1.it)('submit شناسه خراب 400', async () => {
        const res = await api().post('/api/v1/stocktakes/abc/submit').expect(400);
        expectBodyMatchesSchema('post', '/stocktakes/{id}/submit', 400, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('invalid_id');
    });
});
(0, vitest_1.describe)('INV — /transfers', () => {
    (0, vitest_1.it)('ساخت انتقال 201 ← Transfer با قلم', async () => {
        const res = await api()
            .post('/api/v1/transfers')
            .send({ from_warehouse_id: wh1, to_warehouse_id: wh2, lines: [{ product_id: productId, qty: 5 }] })
            .expect(201);
        expectBodyMatchesSchema('post', '/transfers', 201, res.body);
        transferId = res.body.id;
        (0, vitest_1.expect)(res.body.status).toBe('draft');
        (0, vitest_1.expect)(res.body.from_warehouse_id).toBe(wh1);
        (0, vitest_1.expect)(res.body.to_warehouse_id).toBe(wh2);
        (0, vitest_1.expect)(res.body.lines).toHaveLength(1);
        (0, vitest_1.expect)(res.body.lines[0].qty).toBe(5);
    });
    (0, vitest_1.it)('مبدأ و مقصد یکسان 400 ← same_warehouse', async () => {
        const res = await api()
            .post('/api/v1/transfers')
            .send({ from_warehouse_id: wh1, to_warehouse_id: wh1, lines: [{ product_id: productId, qty: 1 }] })
            .expect(400);
        expectBodyMatchesSchema('post', '/transfers', 400, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('same_warehouse');
    });
    (0, vitest_1.it)('بدون قلم 400 ← lines_required', async () => {
        const res = await api()
            .post('/api/v1/transfers')
            .send({ from_warehouse_id: wh1, to_warehouse_id: wh2, lines: [] })
            .expect(400);
        expectBodyMatchesSchema('post', '/transfers', 400, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('lines_required');
    });
    (0, vitest_1.it)('انبار ناموجود 400 ← warehouse_not_found', async () => {
        const res = await api()
            .post('/api/v1/transfers')
            .send({ from_warehouse_id: MISSING, to_warehouse_id: wh2, lines: [{ product_id: productId, qty: 1 }] })
            .expect(400);
        expectBodyMatchesSchema('post', '/transfers', 400, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('warehouse_not_found');
    });
    (0, vitest_1.it)('فهرست 200 ← Page + items[Transfer]', async () => {
        const res = await api().get('/api/v1/transfers').expect(200);
        expectBodyMatchesSchema('get', '/transfers', 200, res.body);
        (0, vitest_1.expect)(res.body.items.length).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('فهرست limit نامعتبر 400 ← Error', async () => {
        const res = await api().get('/api/v1/transfers').query({ limit: 999 }).expect(400);
        expectBodyMatchesSchema('get', '/transfers', 400, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('validation_failed');
    });
    (0, vitest_1.it)('جزئیات 200 ← Transfer؛ شناسه خراب 400 و ناموجود 404', async () => {
        const detail = await api().get(`/api/v1/transfers/${transferId}`).expect(200);
        expectBodyMatchesSchema('get', '/transfers/{id}', 200, detail.body);
        (0, vitest_1.expect)(detail.body.id).toBe(transferId);
        const bad = await api().get('/api/v1/transfers/abc').expect(400);
        expectBodyMatchesSchema('get', '/transfers/{id}', 400, bad.body);
        const miss = await api().get(`/api/v1/transfers/${MISSING}`).expect(404);
        expectBodyMatchesSchema('get', '/transfers/{id}', 404, miss.body);
    });
});
(0, vitest_1.describe)('INV — پوشش خطاهای مستندشده', () => {
    (0, vitest_1.it)('همه خطاهای مستندشده در این فایل آزموده شده‌اند', () => {
        const ops = [
            ['get', '/stock'],
            ['post', '/stock/adjustments'],
            ['get', '/stocktakes'],
            ['post', '/stocktakes'],
            ['get', '/stocktakes/{id}'],
            ['patch', '/stocktakes/{id}'],
            ['post', '/stocktakes/{id}/submit'],
            ['get', '/transfers'],
            ['post', '/transfers'],
            ['get', '/transfers/{id}'],
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
//# sourceMappingURL=inventory.api.test.js.map