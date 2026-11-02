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
 * تست تطبیق قرارداد — هماهنگی کد اجراشده با packages/contracts/openapi.yaml:
 *
 * A) پوشش مسیرها: همه routeهایی که Nest/Express واقعاً ثبت کرده باید در سند
 *    با همان متد و الگوی مسیر وجود داشته باشند (کد ⊆ سند). مسیر /api/health
 *    عمداً خارج از قرارداد است (پروب زیرساخت).
 * B) پاسخ‌های اجراشده: برای هر عملیات واقعی، کد وضعیت باید در responses سند
 *    تعریف شده باشد و بدنه پاسخ باید با اسکیمای همان پاسخ (با ajv، JSON Schema
 *    2020-12 سازگار با OpenAPI 3.1) اعتبارسنجی شود — شامل پاسخ‌های خطا.
 *
 * دیتابیس موقت «greendms_contract_test» مثل بقیه تست‌های API ساخته می‌شود.
 */
const ROOT = node_path_1.default.resolve(node_path_1.default.dirname((0, node_url_1.fileURLToPath)(import.meta.url)), '..', '..', '..');
(0, dotenv_1.config)({ path: node_path_1.default.join(ROOT, '.env'), quiet: true });
const TEST_DB = 'greendms_contract_test';
const PSQL = process.env.PSQL ?? 'C:/Program Files/PostgreSQL/16/bin/psql.exe';
const SPEC_FILE = node_path_1.default.join(ROOT, 'packages', 'contracts', 'openapi.yaml');
/** مسیرهای زیرساختی که عمداً در قرارداد نیستند */
const OUT_OF_CONTRACT = new Set(['/api/health']);
/**
 * روت‌های اسکلت (فاز scaffold): ماژول‌های هنوز پیاده‌نشده فقط مسیر info
 * می‌دهند و جزئی از قرارداد نیستند؛ با پیاده‌سازی هر ماژول حذف می‌شوند.
 */
const SCAFFOLD_ROUTES = new Set([
    '/api/v1/identity-rbac',
    '/api/v1/master-data',
    '/api/v1/inventory',
    '/api/v1/rules-engine',
    '/api/v1/sales',
    '/api/v1/tours',
    '/api/v1/tracking',
    '/api/v1/finance',
    '/api/v1/integrations',
]);
const API_PREFIX = '/api/v1';
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
const USER = 'contract_admin';
const VIEWER = 'contract_viewer';
const PASSWORD = 'Contr4ct!pass';
let adminPool;
let pool;
let app;
let token;
/** توکن کاربرِ بدون هیچ مجوزی — مبنای آزمون‌های 403 */
let viewerToken;
let categoryId;
let uomId;
let spec;
let ajv;
/**
 * همه پاسخ‌های خطایی که واقعاً در تست‌ها آزموده شده‌اند — مبنای «پوشش همه
 * خطاهای مستندشده» برای /users و /roles (کلید: «METHOD /path status»).
 */
const exercisedErrors = new Set();
const api = () => (0, supertest_1.default)(app.getHttpServer());
/** هدر نشست — تابع است چون token در beforeAll پر می‌شود نه در لودِ فایل */
const bearer = () => ({ Authorization: `Bearer ${token}` });
const login = async (username, password) => {
    const res = await api().post('/api/v1/auth/login').send({ username, password }).expect(200);
    return res.body;
};
/** ارجاع JSON Pointer داخل سند (برای resolve کردن $ref) */
const resolvePointer = (doc, ref) => ref
    .replace(/^#\//, '')
    .split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((node, seg) => (node == null ? node : node[seg]), doc);
/** عملیات مربوطه از سند؛ اگر نبود، تست با پیام روشن شکست می‌خورد */
const operationOf = (method, contractPath) => {
    const item = spec.paths[contractPath];
    (0, vitest_1.expect)(item, `مسیر ${contractPath} در openapi.yaml تعریف نشده است`).toBeTruthy();
    const op = item[method];
    (0, vitest_1.expect)(op, `عملیات ${method.toUpperCase()} ${contractPath} در openapi.yaml تعریف نشده است`).toBeTruthy();
    return op;
};
/** کد وضعیت باید در responses همان عملیات آمده باشد */
const expectDocumentedStatus = (method, contractPath, status) => {
    const op = operationOf(method, contractPath);
    const keys = Object.keys(op.responses ?? {});
    (0, vitest_1.expect)(keys, `کد ${status} برای ${method.toUpperCase()} ${contractPath} در قرارداد نیست (تعریف‌شده: ${keys.join(', ')})`).toContain(String(status));
};
/** اعتبارسنجی بدنه پاسخ علیه اسکیمای همان پاسخ در سند */
const expectBodyMatchesSchema = (method, contractPath, status, body) => {
    expectDocumentedStatus(method, contractPath, status);
    const op = operationOf(method, contractPath);
    const responseNode = op.responses[String(status)];
    const baseRef = typeof responseNode.$ref === 'string'
        ? responseNode.$ref
        : `#/paths/${contractPath.replace(/\//g, '~1')}/${method}/responses/${status}`;
    const resolved = resolvePointer(spec, baseRef);
    const schemaNode = resolved?.content?.['application/json']?.schema;
    if (!schemaNode)
        return; // پاسخ بدون بدنه (مثل 204)
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
/** همه routeهای ثبت‌شده در express — مبنای «کدِ اجراشده» */
const collectImplementedRoutes = () => {
    const instance = app.getHttpAdapter().getInstance();
    const router = instance.router ?? instance._router;
    const out = [];
    for (const layer of router?.stack ?? []) {
        const route = layer.route;
        if (!route)
            continue;
        const paths = Array.isArray(route.path) ? route.path : [route.path];
        for (const p of paths) {
            for (const [method, enabled] of Object.entries(route.methods)) {
                if (enabled)
                    out.push({ method: method.toLowerCase(), path: String(p) });
            }
        }
    }
    return out;
};
(0, vitest_1.beforeAll)(async () => {
    // دیتابیس موقت + همه مهاجرت‌ها
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
    // seed حداقلی: شرکت + دسته + واحد + کاربر با همه مجوزها
    pool = new pg_1.default.Pool({ connectionString: testUrl.toString(), max: 1 });
    const company = await pool.query(`insert into company (code, legal_name) values ('CONTRACTCO', 'شرکت تست قرارداد') returning id`);
    const companyId = company.rows[0].id;
    const category = await pool.query(`insert into product_category (company_id, code, name) values ($1, 'BEV', 'نوشیدنی') returning id`, [companyId]);
    categoryId = category.rows[0].id;
    const uom = await pool.query(`select id from uom where code = 'pcs'`);
    uomId = uom.rows[0].id;
    const person = await pool.query(`insert into person (company_id, code, first_name, last_name)
     values ($1, 'P-CTR', 'کاربر', 'قرارداد') returning id`, [companyId]);
    // شماره موبایل تا درخواست OTP ردیف نرخ‌گیری بسازد (پاسخ 429 قابل آزمون باشد)
    await pool.query(`insert into person_phone (person_id, phone, kind, is_primary)
     values ($1, '09129999999', 'mobile', true)`, [person.rows[0].id]);
    await pool.query(`insert into app_user (person_id, username, password_hash, access_level)
     values ($1, $2, $3, 'web')`, [person.rows[0].id, USER, await (0, password_1.hashPassword)(PASSWORD)]);
    const role = await pool.query(`insert into role (company_id, code, name) values ($1, 'admin_full', 'مدیر کامل') returning id`, [companyId]);
    await pool.query(`insert into role_permission (role_id, permission_code)
     select $1, code from permission`, [role.rows[0].id]);
    await pool.query(`insert into user_role (app_user_id, role_id)
     select u.id, $1 from app_user u where u.username = $2`, [role.rows[0].id, USER]);
    // کاربر بدون نقش و بدون مجوز — برای آزمون 403 (نقطهٔ مقابل کاربرِ همه‌مجوز)
    const viewerPerson = await pool.query(`insert into person (company_id, code, first_name, last_name)
     values ($1, 'P-CTRV', 'بازدیدکننده', 'قرارداد') returning id`, [companyId]);
    await pool.query(`insert into app_user (person_id, username, password_hash, access_level)
     values ($1, $2, $3, 'web')`, [viewerPerson.rows[0].id, VIEWER, await (0, password_1.hashPassword)(PASSWORD)]);
    // اپ واقعی
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
    token = String((await login(USER, PASSWORD)).access_token);
    viewerToken = String((await login(VIEWER, PASSWORD)).access_token);
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
// =====================================================================
// A) پوشش مسیرها: کدِ اجراشده ⊆ سند
// =====================================================================
(0, vitest_1.describe)('A — پوشش مسیرها: هر route اجراشده در openapi.yaml هست', () => {
    (0, vitest_1.it)('هر متد و مسیر ثبت‌شده در express با الگوی سند تطبیق دارد', () => {
        const routes = collectImplementedRoutes();
        (0, vitest_1.expect)(routes.length).toBeGreaterThan(0);
        const undocumented = [];
        for (const route of routes) {
            const expressPath = route.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
            if (OUT_OF_CONTRACT.has(expressPath) || SCAFFOLD_ROUTES.has(expressPath))
                continue;
            // مسیرهای سند بدون پیشوند نسخه‌اند: /api/v1/products → /products
            if (!expressPath.startsWith(`${API_PREFIX}/`)) {
                undocumented.push(`${route.method.toUpperCase()} ${expressPath} (خارج از پیشوند API)`);
                continue;
            }
            const contractPath = expressPath.slice(API_PREFIX.length);
            const item = spec.paths[contractPath];
            if (!item || !item[route.method]) {
                undocumented.push(`${route.method.toUpperCase()} ${contractPath}`);
            }
        }
        (0, vitest_1.expect)(undocumented, `این routeها در کد اجرا می‌شوند ولی در openapi.yaml نیستند:\n  ${undocumented.join('\n  ')}`).toEqual([]);
    });
    (0, vitest_1.it)('عملیات احراز هویت و محصولِ پیاده‌سازی‌شده همگی در سندند', () => {
        const expected = [
            ['post', '/auth/login'],
            ['post', '/auth/refresh'],
            ['post', '/auth/logout'],
            ['get', '/auth/me'],
            ['post', '/auth/otp/request'],
            ['post', '/auth/otp/verify'],
            ['get', '/products'],
            ['post', '/products'],
            ['get', '/products/{id}'],
            ['patch', '/products/{id}'],
            ['delete', '/products/{id}'],
            ['get', '/users'],
            ['post', '/users'],
            ['get', '/users/{id}'],
            ['patch', '/users/{id}'],
            ['delete', '/users/{id}'],
            ['get', '/roles'],
            ['post', '/roles'],
            ['get', '/roles/{id}'],
            ['patch', '/roles/{id}'],
            ['delete', '/roles/{id}'],
            ['get', '/persons'],
            ['post', '/persons'],
            ['get', '/persons/{id}'],
            ['patch', '/persons/{id}'],
            ['get', '/devices'],
            ['post', '/devices'],
            ['delete', '/devices/{id}'],
        ];
        for (const [method, contractPath] of expected) {
            (0, vitest_1.expect)(() => operationOf(method, contractPath)).not.toThrow();
        }
    });
});
// =====================================================================
// B) پاسخ‌های اجراشده علیه اسکیمای سند
// =====================================================================
(0, vitest_1.describe)('B — پاسخ‌های /auth علیه قرارداد', () => {
    (0, vitest_1.it)('ورود موفق 200 ← AuthSession', async () => {
        const res = await api()
            .post('/api/v1/auth/login')
            .send({ username: USER, password: PASSWORD })
            .expect(200);
        expectBodyMatchesSchema('post', '/auth/login', 200, res.body);
    });
    (0, vitest_1.it)('ورود ناموفق 401 ← Error', async () => {
        const res = await api()
            .post('/api/v1/auth/login')
            .send({ username: USER, password: 'wrong' })
            .expect(401);
        expectBodyMatchesSchema('post', '/auth/login', 401, res.body);
    });
    (0, vitest_1.it)('بدون توکن 401 ← Error', async () => {
        const res = await api().get('/api/v1/auth/me').expect(401);
        expectBodyMatchesSchema('get', '/auth/me', 401, res.body);
    });
    (0, vitest_1.it)('نشست جاری 200 ← SessionContext', async () => {
        const res = await api().get('/api/v1/auth/me').set(bearer()).expect(200);
        expectBodyMatchesSchema('get', '/auth/me', 200, res.body);
    });
    (0, vitest_1.it)('قفل حساب 423 ← Error (ورود با رمز)', async () => {
        await pool.query(`update app_user set is_locked = true where username = $1`, [USER]);
        try {
            const res = await api()
                .post('/api/v1/auth/login')
                .send({ username: USER, password: PASSWORD })
                .expect(423);
            expectBodyMatchesSchema('post', '/auth/login', 423, res.body);
            (0, vitest_1.expect)(res.body.code).toBe('account_locked');
        }
        finally {
            await pool.query(`update app_user set is_locked = false, failed_attempts = 0, locked_until = null
          where username = $1`, [USER]);
        }
    });
    (0, vitest_1.it)('سقف نرخ ورود 429 ← Error (LOGIN_MAX_PER_WINDOW تلاش در پنجره)', async () => {
        // نامِ ناموجود تا کلید نرخ (ip|username) از کاربر واقعیِ تست‌ها جدا بماند؛
        // سقف پیش‌فرض ۱۰ و از env هم قابل تغییر است (همان مقداری که سرویس می‌خواند)
        const max = Number(process.env.LOGIN_MAX_PER_WINDOW ?? 10);
        const rlUser = 'contract_rate_limited';
        for (let i = 0; i < max; i++) {
            const attempt = await api()
                .post('/api/v1/auth/login')
                .send({ username: rlUser, password: 'Wrong@1234' })
                .expect(401);
            expectBodyMatchesSchema('post', '/auth/login', 401, attempt.body);
        }
        const res = await api()
            .post('/api/v1/auth/login')
            .send({ username: rlUser, password: 'Wrong@1234' })
            .expect(429);
        expectBodyMatchesSchema('post', '/auth/login', 429, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('login_rate_limited');
    });
    (0, vitest_1.it)('refresh با توکن نامعتبر 401 ← Error', async () => {
        const res = await api()
            .post('/api/v1/auth/refresh')
            .send({ refresh_token: 'not-a-real-refresh-token' })
            .expect(401);
        expectBodyMatchesSchema('post', '/auth/refresh', 401, res.body);
    });
    (0, vitest_1.it)('logout بدون توکن 401 ← Error', async () => {
        const res = await api().post('/api/v1/auth/logout').expect(401);
        expectBodyMatchesSchema('post', '/auth/logout', 401, res.body);
    });
    /**
     * ردیف کدِ بازیابی رمز مستقیم در دیتابیس ساخته می‌شود چون درگاه پیامک در تست
     * قرارداد واقعی است (بدون override) و کدی به کنسول نمی‌آید.
     */
    const seedResetOtp = async (code, attempts = 0) => {
        await pool.query('delete from auth_otp where username = $1', [USER]);
        await pool.query(`insert into auth_otp (username, phone, purpose, code_hash, expires_at, attempts)
       values ($1, '09129999999', 'password_reset', $2, now() + interval '5 minutes', $3)`, [USER, await (0, password_1.hashPassword)(code), attempts]);
    };
    (0, vitest_1.it)('password-reset با بدنهٔ ناقص 400 ← Error (فیلدهای فارسی)', async () => {
        const res = await api().post('/api/v1/auth/password-reset').send({}).expect(400);
        expectBodyMatchesSchema('post', '/auth/password-reset', 400, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('validation_failed');
        (0, vitest_1.expect)(res.body.details.fields.username[0]).toMatch(/[؀-ۿ]/);
    });
    (0, vitest_1.it)('password-reset بدون کدِ در انتظار 401 ← Error (ضد-enumeration)', async () => {
        await pool.query('delete from auth_otp where username = $1', [USER]);
        const res = await api()
            .post('/api/v1/auth/password-reset')
            .send({ username: USER, code: '123456', new_password: 'NewPass@1234' })
            .expect(401);
        expectBodyMatchesSchema('post', '/auth/password-reset', 401, res.body);
    });
    (0, vitest_1.it)('password-reset با حساب قفل 423 ← Error؛ کد نمی‌سوزد', async () => {
        await seedResetOtp('778899');
        await pool.query(`update app_user set is_locked = true where username = $1`, [USER]);
        try {
            const res = await api()
                .post('/api/v1/auth/password-reset')
                .send({ username: USER, code: '778899', new_password: 'NewPass@1234' })
                .expect(423);
            expectBodyMatchesSchema('post', '/auth/password-reset', 423, res.body);
            (0, vitest_1.expect)(res.body.code).toBe('account_locked');
        }
        finally {
            await pool.query(`update app_user set is_locked = false where username = $1`, [USER]);
        }
        // کد مصرف نشده است (423 قبل از consume)؛ برای نشست‌های بعدی پاک می‌شود
        await pool.query('delete from auth_otp where username = $1', [USER]);
    });
    (0, vitest_1.it)('password-reset سقف تلاش کد 429 ← Error (پنجمین تلاش می‌سوزد)', async () => {
        await seedResetOtp('554433', 4);
        const res = await api()
            .post('/api/v1/auth/password-reset')
            .send({ username: USER, code: '000000', new_password: 'NewPass@1234' })
            .expect(429);
        expectBodyMatchesSchema('post', '/auth/password-reset', 429, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('otp_attempts_exceeded');
        await pool.query('delete from auth_otp where username = $1', [USER]);
    });
});
(0, vitest_1.describe)('B — پاسخ‌های /products علیه قرارداد', () => {
    let productId;
    (0, vitest_1.it)('لیست 200 ← Page + items[Product]', async () => {
        const res = await api().get('/api/v1/products').set(bearer()).expect(200);
        expectBodyMatchesSchema('get', '/products', 200, res.body);
    });
    (0, vitest_1.it)('فیلتر نامعتبر 400 ← Error', async () => {
        const res = await api()
            .get('/api/v1/products')
            .query({ category_id: 'not-a-uuid' })
            .set(bearer())
            .expect(400);
        expectBodyMatchesSchema('get', '/products', 400, res.body);
    });
    (0, vitest_1.it)('بدون مجوز کافی/بدون ورود 403 یا 401 ← Error (هر دو تعریف‌شده)', async () => {
        // 403 فقط وقتی توکن معتبر ولی بدون مجوز باشد؛ اینجا 401 مسیر مستندشده است
        const res = await api().get('/api/v1/products').expect(401);
        expectBodyMatchesSchema('get', '/products', 401, res.body);
    });
    (0, vitest_1.it)('ساخت 201 ← Product', async () => {
        const res = await api()
            .post('/api/v1/products')
            .set(bearer())
            .send({
            code: 'P-CTR-1',
            name: 'کالای تست قرارداد',
            category_id: categoryId,
            base_uom_id: uomId,
        })
            .expect(201);
        expectBodyMatchesSchema('post', '/products', 201, res.body);
        productId = String(res.body.id);
    });
    (0, vitest_1.it)('ساخت نامعتبر 400 ← Error', async () => {
        const res = await api()
            .post('/api/v1/products')
            .set(bearer())
            .send({ code: 'P-X' })
            .expect(400);
        expectBodyMatchesSchema('post', '/products', 400, res.body);
    });
    (0, vitest_1.it)('جزئیات 200 ← Product', async () => {
        const res = await api().get(`/api/v1/products/${productId}`).set(bearer()).expect(200);
        expectBodyMatchesSchema('get', '/products/{id}', 200, res.body);
    });
    (0, vitest_1.it)('شناسه ناموجود 404 ← Error', async () => {
        const res = await api()
            .get('/api/v1/products/11111111-1111-4111-8111-111111111111')
            .set(bearer())
            .expect(404);
        expectBodyMatchesSchema('get', '/products/{id}', 404, res.body);
    });
    (0, vitest_1.it)('شناسه خراب 400 ← Error', async () => {
        const res = await api().get('/api/v1/products/abc').set(bearer()).expect(400);
        expectBodyMatchesSchema('get', '/products/{id}', 400, res.body);
    });
    (0, vitest_1.it)('قفل خوش‌بینانه مغایر 409 ← Error', async () => {
        const res = await api()
            .patch(`/api/v1/products/${productId}`)
            .set(bearer())
            .send({ name: 'نام تازه', row_version: 999 })
            .expect(409);
        expectBodyMatchesSchema('patch', '/products/{id}', 409, res.body);
    });
    (0, vitest_1.it)('به‌روزرسانی 200 ← Product', async () => {
        const res = await api()
            .patch(`/api/v1/products/${productId}`)
            .set(bearer())
            .send({ name: 'نام تازه' })
            .expect(200);
        expectBodyMatchesSchema('patch', '/products/{id}', 200, res.body);
    });
    (0, vitest_1.it)('حذف نرم 204 بدون بدنه', async () => {
        const res = await api().delete(`/api/v1/products/${productId}`).set(bearer()).expect(204);
        (0, vitest_1.expect)(String(res.text ?? '')).toBe('');
        expectDocumentedStatus('delete', '/products/{id}', 204);
    });
    (0, vitest_1.it)('بعد از حذف 404 ← Error', async () => {
        const res = await api().get(`/api/v1/products/${productId}`).set(bearer()).expect(404);
        expectBodyMatchesSchema('get', '/products/{id}', 404, res.body);
    });
    (0, vitest_1.it)('بدون توکن 401 ← Error برای همهٔ عملیات‌های /products', async () => {
        const missing = '11111111-1111-4111-8111-111111111111';
        // GET /products (لیست) قبلاً در همین فایل 401 شده است
        expectBodyMatchesSchema('get', '/products/{id}', 401, (await api().get(`/api/v1/products/${missing}`).expect(401)).body);
        expectBodyMatchesSchema('post', '/products', 401, (await api().post('/api/v1/products').send({ code: 'P-NOPE' }).expect(401)).body);
        expectBodyMatchesSchema('patch', '/products/{id}', 401, (await api().patch(`/api/v1/products/${missing}`).send({ name: 'x' }).expect(401)).body);
        expectBodyMatchesSchema('delete', '/products/{id}', 401, (await api().delete(`/api/v1/products/${missing}`).expect(401)).body);
    });
    (0, vitest_1.it)('بدون مجوز کالا 403 ← Error برای همهٔ عملیات‌ها (کاربر بدون نقش)', async () => {
        const missing = '11111111-1111-4111-8111-111111111111';
        const viewer = { Authorization: `Bearer ${viewerToken}` };
        expectBodyMatchesSchema('get', '/products', 403, (await api().get('/api/v1/products').set(viewer).expect(403)).body);
        expectBodyMatchesSchema('post', '/products', 403, (await api().post('/api/v1/products').set(viewer).send({ code: 'P-VIEW' }).expect(403)).body);
        expectBodyMatchesSchema('get', '/products/{id}', 403, (await api().get(`/api/v1/products/${missing}`).set(viewer).expect(403)).body);
        expectBodyMatchesSchema('patch', '/products/{id}', 403, (await api().patch(`/api/v1/products/${missing}`).set(viewer).send({ name: 'x' }).expect(403)).body);
        expectBodyMatchesSchema('delete', '/products/{id}', 403, (await api().delete(`/api/v1/products/${missing}`).set(viewer).expect(403)).body);
    });
    (0, vitest_1.it)('کد تکراری در شرکت 409 ← Error (POST /products)', async () => {
        await api()
            .post('/api/v1/products')
            .set(bearer())
            .send({ code: 'P-CTR-2', name: 'کالای دوم قرارداد', category_id: categoryId, base_uom_id: uomId })
            .expect(201);
        const res = await api()
            .post('/api/v1/products')
            .set(bearer())
            .send({ code: 'P-CTR-2', name: 'تکراری', category_id: categoryId, base_uom_id: uomId })
            .expect(409);
        expectBodyMatchesSchema('post', '/products', 409, res.body);
    });
    (0, vitest_1.it)('PATCH نامعتبر 400 و شناسهٔ ناموجود 404 ← Error', async () => {
        const missing = '11111111-1111-4111-8111-111111111111';
        // قید اعتبارسنجی DTO (status خارج از دامنه) مقدم بر دسترسی به ردیف است
        const invalid = await api()
            .patch(`/api/v1/products/${missing}`)
            .set(bearer())
            .send({ status: 'not_a_status' })
            .expect(400);
        expectBodyMatchesSchema('patch', '/products/{id}', 400, invalid.body);
        const notFound = await api()
            .patch(`/api/v1/products/${missing}`)
            .set(bearer())
            .send({ name: 'ناموجود' })
            .expect(404);
        expectBodyMatchesSchema('patch', '/products/{id}', 404, notFound.body);
    });
    (0, vitest_1.it)('DELETE شناسهٔ ناموجود 404 ← Error', async () => {
        const res = await api()
            .delete('/api/v1/products/11111111-1111-4111-8111-111111111111')
            .set(bearer())
            .expect(404);
        expectBodyMatchesSchema('delete', '/products/{id}', 404, res.body);
    });
    (0, vitest_1.it)('همه خطاهای مستندشدهٔ /products در همین تست‌ها آزموده شده‌اند', () => {
        const ops = [
            ['get', '/products'],
            ['post', '/products'],
            ['get', '/products/{id}'],
            ['patch', '/products/{id}'],
            ['delete', '/products/{id}'],
        ];
        // مرجع: همان‌چه openapi.yaml برای این عملیات‌ها به‌عنوان خطا تعریف کرده است
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
        (0, vitest_1.expect)(missed, `این خطاهای مستندشدهٔ /products هنوز آزموده نشده‌اند:\n  ${missed.join('\n  ')}`).toEqual([]);
        const stray = [...exercisedErrors].filter((key) => ops.some(([m, p]) => key.startsWith(`${m.toUpperCase()} ${p} `)) &&
            Number(key.split(' ').at(-1)) >= 400 &&
            !documented.has(key));
        (0, vitest_1.expect)(stray, `پاسخ خطای آزموده‌شده خارج از قرارداد:\n  ${stray.join('\n  ')}`).toEqual([]);
    });
});
(0, vitest_1.describe)('B — داده‌های مرجع فرم کالا علیه قرارداد', () => {
    (0, vitest_1.it)('GET /product-categories 200 ← اسکیمای ProductCategory', async () => {
        const res = await api().get('/api/v1/product-categories').set(bearer()).expect(200);
        expectBodyMatchesSchema('get', '/product-categories', 200, res.body);
        (0, vitest_1.expect)(res.body.items.length).toBeGreaterThan(0); // دسته BEV در seed هست
    });
    (0, vitest_1.it)('GET /units 200 ← اسکیمای Unit', async () => {
        const res = await api().get('/api/v1/units').set(bearer()).expect(200);
        expectBodyMatchesSchema('get', '/units', 200, res.body);
        (0, vitest_1.expect)(res.body.items.length).toBeGreaterThan(0); // واحد pcs از seed 0022
    });
    (0, vitest_1.it)('بدون توکن → 401 (هر دو مسیر پشت AuthGuard)', async () => {
        await api().get('/api/v1/product-categories').expect(401);
        await api().get('/api/v1/units').expect(401);
    });
});
(0, vitest_1.describe)('B — پاسخ‌های /users و /roles علیه قرارداد', () => {
    let userId;
    let roleId;
    (0, vitest_1.it)('لیست کاربران 200 ← Page + items[User]', async () => {
        const res = await api().get('/api/v1/users').set(bearer()).expect(200);
        expectBodyMatchesSchema('get', '/users', 200, res.body);
    });
    (0, vitest_1.it)('بدون توکن 401 ← Error (هر دو مسیر)', async () => {
        expectBodyMatchesSchema('get', '/users', 401, (await api().get('/api/v1/users').expect(401)).body);
        expectBodyMatchesSchema('get', '/roles', 401, (await api().get('/api/v1/roles').expect(401)).body);
    });
    (0, vitest_1.it)('ساخت کاربر 201 ← User', async () => {
        const res = await api()
            .post('/api/v1/users')
            .set(bearer())
            .send({ username: 'contract_user_rbac', password: 'Ctr@ctPass1' })
            .expect(201);
        expectBodyMatchesSchema('post', '/users', 201, res.body);
        userId = String(res.body.id);
    });
    (0, vitest_1.it)('نام کاربری تکراری 409 ← Error', async () => {
        const res = await api()
            .post('/api/v1/users')
            .set(bearer())
            .send({ username: 'contract_user_rbac', password: 'Ctr@ctPass1' })
            .expect(409);
        expectBodyMatchesSchema('post', '/users', 409, res.body);
    });
    (0, vitest_1.it)('جزئیات/به‌روزرسانی کاربر 200 ← User', async () => {
        const detail = await api().get(`/api/v1/users/${userId}`).set(bearer()).expect(200);
        expectBodyMatchesSchema('get', '/users/{id}', 200, detail.body);
        const patched = await api()
            .patch(`/api/v1/users/${userId}`)
            .set(bearer())
            .send({ role_ids: [] })
            .expect(200);
        expectBodyMatchesSchema('patch', '/users/{id}', 200, patched.body);
    });
    (0, vitest_1.it)('شناسه ناموجود 404 ← Error', async () => {
        const res = await api()
            .get('/api/v1/users/11111111-1111-4111-8111-111111111111')
            .set(bearer())
            .expect(404);
        expectBodyMatchesSchema('get', '/users/{id}', 404, res.body);
    });
    (0, vitest_1.it)('ساخت نامعتبر 400 ← Error (نقش تعریف‌نشده و بدنه خالی)', async () => {
        // قید دامنه: role_ids باید برای همین شرکت ثبت شده باشد
        const domain = await api()
            .post('/api/v1/users')
            .set(bearer())
            .send({
            username: 'contract_user_400',
            role_ids: ['11111111-1111-4111-8111-111111111111'],
        })
            .expect(400);
        expectBodyMatchesSchema('post', '/users', 400, domain.body);
        // قید اعتبارسنجی DTO: username الزامی است
        const invalid = await api().post('/api/v1/users').set(bearer()).send({}).expect(400);
        expectBodyMatchesSchema('post', '/users', 400, invalid.body);
    });
    (0, vitest_1.it)('به‌روزرسانی 400 / 404 / 409 ← Error (هر سه مستندشده)', async () => {
        const invalid = await api()
            .patch(`/api/v1/users/${userId}`)
            .set(bearer())
            .send({ role_ids: ['11111111-1111-4111-8111-111111111111'] })
            .expect(400);
        expectBodyMatchesSchema('patch', '/users/{id}', 400, invalid.body);
        const missing = await api()
            .patch('/api/v1/users/11111111-1111-4111-8111-111111111111')
            .set(bearer())
            .send({ is_active: false })
            .expect(404);
        expectBodyMatchesSchema('patch', '/users/{id}', 404, missing.body);
        // نام کاربریِ متعلق به حساب دیگر → قید یکتایی دیتابیس → username_taken
        const conflict = await api()
            .patch(`/api/v1/users/${userId}`)
            .set(bearer())
            .send({ username: USER })
            .expect(409);
        expectBodyMatchesSchema('patch', '/users/{id}', 409, conflict.body);
    });
    (0, vitest_1.it)('حذف 404 (شناسه ناموجود) و 409 (حذف حساب خود) ← Error', async () => {
        const missing = await api()
            .delete('/api/v1/users/11111111-1111-4111-8111-111111111111')
            .set(bearer())
            .expect(404);
        expectBodyMatchesSchema('delete', '/users/{id}', 404, missing.body);
        const me = await pool.query('select id from app_user where username = $1', [
            USER,
        ]);
        const self = await api()
            .delete(`/api/v1/users/${me.rows[0].id}`)
            .set(bearer())
            .expect(409);
        expectBodyMatchesSchema('delete', '/users/{id}', 409, self.body);
    });
    (0, vitest_1.it)('غیرفعال‌سازی 204 بدون بدنه؛ ردیف می‌ماند و 200 ← User می‌دهد', async () => {
        const del = await api().delete(`/api/v1/users/${userId}`).set(bearer()).expect(204);
        (0, vitest_1.expect)(String(del.text ?? '')).toBe('');
        expectDocumentedStatus('delete', '/users/{id}', 204);
        const after = await api().get(`/api/v1/users/${userId}`).set(bearer()).expect(200);
        expectBodyMatchesSchema('get', '/users/{id}', 200, after.body);
        (0, vitest_1.expect)(after.body.is_active).toBe(false);
    });
    (0, vitest_1.it)('لیست نقش‌ها 200 ← Page + items[Role]', async () => {
        const res = await api().get('/api/v1/roles').set(bearer()).expect(200);
        expectBodyMatchesSchema('get', '/roles', 200, res.body);
    });
    (0, vitest_1.it)('ساخت نقش 201 ← Role', async () => {
        const created = await api()
            .post('/api/v1/roles')
            .set(bearer())
            .send({ code: 'contract_role_tmp', name: 'نقش موقت قرارداد' })
            .expect(201);
        expectBodyMatchesSchema('post', '/roles', 201, created.body);
        roleId = String(created.body.id);
    });
    (0, vitest_1.it)('کد نقش تکراری 409 ← Error', async () => {
        const res = await api()
            .post('/api/v1/roles')
            .set(bearer())
            .send({ code: 'contract_role_tmp', name: 'تکراری' })
            .expect(409);
        expectBodyMatchesSchema('post', '/roles', 409, res.body);
    });
    (0, vitest_1.it)('جزئیات نقش ناموجود 404 ← Error', async () => {
        const res = await api()
            .get('/api/v1/roles/11111111-1111-4111-8111-111111111111')
            .set(bearer())
            .expect(404);
        expectBodyMatchesSchema('get', '/roles/{id}', 404, res.body);
    });
    (0, vitest_1.it)('به‌روزرسانی نقش 400 (الگوی مجوز ناموجود) و 404 (شناسه ناموجود) ← Error', async () => {
        const invalid = await api()
            .patch(`/api/v1/roles/${roleId}`)
            .set(bearer())
            .send({ permission_codes: ['nope.perm'] })
            .expect(400);
        expectBodyMatchesSchema('patch', '/roles/{id}', 400, invalid.body);
        const missing = await api()
            .patch('/api/v1/roles/11111111-1111-4111-8111-111111111111')
            .set(bearer())
            .send({ name: 'ناموجود' })
            .expect(404);
        expectBodyMatchesSchema('patch', '/roles/{id}', 404, missing.body);
    });
    (0, vitest_1.it)('به‌روزرسانی نقش سیستمی 409 ← Error (system_role)', async () => {
        const sys = await pool.query(`insert into role (company_id, code, name, is_system)
       select id, 'contract_sys_role', 'نقش سیستمی قرارداد', true
         from company where code = 'CONTRACTCO'
       returning id`);
        const res = await api()
            .patch(`/api/v1/roles/${sys.rows[0].id}`)
            .set(bearer())
            .send({ code: 'contract_sys_renamed' })
            .expect(409);
        expectBodyMatchesSchema('patch', '/roles/{id}', 409, res.body);
    });
    (0, vitest_1.it)('ویرایش/حذف نقش ← Role و 204', async () => {
        const patched = await api()
            .patch(`/api/v1/roles/${roleId}`)
            .set(bearer())
            .send({ name: 'نقش موقت قرارداد (ویرایش‌شده)' })
            .expect(200);
        expectBodyMatchesSchema('patch', '/roles/{id}', 200, patched.body);
        const del = await api().delete(`/api/v1/roles/${roleId}`).set(bearer()).expect(204);
        (0, vitest_1.expect)(String(del.text ?? '')).toBe('');
        expectDocumentedStatus('delete', '/roles/{id}', 204);
    });
    (0, vitest_1.it)('الگوی مجوز ناموجود 400 ← Error', async () => {
        const res = await api()
            .post('/api/v1/roles')
            .set(bearer())
            .send({ code: 'bad_perm_role', name: 'نقش نامعتبر', permission_codes: ['nope.perm'] })
            .expect(400);
        expectBodyMatchesSchema('post', '/roles', 400, res.body);
    });
    (0, vitest_1.it)('حذف نقش دارای کاربر 409 ← Error', async () => {
        const list = await api().get('/api/v1/roles').set(bearer()).expect(200);
        const adminRole = list.body.items.find((r) => r.code === 'admin_full');
        (0, vitest_1.expect)(adminRole).toBeTruthy();
        const res = await api()
            .delete(`/api/v1/roles/${adminRole.id}`)
            .set(bearer())
            .expect(409);
        expectBodyMatchesSchema('delete', '/roles/{id}', 409, res.body);
    });
    (0, vitest_1.it)('GET /users با limit نامعتبر 400 ← Error (قید اعتبارسنجی query)', async () => {
        const res = await api().get('/api/v1/users').query({ limit: 0 }).set(bearer()).expect(400);
        expectBodyMatchesSchema('get', '/users', 400, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('validation_failed');
    });
    (0, vitest_1.it)('GET /roles/{id} با شناسهٔ خراب 400 ← Error (invalid_id)', async () => {
        const res = await api().get('/api/v1/roles/abc').set(bearer()).expect(400);
        expectBodyMatchesSchema('get', '/roles/{id}', 400, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('invalid_id');
    });
    (0, vitest_1.it)('DELETE /roles/{id} شناسهٔ ناموجود 404 ← Error', async () => {
        const res = await api()
            .delete('/api/v1/roles/11111111-1111-4111-8111-111111111111')
            .set(bearer())
            .expect(404);
        expectBodyMatchesSchema('delete', '/roles/{id}', 404, res.body);
    });
    (0, vitest_1.it)('همه خطاهای مستندشدهٔ /users و /roles در همین تست‌ها آزموده شده‌اند', () => {
        const ops = [
            ['get', '/users'],
            ['post', '/users'],
            ['get', '/users/{id}'],
            ['patch', '/users/{id}'],
            ['delete', '/users/{id}'],
            ['get', '/roles'],
            ['post', '/roles'],
            ['get', '/roles/{id}'],
            ['patch', '/roles/{id}'],
            ['delete', '/roles/{id}'],
        ];
        // مرجع: همان‌چه openapi.yaml برای این عملیات‌ها به‌عنوان خطا تعریف کرده است
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
        (0, vitest_1.expect)(missed, `این خطاهای مستندشدهٔ /users و /roles هنوز آزموده نشده‌اند:\n  ${missed.join('\n  ')}`).toEqual([]);
        // پوششِ آزموده‌شده باید زیرمجموعهٔ قرارداد باشد (expectBodyMatchesSchema این را
        // قبلاً هم تأیید می‌کند؛ اینجا صراحتاً بیان می‌شود تا تغییر سند سریع دیده شود)
        const opKeys = new Set(ops.map(([m, p]) => `${m.toUpperCase()} ${p} `));
        const stray = [...exercisedErrors].filter((key) => [...opKeys].some((prefix) => key.startsWith(prefix)) &&
            Number(key.split(' ').at(-1)) >= 400 && // فقط خطاهای آزموده‌شده (نه 2xx)
            !documented.has(key));
        (0, vitest_1.expect)(stray, `پاسخ خطای آزموده‌شده خارج از قرارداد:\n  ${stray.join('\n  ')}`).toEqual([]);
    });
});
(0, vitest_1.describe)('B — پاسخ‌های /auth/otp علیه قرارداد', () => {
    (0, vitest_1.it)('درخواست کد 202 بدون بدنه (پاسخ بدون اسکیما در سند)', async () => {
        const res = await api()
            .post('/api/v1/auth/otp/request')
            .send({ username: USER })
            .expect(202);
        (0, vitest_1.expect)(String(res.text ?? '')).toBe('');
        expectDocumentedStatus('post', '/auth/otp/request', 202);
    });
    (0, vitest_1.it)('درخواست مجدد فوری 429 ← Error', async () => {
        const res = await api()
            .post('/api/v1/auth/otp/request')
            .send({ username: USER })
            .expect(429);
        expectBodyMatchesSchema('post', '/auth/otp/request', 429, res.body);
    });
    (0, vitest_1.it)('تأیید بدون کدِ در انتظار 401 ← Error', async () => {
        const res = await api()
            .post('/api/v1/auth/otp/verify')
            .send({ username: 'nobody_at_all', code: '123456' })
            .expect(401);
        expectBodyMatchesSchema('post', '/auth/otp/verify', 401, res.body);
    });
    (0, vitest_1.it)('بدن ناقص verify 400 ← Error', async () => {
        const res = await api()
            .post('/api/v1/auth/otp/verify')
            .send({ username: USER })
            .expect(400);
        expectBodyMatchesSchema('post', '/auth/otp/verify', 400, res.body);
    });
    (0, vitest_1.it)('درخواست بدون username 400 ← Error با فیلدهای فارسی', async () => {
        const res = await api().post('/api/v1/auth/otp/request').send({}).expect(400);
        expectBodyMatchesSchema('post', '/auth/otp/request', 400, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('validation_failed');
        (0, vitest_1.expect)(res.body.details.fields.username[0]).toMatch(/[\u0600-\u06FF]/);
    });
    /**
     * کدِ در انتظار با دلیل و مهلت دلخواه — مستقیم در دیتابیس ساخته می‌شود چون
     * درگاه پیامک در تست قرارداد واقعی است (بدون override) و کدی به کنسول نمی‌آید.
     */
    const seedOtp = async (purpose, code, attempts = 0) => {
        await pool.query('delete from auth_otp where username = $1', [USER]);
        await pool.query(`insert into auth_otp (username, phone, purpose, code_hash, expires_at, attempts)
       values ($1, '09129999999', $2, $3, now() + interval '5 minutes', $4)`, [USER, purpose, await (0, password_1.hashPassword)(code), attempts]);
    };
    (0, vitest_1.it)('تأیید موفق 200 ← AuthSession با همان فیلدهایی که صفحه ورود می‌خواند', async () => {
        await seedOtp('login', '556677');
        const res = await api()
            .post('/api/v1/auth/otp/verify')
            .send({ username: USER, code: '556677' })
            .expect(200);
        expectBodyMatchesSchema('post', '/auth/otp/verify', 200, res.body);
        // صفحه ورود: setSession(data.access_token, data.user.username) و عمر توکن
        (0, vitest_1.expect)(typeof res.body.access_token).toBe('string');
        (0, vitest_1.expect)(typeof res.body.refresh_token).toBe('string');
        (0, vitest_1.expect)(res.body.user?.username).toBe(USER);
        (0, vitest_1.expect)(typeof res.body.expires_in).toBe('number');
        (0, vitest_1.expect)(res.body).not.toHaveProperty('password');
    });
    (0, vitest_1.it)('خطای 401 صفحه ورود را با message_fa پر می‌کند (errorMessage)', async () => {
        const res = await api()
            .post('/api/v1/auth/otp/verify')
            .send({ username: 'nobody_at_all', code: '123456' })
            .expect(401);
        expectBodyMatchesSchema('post', '/auth/otp/verify', 401, res.body);
        (0, vitest_1.expect)(typeof res.body.message_fa).toBe('string');
        (0, vitest_1.expect)(res.body.message_fa).toMatch(/[\u0600-\u06FF]/);
    });
    (0, vitest_1.it)('سقف تلاش کد 429 ← Error (پنجمین تلاش ناموفق می‌سوزد)', async () => {
        await seedOtp('login', '998877', 4);
        const res = await api()
            .post('/api/v1/auth/otp/verify')
            .send({ username: USER, code: '000000' })
            .expect(429);
        expectBodyMatchesSchema('post', '/auth/otp/verify', 429, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('otp_attempts_exceeded');
    });
    (0, vitest_1.it)('حساب قفل 423 ← Error؛ کد نمی‌سوزد و پس از بازشدن قفل همان کد کار می‌کند', async () => {
        await seedOtp('login', '332211');
        await pool.query(`update app_user set is_locked = true where username = $1`, [USER]);
        try {
            const res = await api()
                .post('/api/v1/auth/otp/verify')
                .send({ username: USER, code: '332211' })
                .expect(423);
            expectBodyMatchesSchema('post', '/auth/otp/verify', 423, res.body);
            (0, vitest_1.expect)(res.body.code).toBe('account_locked');
        }
        finally {
            await pool.query(`update app_user set is_locked = false where username = $1`, [USER]);
        }
        const ok = await api()
            .post('/api/v1/auth/otp/verify')
            .send({ username: USER, code: '332211' })
            .expect(200);
        expectBodyMatchesSchema('post', '/auth/otp/verify', 200, ok.body);
    });
    (0, vitest_1.it)('device_id متعلق به کاربر دیگر 403 ← Error (کد نمی‌سوزد)', async () => {
        // فقط برای همین آزمون: کاربر و دستگاه دیگر
        const otherPerson = await pool.query(`insert into person (company_id, code, first_name, last_name)
       values ((select id from company where code = 'CONTRACTCO'), 'P-CTR2', 'کاربر', 'دیگر')
       returning id`);
        const otherUser = await pool.query(`insert into app_user (person_id, username, access_level)
       values ($1, 'other_ctr', 'web') returning id`, [otherPerson.rows[0].id]);
        const device = await pool.query(`insert into device (app_user_id, device_uuid, platform, app_kind)
       values ($1, 'contract-other-device', 'android', 'sales') returning id`, [otherUser.rows[0].id]);
        await seedOtp('device_bind', '667788');
        const res = await api()
            .post('/api/v1/auth/otp/verify')
            .send({ username: USER, code: '667788', device_id: device.rows[0].id })
            .expect(403);
        expectBodyMatchesSchema('post', '/auth/otp/verify', 403, res.body);
        (0, vitest_1.expect)(res.body.code).toBe('device_not_owned');
    });
    (0, vitest_1.it)('همه خطاهای مستندشدهٔ /auth/otp/request و /auth/otp/verify آزموده شده‌اند', () => {
        const ops = [
            ['post', '/auth/otp/request'],
            ['post', '/auth/otp/verify'],
        ];
        // مرجع: همان‌چه openapi.yaml برای این دو عملیات به‌عنوان خطا تعریف کرده است
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
        (0, vitest_1.expect)(missed, `این خطاهای مستندشدهٔ صفحه ورود هنوز آزموده نشده‌اند:\n  ${missed.join('\n  ')}`).toEqual([]);
        // هر پاسخ خطای آزموده‌شده باید خودِ در قرارداد باشد (تغییر سند سریع دیده شود)
        const stray = [...exercisedErrors].filter((key) => ops.some(([m, p]) => key.startsWith(`${m.toUpperCase()} ${p} `)) &&
            Number(key.split(' ').at(-1)) >= 400 &&
            !documented.has(key));
        (0, vitest_1.expect)(stray, `پاسخ خطای آزموده‌شده خارج از قرارداد:\n  ${stray.join('\n  ')}`).toEqual([]);
    });
});
(0, vitest_1.describe)('B — پاسخ‌های /persons علیه قرارداد', () => {
    let personId = '';
    (0, vitest_1.it)('لیست 200 ← Page + items[Person] و بدون توکن 401 ← Error', async () => {
        const res = await api().get('/api/v1/persons').set(bearer()).expect(200);
        expectBodyMatchesSchema('get', '/persons', 200, res.body);
        const anon = await api().get('/api/v1/persons').expect(401);
        expectBodyMatchesSchema('get', '/persons', 401, anon.body);
    });
    (0, vitest_1.it)('فیلتر legal_type نامعتبر 400 ← Error (پیام فارسی فیلد)', async () => {
        const res = await api()
            .get('/api/v1/persons')
            .set(bearer())
            .query({ legal_type: 'real' })
            .expect(400);
        expectBodyMatchesSchema('get', '/persons', 400, res.body);
    });
    (0, vitest_1.it)('ساخت شخص حقیقی 201 ← Person', async () => {
        const res = await api()
            .post('/api/v1/persons')
            .set(bearer())
            .send({
            code: 'contract_person_1',
            legal_type: 'natural',
            first_name: 'قرارداد',
            last_name: 'اشخاص',
            national_id: '1234567890',
        })
            .expect(201);
        expectBodyMatchesSchema('post', '/persons', 201, res.body);
        personId = String(res.body.id);
    });
    (0, vitest_1.it)('کد تکراری 409 ← Error و نام نامعتبر 400 ← Error', async () => {
        const dup = await api()
            .post('/api/v1/persons')
            .set(bearer())
            .send({ code: 'contract_person_1', legal_type: 'natural', first_name: 'تکراری' })
            .expect(409);
        expectBodyMatchesSchema('post', '/persons', 409, dup.body);
        const invalid = await api()
            .post('/api/v1/persons')
            .set(bearer())
            .send({ code: 'contract_person_2', legal_type: 'legal' })
            .expect(400);
        expectBodyMatchesSchema('post', '/persons', 400, invalid.body);
    });
    (0, vitest_1.it)('جزئیات و ویرایش 200 ← Person؛ شناسه ناموجود 404 ← Error', async () => {
        const detail = await api()
            .get(`/api/v1/persons/${personId}`)
            .set(bearer())
            .expect(200);
        expectBodyMatchesSchema('get', '/persons/{id}', 200, detail.body);
        const patched = await api()
            .patch(`/api/v1/persons/${personId}`)
            .set(bearer())
            .send({ last_name: 'اشخاص (ویرایش‌شده)', is_active: false })
            .expect(200);
        expectBodyMatchesSchema('patch', '/persons/{id}', 200, patched.body);
        const missing = await api()
            .get('/api/v1/persons/11111111-1111-4111-8111-111111111111')
            .set(bearer())
            .expect(404);
        expectBodyMatchesSchema('get', '/persons/{id}', 404, missing.body);
    });
});
(0, vitest_1.describe)('B — پاسخ‌های /devices علیه قرارداد', () => {
    let deviceId = '';
    (0, vitest_1.it)('فهرست 200 ← Page + items[Device] و بدون توکن 401 ← Error', async () => {
        const res = await api().get('/api/v1/devices').set(bearer()).expect(200);
        expectBodyMatchesSchema('get', '/devices', 200, res.body);
        const anon = await api().get('/api/v1/devices').expect(401);
        expectBodyMatchesSchema('get', '/devices', 401, anon.body);
    });
    (0, vitest_1.it)('ثبت دستگاه 201 ← Device', async () => {
        const res = await api()
            .post('/api/v1/devices')
            .set(bearer())
            .send({
            device_uuid: 'contract-device-1',
            platform: 'android',
            app_kind: 'sales',
            app_version: '1.0.0',
            os_version: '14',
        })
            .expect(201);
        expectBodyMatchesSchema('post', '/devices', 201, res.body);
        (0, vitest_1.expect)(res.body.is_trusted).toBe(false);
        deviceId = String(res.body.id);
    });
    (0, vitest_1.it)('تکراری 409 ← Error و بدنه ناقص 400 ← Error', async () => {
        const dup = await api()
            .post('/api/v1/devices')
            .set(bearer())
            .send({ device_uuid: 'contract-device-1', platform: 'android', app_kind: 'sales' })
            .expect(409);
        expectBodyMatchesSchema('post', '/devices', 409, dup.body);
        const bad = await api()
            .post('/api/v1/devices')
            .set(bearer())
            .send({ platform: 'android' })
            .expect(400);
        expectBodyMatchesSchema('post', '/devices', 400, bad.body);
    });
    (0, vitest_1.it)('ابطال 204 بدون بدنه؛ شناسه ناموجود 404 و خراب 400 ← Error', async () => {
        expectDocumentedStatus('delete', '/devices/{id}', 204);
        const invalid = await api()
            .delete('/api/v1/devices/not-a-uuid')
            .set(bearer())
            .expect(400);
        expectBodyMatchesSchema('delete', '/devices/{id}', 400, invalid.body);
        const missing = await api()
            .delete('/api/v1/devices/11111111-1111-4111-8111-111111111111')
            .set(bearer())
            .expect(404);
        expectBodyMatchesSchema('delete', '/devices/{id}', 404, missing.body);
        const del = await api().delete(`/api/v1/devices/${deviceId}`).set(bearer()).expect(204);
        (0, vitest_1.expect)(String(del.text ?? '')).toBe('');
    });
    (0, vitest_1.it)('device_id دستگاه ناشناخته در verify 400 ← Error (کد نمی‌سوزد)', async () => {
        // کد device_bind مستقیم در جدول می‌شود (درگاه پیامک در تست قرارداد واقعی است)
        await pool.query('delete from auth_otp where username = $1', [USER]);
        await pool.query(`insert into auth_otp (username, phone, purpose, code_hash, expires_at)
       values ($1, '09129999999', 'device_bind', $2, now() + interval '5 minutes')`, [USER, await (0, password_1.hashPassword)('445566')]);
        const res = await api()
            .post('/api/v1/auth/otp/verify')
            .send({
            username: USER,
            code: '445566',
            device_id: '22222222-2222-4222-8222-222222222222',
        })
            .expect(400);
        expectBodyMatchesSchema('post', '/auth/otp/verify', 400, res.body);
        // همان کد باید هنوز معتبر باشد (مصرف نشده) → نشست صادر می‌شود
        const ok = await api()
            .post('/api/v1/auth/otp/verify')
            .send({ username: USER, code: '445566' })
            .expect(200);
        expectBodyMatchesSchema('post', '/auth/otp/verify', 200, ok.body);
    });
});
/**
 * پوشش خطاهای مستندشدهٔ /auth — عمداً در انتهای فایل است چون همهٔ عملیات‌های
 * این مسیر (از جمله otp/request و otp/verify) باید اول اجرا شده باشند تا
 * exercisedErrors کامل شود؛ الگوی همان assertion پوششی /users و /roles است.
 */
(0, vitest_1.describe)('B — پوشش خطاهای مستندشدهٔ همهٔ عملیات‌های /auth', () => {
    (0, vitest_1.it)('همه خطاهای مستندشدهٔ /auth در همین فایل آزموده شده‌اند', () => {
        const ops = [
            ['post', '/auth/login'],
            ['post', '/auth/refresh'],
            ['post', '/auth/logout'],
            ['get', '/auth/me'],
            ['post', '/auth/password-reset'],
            ['post', '/auth/otp/request'],
            ['post', '/auth/otp/verify'],
        ];
        // مرجع: همان‌چه openapi.yaml برای این عملیات‌ها به‌عنوان خطا تعریف کرده است
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
        (0, vitest_1.expect)(missed, `این خطاهای مستندشدهٔ /auth هنوز آزموده نشده‌اند:\n  ${missed.join('\n  ')}`).toEqual([]);
        // هر پاسخ خطای آزموده‌شده باید خودِش در قرارداد باشد (تغییر سند سریع دیده شود)
        const stray = [...exercisedErrors].filter((key) => ops.some(([m, p]) => key.startsWith(`${m.toUpperCase()} ${p} `)) &&
            Number(key.split(' ').at(-1)) >= 400 &&
            !documented.has(key));
        (0, vitest_1.expect)(stray, `پاسخ خطای آزموده‌شده خارج از قرارداد:\n  ${stray.join('\n  ')}`).toEqual([]);
    });
});
//# sourceMappingURL=contract.api.test.js.map