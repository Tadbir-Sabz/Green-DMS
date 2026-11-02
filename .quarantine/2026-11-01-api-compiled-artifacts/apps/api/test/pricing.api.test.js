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
 * تست API قیمت‌گذاری: /price-lists و /promotions با گاردهای ماژول
 * (master.price.* و master.promotion.*).
 * ۱) دیتابیس موقت «greendms_pricing_test» + مهاجرت‌ها
 * ۲) seed: شرکت، دسته/کالا/واحد، ادمین همه‌مجوز و بینندهٔ بدون مجوز قیمت/تشویق
 * ۳) اعتبارسنجی ajv + assertion پوششی خطاهای مستندشده
 */
const ROOT = node_path_1.default.resolve(node_path_1.default.dirname((0, node_url_1.fileURLToPath)(import.meta.url)), '..', '..', '..');
(0, dotenv_1.config)({ path: node_path_1.default.join(ROOT, '.env'), quiet: true });
const TEST_DB = 'greendms_pricing_test';
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
const ADMIN_USER = 'pr_admin';
const ADMIN_PASSWORD = 'S3cret!pass';
const VIEWER_USER = 'pr_viewer';
const VIEWER_PASSWORD = 'View!pass1';
let adminToken = '';
let viewerToken = '';
let companyId = '';
let productId = '';
let priceListId = '';
let promotionId = '';
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
    const company = await pool.query(`insert into company (code, legal_name) values ('PRCO', 'شرکت تست قیمت') returning id`);
    companyId = company.rows[0].id;
    await pool.query(`insert into branch (company_id, code, name) values ($1, 'MAIN', 'شعبه مرکزی')`, [companyId]);
    // کالا (برای اقلام لیست قیمت)
    const category = await pool.query(`insert into product_category (company_id, code, name) values ($1, 'BEV', 'نوشیدنی') returning id`, [companyId]);
    const product = await pool.query(`insert into product (company_id, code, name, category_id, base_uom_id)
     values ($1, 'P-1', 'کالای تست', $2, (select id from uom where code = 'pcs'))
     returning id`, [companyId, category.rows[0].id]);
    productId = product.rows[0].id;
    // ادمین همه‌مجوز + بینندهٔ بدون مجوز قیمت/تشویق
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
(0, vitest_1.describe)('PR — 401 بدون توکن روی همه مسیرها', () => {
    (0, vitest_1.it)('price-lists و promotions بدون توکن 401 ← Error', async () => {
        const cases = [
            ['get', '/price-lists', '/api/v1/price-lists'],
            ['post', '/price-lists', '/api/v1/price-lists', { code: 'X', title: 'X' }],
            ['get', '/price-lists/{id}', `/api/v1/price-lists/${MISSING}`],
            ['patch', '/price-lists/{id}', `/api/v1/price-lists/${MISSING}`, {}],
            ['get', '/promotions', '/api/v1/promotions'],
            ['post', '/promotions', '/api/v1/promotions', { code: 'X', title: 'X', kind: 'percent_line' }],
            ['get', '/promotions/{id}', `/api/v1/promotions/${MISSING}`],
            ['patch', '/promotions/{id}', `/api/v1/promotions/${MISSING}`, {}],
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
(0, vitest_1.describe)('PR — 403 بدون مجوز روی همه مسیرها', () => {
    (0, vitest_1.it)('بیننده روی price/promotion 403 ← Error با جزئیات مجوز', async () => {
        const viewer = { Authorization: `Bearer ${viewerToken}` };
        const cases = [
            ['get', '/price-lists', '/api/v1/price-lists', /^master\.price\./],
            ['post', '/price-lists', '/api/v1/price-lists', /^master\.price\./, { code: 'X', title: 'X' }],
            ['get', '/price-lists/{id}', `/api/v1/price-lists/${MISSING}`, /^master\.price\./],
            ['patch', '/price-lists/{id}', `/api/v1/price-lists/${MISSING}`, /^master\.price\./, {}],
            ['get', '/promotions', '/api/v1/promotions', /^master\.promotion\./],
            ['post', '/promotions', '/api/v1/promotions', /^master\.promotion\./, { code: 'X', title: 'X', kind: 'percent_line' }],
            ['get', '/promotions/{id}', `/api/v1/promotions/${MISSING}`, /^master\.promotion\./],
            ['patch', '/promotions/{id}', `/api/v1/promotions/${MISSING}`, /^master\.promotion\./, {}],
        ];
        for (const [method, contractPath, url, perm, body] of cases) {
            const m = method;
            let req = api(null)[m](url).set(viewer);
            if (body !== undefined)
                req = req.send(body);
            const res = await req.expect(403);
            expectBodyMatchesSchema(method, contractPath, 403, res.body);
            (0, vitest_1.expect)(res.body.code).toBe('forbidden');
            (0, vitest_1.expect)(res.body.details?.required?.[0]).toMatch(perm);
        }
    });
});
(0, vitest_1.describe)('PR — /price-lists', () => {
    (0, vitest_1.it)('ساخت 201 ← PriceList با اقلام (قیمت رشته)', async () => {
        const res = await api()
            .post('/api/v1/price-lists')
            .send({
            code: 'PL-1',
            title: 'لیست عمده',
            kind: 'wholesale',
            items: [{ product_id: productId, price: '1000', valid_from: '2024-01-01', valid_to: '2025-12-31' }],
        })
            .expect(201);
        expectBodyMatchesSchema('post', '/price-lists', 201, res.body);
        priceListId = res.body.id;
        (0, vitest_1.expect)(res.body.code).toBe('PL-1');
        (0, vitest_1.expect)(res.body.kind).toBe('wholesale');
        (0, vitest_1.expect)(res.body.items).toHaveLength(1);
        (0, vitest_1.expect)(typeof res.body.items[0].price).toBe('string');
        (0, vitest_1.expect)(parseFloat(res.body.items[0].price)).toBe(1000);
        (0, vitest_1.expect)(res.body.items[0].valid_from).toBe('2024-01-01');
    });
    (0, vitest_1.it)('بدون title 400 ← validation_failed', async () => {
        const res = await api().post('/api/v1/price-lists').send({ code: 'PL-NO-T' }).expect(400);
        expectBodyMatchesSchema('post', '/price-lists', 400, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('validation_failed');
    });
    (0, vitest_1.it)('کد تکراری 409 ← duplicate_code', async () => {
        const res = await api().post('/api/v1/price-lists').send({ code: 'PL-1', title: 'تکراری' }).expect(409);
        expectBodyMatchesSchema('post', '/price-lists', 409, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('duplicate_code');
    });
    (0, vitest_1.it)('کالای ناموجود در قلم 400 ← product_not_found', async () => {
        const res = await api()
            .post('/api/v1/price-lists')
            .send({ code: 'PL-BAD', title: 'X', items: [{ product_id: MISSING, price: '100' }] })
            .expect(400);
        expectBodyMatchesSchema('post', '/price-lists', 400, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('product_not_found');
    });
    (0, vitest_1.it)('فهرست 200 ← Page + items[PriceList]؛ limit نامعتبر 400', async () => {
        const list = await api().get('/api/v1/price-lists').expect(200);
        expectBodyMatchesSchema('get', '/price-lists', 200, list.body);
        (0, vitest_1.expect)(list.body.items.length).toBeGreaterThan(0);
        const bad = await api().get('/api/v1/price-lists').query({ limit: 999 }).expect(400);
        expectBodyMatchesSchema('get', '/price-lists', 400, bad.body);
    });
    (0, vitest_1.it)('جزئیات 200 ← PriceList؛ شناسه خراب 400 و ناموجود 404', async () => {
        const detail = await api().get(`/api/v1/price-lists/${priceListId}`).expect(200);
        expectBodyMatchesSchema('get', '/price-lists/{id}', 200, detail.body);
        (0, vitest_1.expect)(detail.body.items).toHaveLength(1);
        const bad = await api().get('/api/v1/price-lists/abc').expect(400);
        expectBodyMatchesSchema('get', '/price-lists/{id}', 400, bad.body);
        const miss = await api().get(`/api/v1/price-lists/${MISSING}`).expect(404);
        expectBodyMatchesSchema('get', '/price-lists/{id}', 404, miss.body);
    });
    (0, vitest_1.it)('ویرایش 200 ← PriceList؛ شناسه خراب 400 و ناموجود 404', async () => {
        const patched = await api()
            .patch(`/api/v1/price-lists/${priceListId}`)
            .send({ title: 'لیست عمده (به‌روز)' })
            .expect(200);
        expectBodyMatchesSchema('patch', '/price-lists/{id}', 200, patched.body);
        (0, vitest_1.expect)(patched.body.title).toBe('لیست عمده (به‌روز)');
        const bad = await api().patch('/api/v1/price-lists/abc').send({ title: 'X' }).expect(400);
        expectBodyMatchesSchema('patch', '/price-lists/{id}', 400, bad.body);
        const miss = await api().patch(`/api/v1/price-lists/${MISSING}`).send({ title: 'X' }).expect(404);
        expectBodyMatchesSchema('patch', '/price-lists/{id}', 404, miss.body);
    });
});
(0, vitest_1.describe)('PR — /promotions', () => {
    (0, vitest_1.it)('ساخت 201 ← Promotion با بازه تاریخ', async () => {
        const res = await api()
            .post('/api/v1/promotions')
            .send({
            code: 'PR-1',
            title: 'تخفیف درصدی',
            kind: 'percent_line',
            valid_from: '2024-01-01',
            valid_to: '2025-12-31',
            priority: 10,
            benefit: { percent: 10 },
        })
            .expect(201);
        expectBodyMatchesSchema('post', '/promotions', 201, res.body);
        promotionId = res.body.id;
        (0, vitest_1.expect)(res.body.code).toBe('PR-1');
        (0, vitest_1.expect)(res.body.kind).toBe('percent_line');
        (0, vitest_1.expect)(res.body.valid_from).toBe('2024-01-01');
        (0, vitest_1.expect)(res.body.valid_to).toBe('2025-12-31');
        (0, vitest_1.expect)(res.body.priority).toBe(10);
    });
    (0, vitest_1.it)('بدون kind 400 ← validation_failed', async () => {
        const res = await api().post('/api/v1/promotions').send({ code: 'PR-NO-K', title: 'X' }).expect(400);
        expectBodyMatchesSchema('post', '/promotions', 400, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('validation_failed');
    });
    (0, vitest_1.it)('کد تکراری 409 ← duplicate_code', async () => {
        const res = await api().post('/api/v1/promotions').send({ code: 'PR-1', title: 'تکراری', kind: 'coupon' }).expect(409);
        expectBodyMatchesSchema('post', '/promotions', 409, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('duplicate_code');
    });
    (0, vitest_1.it)('فهرست 200 ← Page + items[Promotion]؛ is_active نامعتبر 400', async () => {
        const list = await api().get('/api/v1/promotions').expect(200);
        expectBodyMatchesSchema('get', '/promotions', 200, list.body);
        (0, vitest_1.expect)(list.body.items.length).toBeGreaterThan(0);
        const filtered = await api().get('/api/v1/promotions').query({ is_active: 'true' }).expect(200);
        expectBodyMatchesSchema('get', '/promotions', 200, filtered.body);
        const bad = await api().get('/api/v1/promotions').query({ is_active: 'abc' }).expect(400);
        expectBodyMatchesSchema('get', '/promotions', 400, bad.body);
    });
    (0, vitest_1.it)('جزئیات 200 ← Promotion؛ شناسه خراب 400 و ناموجود 404', async () => {
        const detail = await api().get(`/api/v1/promotions/${promotionId}`).expect(200);
        expectBodyMatchesSchema('get', '/promotions/{id}', 200, detail.body);
        (0, vitest_1.expect)(detail.body.code).toBe('PR-1');
        const bad = await api().get('/api/v1/promotions/abc').expect(400);
        expectBodyMatchesSchema('get', '/promotions/{id}', 400, bad.body);
        const miss = await api().get(`/api/v1/promotions/${MISSING}`).expect(404);
        expectBodyMatchesSchema('get', '/promotions/{id}', 404, miss.body);
    });
    (0, vitest_1.it)('ویرایش 200 ← Promotion؛ شناسه خراب 400 و ناموجود 404', async () => {
        const patched = await api()
            .patch(`/api/v1/promotions/${promotionId}`)
            .send({ title: 'تخفیف درصدی (به‌روز)', is_active: false })
            .expect(200);
        expectBodyMatchesSchema('patch', '/promotions/{id}', 200, patched.body);
        (0, vitest_1.expect)(patched.body.title).toBe('تخفیف درصدی (به‌روز)');
        (0, vitest_1.expect)(patched.body.is_active).toBe(false);
        const bad = await api().patch('/api/v1/promotions/abc').send({ title: 'X' }).expect(400);
        expectBodyMatchesSchema('patch', '/promotions/{id}', 400, bad.body);
        const miss = await api().patch(`/api/v1/promotions/${MISSING}`).send({ title: 'X' }).expect(404);
        expectBodyMatchesSchema('patch', '/promotions/{id}', 404, miss.body);
    });
});
(0, vitest_1.describe)('PR — پوشش خطاهای مستندشده', () => {
    (0, vitest_1.it)('همه خطاهای مستندشده در این فایل آزموده شده‌اند', () => {
        const ops = [
            ['get', '/price-lists'],
            ['post', '/price-lists'],
            ['get', '/price-lists/{id}'],
            ['patch', '/price-lists/{id}'],
            ['get', '/promotions'],
            ['post', '/promotions'],
            ['get', '/promotions/{id}'],
            ['patch', '/promotions/{id}'],
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
//# sourceMappingURL=pricing.api.test.js.map