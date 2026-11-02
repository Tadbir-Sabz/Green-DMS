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
 * تست API کاربران و نقش‌ها — /users و /roles با همان گاردهای ماژول (AuthGuard +
 * PermissionsGuard روی admin.user.manage / admin.role.manage):
 * ۱) ساخت دیتابیس موقت «greendms_users_test» از صفر + همه مهاجرت‌ها
 * ۲) seed حداقلی: دو شرکت (برای اثبات جداسازی)، ادمین، کاربر فاقد مجوز، پرسنل/شعبه
 * ۳) بالا آوردن واقعی AppModule با همان ValidationPipe سراسری
 * ۴) اسناد HTTP با supertest و حذف دیتابیس در پایان (حتی در حالت شکست)
 */
const ROOT = node_path_1.default.resolve(node_path_1.default.dirname((0, node_url_1.fileURLToPath)(import.meta.url)), '..', '..', '..');
(0, dotenv_1.config)({ path: node_path_1.default.join(ROOT, '.env'), quiet: true });
const TEST_DB = 'greendms_users_test';
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
const ADMIN_USER = 'rbac_admin';
const ADMIN_PASSWORD = 'S3cret!pass';
const VIEWER_USER = 'viewer1';
const VIEWER_PASSWORD = 'View!pass1';
const NEW_PASSWORD = 'New!pass12';
let adminToken = '';
let viewerToken = '';
let adminId = '';
let viewer1Id = '';
let newUserId = '';
let foreignUserId = '';
let adminRoleId = '';
let viewerRoleId = '';
let sysRoleId = '';
let staffId = '';
let reporterRoleId = '';
/** UUID v4 معتبر برای قیدهای isUUID در DTO و سرویس‌ها */
const randomUuid = () => '22222222-2222-4222-8222-222222222222';
/**
 * کلاینت HTTP؛ بدون آرگومان با توکن ادمین، با null بدون توکن (آزمون 401)،
 * و با توکن کاربر دیگر برای آزمون 403.
 */
const api = (token) => {
    const base = (0, supertest_1.default)(app.getHttpServer());
    const use = token === undefined ? adminToken : token;
    const verb = (method) => (url) => {
        const req = base[method](url);
        return use ? req.set('Authorization', `Bearer ${use}`) : req;
    };
    return { get: verb('get'), post: verb('post'), patch: verb('patch'), delete: verb('delete') };
};
const login = async (username, password) => {
    const res = await (0, supertest_1.default)(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username, password })
        .expect(200);
    return res.body.access_token;
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
    const company = await pool.query(`insert into company (code, legal_name) values ('RBACCO', 'شرکت تست دسترسی') returning id`);
    const companyId = company.rows[0].id;
    // شرکت دیگر با کاربر و نقش خودش — برای اثبات جداسازی چندشرکتی
    const other = await pool.query(`insert into company (code, legal_name) values ('OTHERCO', 'شرکت دیگر') returning id`);
    const otherCompanyId = other.rows[0].id;
    const otherPerson = await pool.query(`insert into person (company_id, code, first_name, last_name)
     values ($1, 'OP-1', 'کاربر', 'دیگر') returning id`, [otherCompanyId]);
    const foreign = await pool.query(`insert into app_user (person_id, username, password_hash, access_level)
     values ($1, 'foreign_user', $2, 'web') returning id`, [otherPerson.rows[0].id, viewerHash]);
    foreignUserId = foreign.rows[0].id;
    const otherRole = await pool.query(`insert into role (company_id, code, name) values ($1, 'other_role', 'نقش شرکت دیگر') returning id`, [otherCompanyId]);
    // شعبه/شغل/پرسنل — برای آزمون ساخت کاربر از روی staff_id
    const branch = await pool.query(`insert into branch (company_id, code, name) values ($1, 'BR1', 'شعبه مرکزی') returning id`, [companyId]);
    const job = await pool.query(`insert into job_position (company_id, code, title) values ($1, 'SALES', 'ویزیتور') returning id`, [companyId]);
    const staffPerson = await pool.query(`insert into person (company_id, code, first_name, last_name)
     values ($1, 'STF-1', 'علی', 'ویزیتور') returning id`, [companyId]);
    const staff = await pool.query(`insert into staff (person_id, branch_id, job_position_id, employee_no, is_field)
     values ($1, $2, $3, 'E-1', true) returning id`, [staffPerson.rows[0].id, branch.rows[0].id, job.rows[0].id]);
    staffId = staff.rows[0].id;
    // ادمین با همه مجوزها (permission از seed مهاجرت 0022 می‌آید)
    const adminPerson = await pool.query(`insert into person (company_id, code, first_name, last_name)
     values ($1, 'ADM-1', 'مدیر', 'سیستم') returning id`, [companyId]);
    await pool.query(`insert into app_user (person_id, username, password_hash, access_level)
     values ($1, $2, $3, 'web')`, [adminPerson.rows[0].id, ADMIN_USER, adminHash]);
    const adminRole = await pool.query(`insert into role (company_id, code, name) values ($1, 'admin_full', 'مدیر کامل') returning id`, [companyId]);
    adminRoleId = adminRole.rows[0].id;
    await pool.query(`insert into role_permission (role_id, permission_code)
     select $1, code from permission`, [adminRoleId]);
    // انتساب نقش به ادمین (بدون آن PermissionsGuard مجوزی نمی‌بیند → 403)
    await pool.query(`insert into user_role (app_user_id, role_id)
     select u.id, $1 from app_user u where u.username = $2`, [adminRoleId, ADMIN_USER]);
    // نقش بیننده (بدون مجوز admin.*) + کاربر دارنده‌اش
    const viewerRole = await pool.query(`insert into role (company_id, code, name) values ($1, 'viewer', 'بیننده') returning id`, [companyId]);
    viewerRoleId = viewerRole.rows[0].id;
    await pool.query(`insert into role_permission (role_id, permission_code)
     select $1, code from permission where code = 'master.product.view'`, [viewerRoleId]);
    const viewerPerson = await pool.query(`insert into person (company_id, code, first_name, last_name)
     values ($1, 'VW-1', 'بیننده', 'آزمایشی') returning id`, [companyId]);
    const viewer = await pool.query(`insert into app_user (person_id, username, password_hash, access_level)
     values ($1, $2, $3, 'web') returning id`, [viewerPerson.rows[0].id, VIEWER_USER, viewerHash]);
    viewer1Id = viewer.rows[0].id;
    await pool.query('insert into user_role (app_user_id, role_id) values ($1, $2)', [
        viewer1Id,
        viewerRoleId,
    ]);
    // نقش سیستمی (برای قید حذف‌نشدن)
    const sysRole = await pool.query(`insert into role (company_id, code, name, is_system)
     values ($1, 'sys_frozen', 'نقش سیستمی آزمایشی', true) returning id`, [companyId]);
    sysRoleId = sysRole.rows[0].id;
    // شناسه ادمین (برای آزمون «غیرفعال‌سازی خود»)
    const adminUser = await pool.query(`select id from app_user where username = $1`, [ADMIN_USER]);
    adminId = adminUser.rows[0].id;
    // ۴) اپ واقعی با همان پایپ سراسری
    process.env.DATABASE_URL = testUrl.toString();
    const moduleRef = await testing_1.Test.createTestingModule({ imports: [app_module_1.AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });
    app.useGlobalPipes(new common_1.ValidationPipe(validation_1.validationPipeOptions));
    await app.init();
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
// =====================================================================
// احراز هویت و مجوز (AuthGuard + PermissionsGuard)
// =====================================================================
(0, vitest_1.describe)('گاردها — ورود و مجوز', () => {
    (0, vitest_1.it)('بدون توکن GET /users → 401 با قرارداد Error', async () => {
        const res = await api(null).get('/api/v1/users').expect(401);
        (0, vitest_1.expect)(res.body.code).toBe('unauthorized');
        (0, vitest_1.expect)(res.body.message_fa).toBeTruthy();
    });
    (0, vitest_1.it)('بدون توکن GET /roles → 401', async () => {
        const res = await api(null).get('/api/v1/roles').expect(401);
        (0, vitest_1.expect)(res.body.code).toBe('unauthorized');
    });
    (0, vitest_1.it)('کاربر بدون admin.user.manage → 403 با جزئیات مجوز', async () => {
        const res = await api(viewerToken).get('/api/v1/users').expect(403);
        (0, vitest_1.expect)(res.body.code).toBe('forbidden');
        (0, vitest_1.expect)(res.body.details.required).toEqual(['admin.user.manage']);
    });
    (0, vitest_1.it)('کاربر بدون admin.role.manage → 403 روی POST /roles', async () => {
        const res = await api(viewerToken)
            .post('/api/v1/roles')
            .send({ code: 'x', name: 'اینجا مجاز نیست' })
            .expect(403);
        (0, vitest_1.expect)(res.body.code).toBe('forbidden');
    });
});
// =====================================================================
// GET /users — لیست، فیلترها، جداسازی شرکت، صفحه‌بندی
// =====================================================================
(0, vitest_1.describe)('GET /users — لیست و فیلترها', () => {
    (0, vitest_1.it)('فقط کاربران شرکتِ نشست را برمی‌گرداند (کاربر شرکت دیگر نیست)', async () => {
        const res = await api().get('/api/v1/users').expect(200);
        const usernames = res.body.items.map((u) => u.username).sort();
        (0, vitest_1.expect)(usernames).toEqual([ADMIN_USER, VIEWER_USER]);
        (0, vitest_1.expect)(res.body.has_more).toBe(false);
        (0, vitest_1.expect)(res.body.next_cursor).toBeNull();
        const admin = res.body.items.find((u) => u.username === ADMIN_USER);
        (0, vitest_1.expect)(admin.id).toBe(adminId);
        (0, vitest_1.expect)(admin.role_ids).toEqual([adminRoleId]);
        (0, vitest_1.expect)(admin.is_active).toBe(true);
        (0, vitest_1.expect)(admin.staff_id).toBeNull();
        (0, vitest_1.expect)(admin.locked_until).toBeNull();
        (0, vitest_1.expect)(admin.created_at).toBeTruthy();
    });
    (0, vitest_1.it)('کاربر شرکت دیگر با شناسه هم قابل دسترسی نیست (404)', async () => {
        await api().get(`/api/v1/users/${foreignUserId}`).expect(404);
    });
    (0, vitest_1.it)('فیلتر is_active', async () => {
        const active = await api().get('/api/v1/users').query({ is_active: 'true' }).expect(200);
        (0, vitest_1.expect)(active.body.items).toHaveLength(2);
        const inactive = await api().get('/api/v1/users').query({ is_active: 'false' }).expect(200);
        (0, vitest_1.expect)(inactive.body.items).toHaveLength(0);
    });
    (0, vitest_1.it)('فیلتر role با کد و با شناسه', async () => {
        const byCode = await api().get('/api/v1/users').query({ role: 'admin_full' }).expect(200);
        (0, vitest_1.expect)(byCode.body.items).toHaveLength(1);
        (0, vitest_1.expect)(byCode.body.items[0].username).toBe(ADMIN_USER);
        const byId = await api().get('/api/v1/users').query({ role: adminRoleId }).expect(200);
        (0, vitest_1.expect)(byId.body.items).toHaveLength(1);
    });
    (0, vitest_1.it)('صفحه‌بندی cursor: limit=1 صفحه اول و دوم بدون هم‌پوشانی', async () => {
        const first = await api().get('/api/v1/users').query({ limit: 1 }).expect(200);
        (0, vitest_1.expect)(first.body.items).toHaveLength(1);
        (0, vitest_1.expect)(first.body.items[0].username).toBe(ADMIN_USER); // ترتیب صعودی username
        (0, vitest_1.expect)(first.body.has_more).toBe(true);
        (0, vitest_1.expect)(first.body.next_cursor).toBeTruthy();
        const second = await api()
            .get('/api/v1/users')
            .query({ limit: 1, cursor: first.body.next_cursor })
            .expect(200);
        (0, vitest_1.expect)(second.body.items[0].username).toBe(VIEWER_USER);
        (0, vitest_1.expect)(second.body.has_more).toBe(false);
        (0, vitest_1.expect)(second.body.next_cursor).toBeNull();
    });
});
// =====================================================================
// POST /users — ساخت
// =====================================================================
(0, vitest_1.describe)('POST /users — اعتبارسنجی و ساخت', () => {
    (0, vitest_1.it)('بدون username → 400 validation_failed با فیلد فارسی', async () => {
        const res = await api().post('/api/v1/users').send({}).expect(400);
        (0, vitest_1.expect)(res.body.code).toBe('validation_failed');
        (0, vitest_1.expect)(res.body.message_fa).toContain('نامعتبر');
        (0, vitest_1.expect)(res.body.details.fields).toHaveProperty('username');
        (0, vitest_1.expect)(res.body.details.fields.username[0]).toMatch(/[\u0600-\u06FF]/);
    });
    (0, vitest_1.it)('role_ids غیر uuid → 400 با فیلد فارسی', async () => {
        const res = await api()
            .post('/api/v1/users')
            .send({ username: 'bad_role_user', role_ids: ['not-a-uuid'] })
            .expect(400);
        (0, vitest_1.expect)(res.body.code).toBe('validation_failed');
        (0, vitest_1.expect)(res.body.details.fields).toHaveProperty('role_ids');
        (0, vitest_1.expect)(res.body.details.fields.role_ids[0]).toMatch(/[\u0600-\u06FF]/);
    });
    (0, vitest_1.it)('نقش متعلق به شرکت دیگر → 400 invalid_role با فهرست missing', async () => {
        const otherRole = await pool.query(`select id from role where code = 'other_role'`);
        const res = await api()
            .post('/api/v1/users')
            .send({ username: 'cross_user', role_ids: [otherRole.rows[0].id] })
            .expect(400);
        (0, vitest_1.expect)(res.body.code).toBe('invalid_role');
        (0, vitest_1.expect)(res.body.details.missing).toEqual([otherRole.rows[0].id]);
    });
    (0, vitest_1.it)('پرسنل ناموجود (staff_id) → 400 invalid_staff', async () => {
        const res = await api()
            .post('/api/v1/users')
            .send({ username: 'no_staff_user', staff_id: randomUuid() })
            .expect(400);
        (0, vitest_1.expect)(res.body.code).toBe('invalid_staff');
    });
    (0, vitest_1.it)('ساخت موفق → 201 با شخص تازه، نقش‌ها و فیلدهای readOnly قرارداد', async () => {
        const res = await api()
            .post('/api/v1/users')
            .send({
            username: 'newuser',
            password: NEW_PASSWORD,
            role_ids: [viewerRoleId],
            first_name: 'کاربر',
            last_name: 'تازه',
        })
            .expect(201);
        newUserId = res.body.id;
        (0, vitest_1.expect)(newUserId).toMatch(/^[0-9a-f-]{36}$/);
        (0, vitest_1.expect)(res.body.username).toBe('newuser');
        (0, vitest_1.expect)(res.body.role_ids).toEqual([viewerRoleId]);
        (0, vitest_1.expect)(res.body.is_active).toBe(true);
        (0, vitest_1.expect)(res.body.staff_id).toBeNull();
        (0, vitest_1.expect)(res.body.locked_until).toBeNull();
        (0, vitest_1.expect)(res.body.last_login_at).toBeNull();
        (0, vitest_1.expect)(res.body.created_at).toBeTruthy();
        // فقط-خواندنی‌ها را نباید پذیرفت (whitelist آن‌ها را حذف می‌کند)
        (0, vitest_1.expect)(res.body.is_system).toBeUndefined();
    });
    (0, vitest_1.it)('کاربر تازه می‌تواند وارد شود و /auth/me نقش و مجوزش را ببیند', async () => {
        const token = await login('newuser', NEW_PASSWORD);
        const me = await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/v1/auth/me')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);
        (0, vitest_1.expect)(me.body.roles).toEqual(['viewer']);
        (0, vitest_1.expect)(me.body.permissions).toContain('master.product.view');
    });
    (0, vitest_1.it)('نام کاربری تکراری → 409 username_taken', async () => {
        const res = await api()
            .post('/api/v1/users')
            .send({ username: 'newuser', password: NEW_PASSWORD })
            .expect(409);
        (0, vitest_1.expect)(res.body.code).toBe('username_taken');
        (0, vitest_1.expect)(res.body.message_fa).toContain('قبلاً ثبت');
    });
    (0, vitest_1.it)('ساخت از روی پرسنل موجود (staff_id) → staff_id در پاسخ می‌آید', async () => {
        const res = await api()
            .post('/api/v1/users')
            .send({ username: 'staffuser', password: NEW_PASSWORD, staff_id: staffId })
            .expect(201);
        (0, vitest_1.expect)(res.body.staff_id).toBe(staffId);
        (0, vitest_1.expect)(res.body.role_ids).toEqual([]);
    });
});
// =====================================================================
// GET /users/{id}
// =====================================================================
(0, vitest_1.describe)('GET /users/{id}', () => {
    (0, vitest_1.it)('شناسه درست → 200', async () => {
        const res = await api().get(`/api/v1/users/${newUserId}`).expect(200);
        (0, vitest_1.expect)(res.body.username).toBe('newuser');
    });
    (0, vitest_1.it)('شناسه ناقص → 400 invalid_id (نه پیام پیش‌فرض Nest)', async () => {
        const res = await api().get('/api/v1/users/abc').expect(400);
        (0, vitest_1.expect)(res.body.code).toBe('invalid_id');
        (0, vitest_1.expect)(res.body.message_fa).toBeTruthy();
    });
    (0, vitest_1.it)('ناموجود → 404 با کد not_found', async () => {
        const res = await api().get(`/api/v1/users/${randomUuid()}`).expect(404);
        (0, vitest_1.expect)(res.body.code).toBe('not_found');
    });
});
// =====================================================================
// PATCH /users/{id} — نقش، فعالیت، قفل حساب
// =====================================================================
(0, vitest_1.describe)('PATCH /users/{id}', () => {
    (0, vitest_1.it)('جایگزینی نقش‌ها → 200 با role_ids جدید', async () => {
        const res = await api()
            .patch(`/api/v1/users/${newUserId}`)
            .send({ role_ids: [adminRoleId] })
            .expect(200);
        (0, vitest_1.expect)(res.body.role_ids).toEqual([adminRoleId]);
    });
    (0, vitest_1.it)('تغییر نام کاربری معتبر → 200 و ورود با نام تازه', async () => {
        const res = await api()
            .patch(`/api/v1/users/${newUserId}`)
            .send({ username: 'newuser2' })
            .expect(200);
        (0, vitest_1.expect)(res.body.username).toBe('newuser2');
        await login('newuser2', NEW_PASSWORD);
    });
    (0, vitest_1.it)('نام کاربری متعلق به کاربر دیگر → 409 username_taken', async () => {
        const res = await api()
            .patch(`/api/v1/users/${newUserId}`)
            .send({ username: VIEWER_USER })
            .expect(409);
        (0, vitest_1.expect)(res.body.code).toBe('username_taken');
    });
    (0, vitest_1.it)('is_active=false → غیرفعالی فوری: ورود 401 و نشست باز هم باطل', async () => {
        const token = await login('newuser2', NEW_PASSWORD);
        await api()
            .patch(`/api/v1/users/${newUserId}`)
            .send({ is_active: false })
            .expect(200);
        // ورود مجدد رد می‌شود
        const res = await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/v1/auth/login')
            .send({ username: 'newuser2', password: NEW_PASSWORD })
            .expect(401);
        (0, vitest_1.expect)(res.body.code).toBe('account_disabled');
        // نشستِ قبلی (هنوز در اعتبارش) هم بلااثر شده است
        await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/v1/auth/me')
            .set('Authorization', `Bearer ${token}`)
            .expect(401);
        // برگرداندن برای ادامه تست‌ها
        await api().patch(`/api/v1/users/${newUserId}`).send({ is_active: true }).expect(200);
        await login('newuser2', NEW_PASSWORD);
    });
    (0, vitest_1.it)('قفل دستی is_locked=true → ورود با 423 رد می‌شود؛ با false باز می‌شود', async () => {
        await api().patch(`/api/v1/users/${newUserId}`).send({ is_locked: true }).expect(200);
        const lockedRes = await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/v1/auth/login')
            .send({ username: 'newuser2', password: NEW_PASSWORD })
            .expect(423);
        (0, vitest_1.expect)(lockedRes.body.code).toBe('account_locked');
        await api().patch(`/api/v1/users/${newUserId}`).send({ is_locked: false }).expect(200);
        await login('newuser2', NEW_PASSWORD);
    });
    (0, vitest_1.it)('شناسه ناموجود → 404', async () => {
        await api()
            .patch(`/api/v1/users/${randomUuid()}`)
            .send({ is_active: true })
            .expect(404);
    });
});
// =====================================================================
// DELETE /users/{id} — غیرفعال‌سازی (حذف فیزیکی ممنوع)
// =====================================================================
(0, vitest_1.describe)('DELETE /users/{id}', () => {
    (0, vitest_1.it)('غیرفعال‌سازی خود → 409 self_deactivate', async () => {
        const res = await api().delete(`/api/v1/users/${adminId}`).expect(409);
        (0, vitest_1.expect)(res.body.code).toBe('self_deactivate');
        (0, vitest_1.expect)(res.body.message_fa).toBeTruthy();
    });
    (0, vitest_1.it)('حذف ناموجود → 404', async () => {
        const res = await api().delete(`/api/v1/users/${randomUuid()}`).expect(404);
        (0, vitest_1.expect)(res.body.code).toBe('not_found');
    });
    (0, vitest_1.it)('غیرفعال‌سازی → 204؛ ردیف برای ممیزی می‌ماند ولی ورود و نشست بلااثرند', async () => {
        await api().delete(`/api/v1/users/${newUserId}`).expect(204);
        // حذف فیزیکی نشده: هنوز دیده می‌شود، فقط is_active=false
        const after = await api().get(`/api/v1/users/${newUserId}`).expect(200);
        (0, vitest_1.expect)(after.body.username).toBe('newuser2');
        (0, vitest_1.expect)(after.body.is_active).toBe(false);
        const list = await api()
            .get('/api/v1/users')
            .query({ is_active: 'false' })
            .expect(200);
        (0, vitest_1.expect)(list.body.items.map((u) => u.id)).toContain(newUserId);
        const loginRes = await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/v1/auth/login')
            .send({ username: 'newuser2', password: NEW_PASSWORD })
            .expect(401);
        (0, vitest_1.expect)(loginRes.body.code).toBe('account_disabled');
    });
});
// =====================================================================
// GET /roles — لیست با مجوزها
// =====================================================================
(0, vitest_1.describe)('GET /roles — لیست', () => {
    (0, vitest_1.it)('نقش‌های شرکت با permission_codes و is_system درست برمی‌گردند', async () => {
        const res = await api().get('/api/v1/roles').expect(200);
        const byCode = Object.fromEntries(res.body.items.map((r) => [r.code, r]));
        (0, vitest_1.expect)(Object.keys(byCode).sort()).toEqual(['admin_full', 'sys_frozen', 'viewer']);
        (0, vitest_1.expect)(byCode.admin_full.permission_codes).toContain('admin.user.manage');
        (0, vitest_1.expect)(byCode.admin_full.permission_codes).toContain('admin.role.manage');
        (0, vitest_1.expect)(byCode.admin_full.is_system).toBe(false);
        (0, vitest_1.expect)(byCode.viewer.permission_codes).toEqual(['master.product.view']);
        (0, vitest_1.expect)(byCode.sys_frozen.is_system).toBe(true);
        (0, vitest_1.expect)(res.body.has_more).toBe(false);
    });
    (0, vitest_1.it)('کاربر شرکت دیگر نقش‌های این شرکت را نمی‌بیند', async () => {
        // نشست ادمین این شرکت است؛ نقش other_role نباید در لیست باشد
        const res = await api().get('/api/v1/roles').expect(200);
        (0, vitest_1.expect)(res.body.items.some((r) => r.code === 'other_role')).toBe(false);
    });
});
// =====================================================================
// POST /roles — ساخت با نگاشت مجوز
// =====================================================================
(0, vitest_1.describe)('POST /roles — اعتبارسنجی و ساخت', () => {
    (0, vitest_1.it)('بدون name → 400 validation_failed با فیلد فارسی', async () => {
        const res = await api().post('/api/v1/roles').send({ code: 'norole' }).expect(400);
        (0, vitest_1.expect)(res.body.code).toBe('validation_failed');
        (0, vitest_1.expect)(res.body.details.fields).toHaveProperty('name');
        (0, vitest_1.expect)(res.body.details.fields.name[0]).toMatch(/[\u0600-\u06FF]/);
    });
    (0, vitest_1.it)('الگوی مجوز ناموجود → 400 invalid_permission با فهرست missing', async () => {
        const res = await api()
            .post('/api/v1/roles')
            .send({ code: 'badperm', name: 'نقش نامعتبر', permission_codes: ['nope.perm'] })
            .expect(400);
        (0, vitest_1.expect)(res.body.code).toBe('invalid_permission');
        (0, vitest_1.expect)(res.body.details.missing).toEqual(['nope.perm']);
    });
    (0, vitest_1.it)('ساخت موفق → 201 با permission_codes دقیق و is_system=false', async () => {
        const res = await api()
            .post('/api/v1/roles')
            .send({
            code: 'reporter',
            name: 'کارشناس گزارش',
            permission_codes: ['admin.audit.view'],
        })
            .expect(201);
        (0, vitest_1.expect)(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
        (0, vitest_1.expect)(res.body.code).toBe('reporter');
        (0, vitest_1.expect)(res.body.permission_codes).toEqual(['admin.audit.view']);
        (0, vitest_1.expect)(res.body.is_system).toBe(false);
        reporterRoleId = res.body.id;
    });
    (0, vitest_1.it)('کد تکراری → 409 duplicate_code', async () => {
        const res = await api()
            .post('/api/v1/roles')
            .send({ code: 'reporter', name: 'تکراری' })
            .expect(409);
        (0, vitest_1.expect)(res.body.code).toBe('duplicate_code');
    });
    (0, vitest_1.it)('اثر RBAC: نسبت نقش تازه به کاربر → /auth/me مجوز جدید را می‌بیند', async () => {
        await api()
            .patch(`/api/v1/users/${viewer1Id}`)
            .send({ role_ids: [viewerRoleId, reporterRoleId] })
            .expect(200);
        const me = await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/v1/auth/me')
            .set('Authorization', `Bearer ${viewerToken}`)
            .expect(200);
        (0, vitest_1.expect)(me.body.permissions).toContain('admin.audit.view');
        (0, vitest_1.expect)(me.body.permissions).toContain('master.product.view');
        (0, vitest_1.expect)(me.body.roles.sort()).toEqual(['reporter', 'viewer']);
    });
});
// =====================================================================
// PATCH /roles/{id}
// =====================================================================
(0, vitest_1.describe)('PATCH /roles/{id}', () => {
    (0, vitest_1.it)('ویرایش نام و جایگزینی permission_codes → 200', async () => {
        const res = await api()
            .patch(`/api/v1/roles/${reporterRoleId}`)
            .send({
            name: 'کارشناس گزارش (بازبینی‌شده)',
            permission_codes: ['admin.audit.view', 'master.product.view'],
        })
            .expect(200);
        (0, vitest_1.expect)(res.body.name).toContain('بازبینی');
        (0, vitest_1.expect)(res.body.permission_codes).toEqual(['admin.audit.view', 'master.product.view']);
    });
    (0, vitest_1.it)('permission ناموجود در PATCH → 400 invalid_permission', async () => {
        const res = await api()
            .patch(`/api/v1/roles/${reporterRoleId}`)
            .send({ permission_codes: ['nope.perm'] })
            .expect(400);
        (0, vitest_1.expect)(res.body.code).toBe('invalid_permission');
    });
    (0, vitest_1.it)('تغییر کد نقش سیستمی → 409 system_role', async () => {
        const res = await api()
            .patch(`/api/v1/roles/${sysRoleId}`)
            .send({ code: 'sys_changed' })
            .expect(409);
        (0, vitest_1.expect)(res.body.code).toBe('system_role');
    });
    (0, vitest_1.it)('ویرایش نام نقش سیستمی مجاز است (فقط کد ثابت می‌ماند)', async () => {
        const res = await api()
            .patch(`/api/v1/roles/${sysRoleId}`)
            .send({ name: 'نقش سیستمی (ویرایش‌نام)' })
            .expect(200);
        (0, vitest_1.expect)(res.body.code).toBe('sys_frozen');
        (0, vitest_1.expect)(res.body.name).toContain('ویرایش‌نام');
    });
    (0, vitest_1.it)('شناسه ناموجود → 404', async () => {
        await api()
            .patch(`/api/v1/roles/${randomUuid()}`)
            .send({ name: 'ناموجود' })
            .expect(404);
    });
});
// =====================================================================
// DELETE /roles/{id}
// =====================================================================
(0, vitest_1.describe)('DELETE /roles/{id}', () => {
    (0, vitest_1.it)('نقش دارای کاربر → 409 role_in_use', async () => {
        const res = await api().delete(`/api/v1/roles/${adminRoleId}`).expect(409);
        (0, vitest_1.expect)(res.body.code).toBe('role_in_use');
        (0, vitest_1.expect)(res.body.message_fa).toContain('کاربر');
    });
    (0, vitest_1.it)('نقش سیستمی → 409 system_role', async () => {
        const res = await api().delete(`/api/v1/roles/${sysRoleId}`).expect(409);
        (0, vitest_1.expect)(res.body.code).toBe('system_role');
    });
    (0, vitest_1.it)('نقش بدون کاربر → 204 و سپس 404', async () => {
        const created = await api()
            .post('/api/v1/roles')
            .send({ code: 'temp_role', name: 'نقش موقت' })
            .expect(201);
        await api().delete(`/api/v1/roles/${created.body.id}`).expect(204);
        const gone = await api().get(`/api/v1/roles/${created.body.id}`).expect(404);
        (0, vitest_1.expect)(gone.body.code).toBe('not_found');
    });
    (0, vitest_1.it)('شناسه ناموجود → 404', async () => {
        await api().delete(`/api/v1/roles/${randomUuid()}`).expect(404);
    });
});
//# sourceMappingURL=users-roles.api.test.js.map