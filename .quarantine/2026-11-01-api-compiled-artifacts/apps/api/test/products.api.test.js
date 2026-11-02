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
const common_1 = require("@nestjs/common");
const testing_1 = require("@nestjs/testing");
const app_module_1 = require("../src/app.module");
const database_module_1 = require("../src/database/database.module");
const validation_1 = require("../src/common/validation");
const password_1 = require("../src/modules/identity-rbac/password");
/**
 * تست API کالا — CRUD کامل روی دیتابیس موقت «greendms_api_test»:
 * ۱) ساخت دیتابیس از صفر ۲) اجرای همه مهاجرت‌ها ۳) seed حداقلی (شرکت/دسته/واحد)
 * ۴) بالا آوردن واقعی AppModule با همان ValidationPipe سراسری ۵) اسناد HTTP با supertest
 * ۶) حذف دیتابیس در پایان (حتی در حالت شکست).
 */
const ROOT = node_path_1.default.resolve(node_path_1.default.dirname((0, node_url_1.fileURLToPath)(import.meta.url)), '..', '..', '..');
(0, dotenv_1.config)({ path: node_path_1.default.join(ROOT, '.env'), quiet: true });
const TEST_DB = 'greendms_api_test';
const PSQL = process.env.PSQL ?? 'C:/Program Files/PostgreSQL/16/bin/psql.exe';
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
let companyId;
let categoryId;
let uomId;
let createdId;
let token;
/**
 * کلاینت واردشده — همه درخواست‌ها با توکن نشست ارسال می‌شوند.
 * نکته supertest v7: request(server) فقط متد HTTP دارد؛ هدر باید روی Testِ
 * ساختهشده توسط متد (get/post/...) ست شود نه روی شیء پایه.
 */
const api = () => {
    const base = (0, supertest_1.default)(app.getHttpServer());
    const verb = (method) => (url) => {
        const req = base[method](url);
        return token ? req.set('Authorization', `Bearer ${token}`) : req;
    };
    return { get: verb('get'), post: verb('post'), patch: verb('patch'), delete: verb('delete') };
};
/** کلاینت بدون ورود — فقط برای آزمون 401 */
const anonApi = () => (0, supertest_1.default)(app.getHttpServer());
const ADMIN_USER = 'md_admin';
const ADMIN_PASSWORD = 'S3cret!pass';
/** UUID v4 معتبر (نسخه 4، گونه 8) — برای قیدهای isUUID در DTO و سرویس */
const uuid = () => '11111111-1111-4111-8111-111111111111';
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
    // ۳) حداقل داده وابستگی: شرکت + دسته‌بندی + واحد (واحد از seed مهاجرت 0022)
    pool = new pg_1.default.Pool({ connectionString: testUrl.toString(), max: 1 });
    const company = await pool.query(`insert into company (code, legal_name) values ('TESTCO', 'شرکت تست')
     returning id`);
    companyId = company.rows[0].id;
    const category = await pool.query(`insert into product_category (company_id, code, name) values ($1, 'BEV', 'نوشیدنی')
     returning id`, [companyId]);
    categoryId = category.rows[0].id;
    const uom = await pool.query(`select id from uom where code = 'pcs'`);
    uomId = uom.rows[0].id;
    // کاربر و نقش با مجوزهای کالا (permission از seed 0022 می‌آید)
    const passwordHash = await (0, password_1.hashPassword)(ADMIN_PASSWORD);
    const person = await pool.query(`insert into person (company_id, code, first_name, last_name)
     values ($1, 'ADM-1', 'مدیر', 'سیستم') returning id`, [companyId]);
    const personId = person.rows[0].id;
    await pool.query(`insert into app_user (person_id, username, password_hash, access_level)
     values ($1, $2, $3, 'web')`, [personId, ADMIN_USER, passwordHash]);
    const role = await pool.query(`insert into role (company_id, code, name) values ($1, 'tester', 'نقش تست کالا') returning id`, [companyId]);
    await pool.query(`insert into role_permission (role_id, permission_code)
     select $1, code from permission
      where code in ('master.product.view', 'master.product.create', 'master.product.update')`, [role.rows[0].id]);
    // انتساب نقش به کاربر (بدون user_role، PermissionsGuard مجوزی نمی‌بیند → 403)
    await pool.query(`insert into user_role (app_user_id, role_id)
     select u.id, $1 from app_user u where u.username = $2`, [role.rows[0].id, ADMIN_USER]);
    // ۴) اپ واقعی با همان پایپ سراسری (env باید قبل از ساخت Pool تنظیم شود)
    process.env.DATABASE_URL = testUrl.toString();
    const moduleRef = await testing_1.Test.createTestingModule({ imports: [app_module_1.AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    // همان پیکربندی main.ts: نسخه‌بندی مسیر + اعتبارسنجی سراسری
    app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });
    app.useGlobalPipes(new common_1.ValidationPipe(validation_1.validationPipeOptions));
    await app.init();
    // ورود واقعی برای دریافت توکن نشست
    const login = await (0, supertest_1.default)(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: ADMIN_USER, password: ADMIN_PASSWORD })
        .expect(200);
    token = login.body.access_token;
    (0, vitest_1.expect)(token).toBeTruthy();
}, 180_000);
(0, vitest_1.afterAll)(async () => {
    // اول پول اتصال خودِ اپ را ببند تا terminate پشت‌سرش خطای اتصال ندهد
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
const baseProduct = () => ({
    code: 'P-9001',
    name: 'کالای تست آب معدنی نیم‌لیتری',
    category_id: categoryId,
    base_uom_id: uomId,
});
(0, vitest_1.describe)('GET /api/v1/products — لیست', () => {
    (0, vitest_1.it)('روی دیتابیس خالی آیتم‌های صفحه‌بندی‌شده برمی‌گرداند', async () => {
        const res = await api().get('/api/v1/products').expect(200);
        (0, vitest_1.expect)(res.body).toEqual({ items: [], next_cursor: null, has_more: false });
    });
    (0, vitest_1.it)('بدون توکن → 401 با قرارداد Error', async () => {
        const res = await anonApi().get('/api/v1/products').expect(401);
        (0, vitest_1.expect)(res.body.code).toBe('unauthorized');
        (0, vitest_1.expect)(res.body.message_fa).toBeTruthy();
    });
    (0, vitest_1.it)('شرکت از نشست می‌آید؛ company_id در query نادیده گرفته می‌شود (درز چندشرکتی ندارد)', async () => {
        const other = await pool.query(`insert into company (code, legal_name) values ('OTHERCO', 'شرکت دیگر') returning id`);
        await pool.query(`insert into product (company_id, code, name, category_id, base_uom_id)
       values ($1, 'P-OTHER', 'کالای شرکت دیگر', $2, $3)`, [other.rows[0].id, categoryId, uomId]);
        const res = await api()
            .get('/api/v1/products')
            .query({ company_id: other.rows[0].id })
            .expect(200);
        (0, vitest_1.expect)(res.body.items.some((p) => p.code === 'P-OTHER')).toBe(false);
    });
});
(0, vitest_1.describe)('POST /api/v1/products — اعتبارسنجی', () => {
    (0, vitest_1.it)('بدون name پاسخ 400 با کد validation_failed و فیلد فارسی می‌دهد', async () => {
        const res = await api().post('/api/v1/products').send({ code: 'P-X' }).expect(400);
        (0, vitest_1.expect)(res.body.code).toBe('validation_failed');
        (0, vitest_1.expect)(res.body.message_fa).toContain('نامعتبر');
        (0, vitest_1.expect)(res.body.details.fields).toHaveProperty('name');
        // پیام جزئی هر فیلد هم باید فارسی باشد (details قرارداد فارسی بماند)
        (0, vitest_1.expect)(res.body.details.fields.name[0]).toMatch(/[\u0600-\u06FF]/);
    });
    (0, vitest_1.it)('category_id غیر uuid را رد می‌کند', async () => {
        const res = await api()
            .post('/api/v1/products')
            .send({ ...baseProduct(), category_id: 'not-a-uuid' })
            .expect(400);
        (0, vitest_1.expect)(res.body.code).toBe('validation_failed');
        (0, vitest_1.expect)(res.body.details.fields).toHaveProperty('category_id');
        (0, vitest_1.expect)(res.body.details.fields.category_id[0]).toMatch(/[\u0600-\u06FF]/);
    });
});
(0, vitest_1.describe)('POST /api/v1/products — ساخت', () => {
    (0, vitest_1.it)('ساخت موفق → 201 با row_version صفر و وضعیت active', async () => {
        const res = await api().post('/api/v1/products').send(baseProduct()).expect(201);
        createdId = res.body.id;
        (0, vitest_1.expect)(createdId).toMatch(/^[0-9a-f-]{36}$/);
        (0, vitest_1.expect)(res.body.code).toBe('P-9001');
        (0, vitest_1.expect)(res.body.status).toBe('active');
        (0, vitest_1.expect)(res.body.row_version).toBe(0);
        (0, vitest_1.expect)(res.body.distribution_kind).toBe('both'); // مقدار پیش‌فرض DDL
        (0, vitest_1.expect)(res.body.created_at).toBeTruthy();
    });
    (0, vitest_1.it)('کد تکراری در همان شرکت → 409 duplicate_code', async () => {
        const res = await api().post('/api/v1/products').send(baseProduct()).expect(409);
        (0, vitest_1.expect)(res.body.code).toBe('duplicate_code');
        (0, vitest_1.expect)(res.body.message_fa).toContain('قبلاً ثبت');
    });
    (0, vitest_1.it)('دسته‌بندی متعلق به شرکت دیگر → 400 invalid_category', async () => {
        const res = await api()
            .post('/api/v1/products')
            .send({ ...baseProduct(), code: 'P-9002', category_id: uuid() })
            .expect(400);
        (0, vitest_1.expect)(res.body.code).toBe('invalid_category');
    });
    (0, vitest_1.it)('انقضادار بدون ردیابی بچ (قید دیتابیس) → 400 check_violation', async () => {
        const res = await api()
            .post('/api/v1/products')
            .send({
            ...baseProduct(),
            code: 'P-9003',
            is_expiry_tracked: true,
            is_batch_tracked: false,
        })
            .expect(400);
        (0, vitest_1.expect)(res.body.code).toBe('check_violation');
        (0, vitest_1.expect)(res.body.message_fa).toContain('ck_product_batch');
    });
});
(0, vitest_1.describe)('GET /api/v1/products/{id}', () => {
    (0, vitest_1.it)('شناسه درست → 200', async () => {
        const res = await api().get(`/api/v1/products/${createdId}`).expect(200);
        (0, vitest_1.expect)(res.body.code).toBe('P-9001');
    });
    (0, vitest_1.it)('ناموجود → 404 با کد not_found', async () => {
        const res = await api().get(`/api/v1/products/${uuid()}`).expect(404);
        (0, vitest_1.expect)(res.body.code).toBe('not_found');
    });
    (0, vitest_1.it)('شناسه ناقص → 400 با کد invalid_id (فرمت قرارداد، نه پیام پیش‌فرض Nest)', async () => {
        const res = await api().get('/api/v1/products/abc').expect(400);
        (0, vitest_1.expect)(res.body.code).toBe('invalid_id');
        (0, vitest_1.expect)(res.body.message_fa).toBeTruthy();
    });
});
(0, vitest_1.describe)('GET /api/v1/products — فیلترها', () => {
    (0, vitest_1.it)('q فقط کالای تطبیق‌آمیز را برمی‌گرداند', async () => {
        const res = await api().get('/api/v1/products').query({ q: 'آب معدنی' }).expect(200);
        (0, vitest_1.expect)(res.body.items).toHaveLength(1);
        (0, vitest_1.expect)(res.body.items[0].code).toBe('P-9001');
    });
    (0, vitest_1.it)('فیلتر status', async () => {
        const res = await api().get('/api/v1/products').query({ status: 'active' }).expect(200);
        (0, vitest_1.expect)(res.body.items.some((p) => p.code === 'P-9001')).toBe(true);
        const none = await api().get('/api/v1/products').query({ status: 'blocked' }).expect(200);
        (0, vitest_1.expect)(none.body.items).toHaveLength(0);
    });
});
(0, vitest_1.describe)('PATCH /api/v1/products/{id} — قفل خوش‌بینانه', () => {
    (0, vitest_1.it)('بروزرسانی نام → 200 و row_version با تریگر trg_touch از ۰ به ۱ می‌رود', async () => {
        const res = await api()
            .patch(`/api/v1/products/${createdId}`)
            .send({ name: 'کالای تست آب معدنی (ویرایش‌شده)' })
            .expect(200);
        (0, vitest_1.expect)(res.body.name).toContain('ویرایش‌شده');
        (0, vitest_1.expect)(res.body.row_version).toBe(1);
    });
    (0, vitest_1.it)('ارسال row_version کهنه → 409 version_conflict', async () => {
        const res = await api()
            .patch(`/api/v1/products/${createdId}`)
            .send({ name: 'تغییر هم‌زمان', row_version: 0 })
            .expect(409);
        (0, vitest_1.expect)(res.body.code).toBe('version_conflict');
    });
    (0, vitest_1.it)('بدون row_version (ویرایش معمولی) مجاز است', async () => {
        const res = await api()
            .patch(`/api/v1/products/${createdId}`)
            .send({ status: 'blocked' })
            .expect(200);
        (0, vitest_1.expect)(res.body.status).toBe('blocked');
        (0, vitest_1.expect)(res.body.row_version).toBe(2);
        // برگرداندن برای تست‌های بعدی
        await api().patch(`/api/v1/products/${createdId}`).send({ status: 'active' }).expect(200);
    });
});
(0, vitest_1.describe)('صفحه‌بندی cursor', () => {
    (0, vitest_1.it)('ساخت کالای دوم با کد کوچک‌تر', async () => {
        await api()
            .post('/api/v1/products')
            .send({ ...baseProduct(), code: 'P-9000', name: 'کالای تست دوغ پاکتی' })
            .expect(201);
    });
    (0, vitest_1.it)('limit=1 → یک آیتم، has_more و cursor', async () => {
        const res = await api()
            .get('/api/v1/products')
            .query({ q: 'P-90', limit: 1 })
            .expect(200);
        (0, vitest_1.expect)(res.body.items).toHaveLength(1);
        (0, vitest_1.expect)(res.body.items[0].code).toBe('P-9000'); // مرتب‌سازی صعودی کد
        (0, vitest_1.expect)(res.body.has_more).toBe(true);
        (0, vitest_1.expect)(res.body.next_cursor).toBeTruthy();
    });
    (0, vitest_1.it)('صفحه دوم با cursor → بدون هم‌پوشانی و پایان', async () => {
        const first = await api()
            .get('/api/v1/products')
            .query({ q: 'P-90', limit: 1 })
            .expect(200);
        const res = await api()
            .get('/api/v1/products')
            .query({ q: 'P-90', limit: 1, cursor: first.body.next_cursor })
            .expect(200);
        (0, vitest_1.expect)(res.body.items[0].code).toBe('P-9001');
        (0, vitest_1.expect)(res.body.has_more).toBe(false);
        (0, vitest_1.expect)(res.body.next_cursor).toBeNull();
    });
});
(0, vitest_1.describe)('DELETE /api/v1/products/{id} — حذف نرم', () => {
    (0, vitest_1.it)('حذف موفق → 204 بدون بدنه', async () => {
        const list = await api().get('/api/v1/products').query({ q: 'P-9000' }).expect(200);
        const target = list.body.items[0];
        await api().delete(`/api/v1/products/${target.id}`).expect(204);
    });
    (0, vitest_1.it)('بعد از حذف، GET → 404 و از لیست هم خارج می‌شود', async () => {
        const list = await api().get('/api/v1/products').query({ q: 'P-9000' }).expect(200);
        (0, vitest_1.expect)(list.body.items).toHaveLength(0);
        const gone = await api().delete(`/api/v1/products/${uuid()}`).expect(404);
        (0, vitest_1.expect)(gone.body.code).toBe('not_found');
    });
});
//# sourceMappingURL=products.api.test.js.map