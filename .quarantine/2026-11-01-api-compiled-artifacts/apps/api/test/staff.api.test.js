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
 * تست API پرسنل — /staff با همان گاردهای ماژول (AuthGuard + PermissionsGuard
 * روی master.staff.view/create/update — مجوزها از مهاجرت 0026 می‌آیند):
 * ۱) ساخت دیتابیس موقت «greendms_staff_test» از صفر + همه مهاجرت‌ها
 * ۲) seed حداقلی: دو شرکت (اثبات جداسازی)، سمت‌ها، حوزه‌ها، ادمینِ دارای مجوز و بیننده
 * ۳) بالا آوردن واقعی AppModule با همان ValidationPipe سراسری
 * ۴) اسناد HTTP با supertest و حذف دیتابیس در پایان (حتی در حالت شکست)
 */
const ROOT = node_path_1.default.resolve(node_path_1.default.dirname((0, node_url_1.fileURLToPath)(import.meta.url)), '..', '..', '..');
(0, dotenv_1.config)({ path: node_path_1.default.join(ROOT, '.env'), quiet: true });
const TEST_DB = 'greendms_staff_test';
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
const ADMIN_USER = 'staff_admin';
const ADMIN_PASSWORD = 'S3cret!pass';
const VIEWER_USER = 'staff_viewer';
const VIEWER_PASSWORD = 'View!pass1';
let adminToken = '';
let viewerToken = '';
let companyId = '';
let areaId = '';
let supervisorId = '';
let fieldStaffId = '';
let otherCompanyStaffId = '';
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
    const company = await pool.query(`insert into company (code, legal_name) values ('STAFFCO', 'شرکت تست پرسنل') returning id`);
    companyId = company.rows[0].id;
    const branch = await pool.query(`insert into branch (company_id, code, name) values ($1, 'MAIN', 'شعبه مرکزی') returning id`, [companyId]);
    const branchId = branch.rows[0].id;
    // سمت‌ها (0022 فقط برای شرکت خودش سمت می‌سازد؛ اینجا برای شرکت تست ساخته می‌شود)
    await pool.query(`insert into job_position (company_id, code, title, department) values
       ($1, 'salesperson_cold', 'ویزیتور سرد', 'فروش'),
       ($1, 'supervisor', 'سرپرست فروشندگان', 'فروش'),
       ($1, 'courier', 'موزع / راننده', 'توزیع')`, [companyId]);
    const area = await pool.query(`insert into sales_area (branch_id, code, name) values ($1, 'AREA-1', 'حوزه شمال') returning id`, [branchId]);
    areaId = area.rows[0].id;
    // شرکت دیبر برای اثبات جداسازی چندشرکتی
    const other = await pool.query(`insert into company (code, legal_name) values ('OTHERSTAFF', 'شرکت دیگر') returning id`);
    const otherBranch = await pool.query(`insert into branch (company_id, code, name) values ($1, 'B2', 'شعبه دوم') returning id`, [other.rows[0].id]);
    // ادمین با همه مجوزها (permission از seed مهاجرت‌ها می‌آید، شامل master.staff.* از 0026)
    const adminPerson = await pool.query(`insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'ADM-1', 'natural', 'مدیر', 'سیستم') returning id`, [companyId]);
    await pool.query(`insert into app_user (person_id, username, password_hash, access_level)
     values ($1, $2, $3, 'web')`, [adminPerson.rows[0].id, ADMIN_USER, adminHash]);
    const adminRole = await pool.query(`insert into role (company_id, code, name) values ($1, 'admin_full', 'مدیر کامل') returning id`, [companyId]);
    await pool.query(`insert into role_permission (role_id, permission_code)
     select $1, code from permission`, [adminRole.rows[0].id]);
    await pool.query(`insert into user_role (app_user_id, role_id)
     select u.id, $1 from app_user u where u.username = $2`, [adminRole.rows[0].id, ADMIN_USER]);
    // کاربر فاقد مجوزهای پرسنل (برای آزمون 403)
    const viewerRole = await pool.query(`insert into role (company_id, code, name) values ($1, 'viewer', 'بیننده') returning id`, [companyId]);
    await pool.query(`insert into role_permission (role_id, permission_code)
     select $1, code from permission where code = 'master.product.view'`, [viewerRole.rows[0].id]);
    const viewerPerson = await pool.query(`insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'VW-1', 'natural', 'بیننده', 'آزمایشی') returning id`, [companyId]);
    await pool.query(`insert into app_user (person_id, username, password_hash, access_level)
     values ($1, $2, $3, 'web')`, [viewerPerson.rows[0].id, VIEWER_USER, viewerHash]);
    await pool.query(`insert into user_role (app_user_id, role_id)
     select u.id, $1 from app_user u where u.username = $2`, [viewerRole.rows[0].id, VIEWER_USER]);
    // شخص‌هایی که پرسنل می‌شوند
    for (const [code, first, last] of [
        ['SUP-1', 'مریم', 'رضایی'],
        ['EMP-1', 'رضا', 'کریمی'],
        ['EMP-2', 'سعید', 'موسوی'],
    ]) {
        await pool.query(`insert into person (company_id, code, legal_type, first_name, last_name)
       values ($1, $2, 'natural', $3, $4)`, [companyId, code, first, last]);
    }
    // ۴) اپ واقعی با همان پایپ سراسری
    process.env.DATABASE_URL = testUrl.toString();
    const moduleRef = await testing_1.Test.createTestingModule({ imports: [app_module_1.AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });
    app.useGlobalPipes(new common_1.ValidationPipe(validation_1.validationPipeOptions));
    await app.init();
    adminToken = await login(ADMIN_USER, ADMIN_PASSWORD);
    viewerToken = await login(VIEWER_USER, VIEWER_PASSWORD);
    // پرسنل پایه برای فیلترها/صفحه‌بندی: سرپرست + یک میدانی (مستقیم از دیتابیس)
    const sup = await pool.query(`insert into staff (person_id, branch_id, job_position_id, employee_no)
     select p.id, $2, (select id from job_position where company_id = $1 and code = 'supervisor'), '1001'
       from person p where p.company_id = $1 and p.code = 'SUP-1'
     returning id`, [companyId, branchId]);
    supervisorId = sup.rows[0].id;
    const field = await pool.query(`insert into staff (person_id, branch_id, job_position_id, employee_no, is_field, supervisor_id)
     select p.id, $2, (select id from job_position where company_id = $1 and code = 'salesperson_cold'),
            '1002', true, $3
       from person p where p.company_id = $1 and p.code = 'EMP-1'
     returning id`, [companyId, branchId, supervisorId]);
    fieldStaffId = field.rows[0].id;
    // پرسنل شرکت دیگر — باید از نشست این شرکت کاملاً نامرئی باشد
    await pool.query(`insert into person (company_id, code, legal_type, first_name, last_name)
     values ((select id from company where code = 'OTHERSTAFF'), 'F-1', 'natural', 'خارجی', 'نامرئی')`);
    await pool.query(`insert into job_position (company_id, code, title)
     values ((select id from company where code = 'OTHERSTAFF'), 'courier', 'موزع')`);
    const otherStaff = await pool.query(`insert into staff (person_id, branch_id, job_position_id)
     select p.id, $1, jp.id
       from person p
       cross join job_position jp
       join company c on c.id = jp.company_id and c.code = 'OTHERSTAFF'
      where p.code = 'F-1'
     returning id`, [otherBranch.rows[0].id]);
    otherCompanyStaffId = otherStaff.rows[0].id;
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
});
(0, vitest_1.describe)('GET /staff — فهرست و فیلترها', () => {
    (0, vitest_1.it)('بدون توکن 401', async () => {
        await api(null).get('/api/v1/staff').expect(401);
    });
    (0, vitest_1.it)('بدون مجوز 403 با کد فارسی و نام مجوز', async () => {
        const res = await api(viewerToken).get('/api/v1/staff').expect(403);
        (0, vitest_1.expect)(res.body.code).toBe('forbidden');
        (0, vitest_1.expect)(res.body.message_fa).toContain('master.staff.view');
    });
    (0, vitest_1.it)('لیست 200 ← Page با next_cursor/has_more و فقط پرسنل شرکت نشست', async () => {
        const res = await api().get('/api/v1/staff').expect(200);
        (0, vitest_1.expect)(res.body).toHaveProperty('next_cursor');
        (0, vitest_1.expect)(res.body).toHaveProperty('has_more');
        const ids = res.body.items.map((s) => s.id);
        (0, vitest_1.expect)(ids).toContain(supervisorId);
        (0, vitest_1.expect)(ids).toContain(fieldStaffId);
        (0, vitest_1.expect)(ids).not.toContain(otherCompanyStaffId);
        // شکل پاسخ دقیقاً اسکیمای Staff است
        (0, vitest_1.expect)(res.body.items[0]).toHaveProperty('job_position_code');
        (0, vitest_1.expect)(res.body.items[0]).toHaveProperty('area_ids');
        (0, vitest_1.expect)(res.body.items[0]).not.toHaveProperty('row_version');
        (0, vitest_1.expect)(res.body.items[0]).not.toHaveProperty('person_code');
    });
    (0, vitest_1.it)('فیلتر job_position_code و is_field و supervisor_id', async () => {
        const byPosition = await api()
            .get('/api/v1/staff')
            .query({ job_position_code: 'salesperson_cold' })
            .expect(200);
        (0, vitest_1.expect)(byPosition.body.items.every((s) => s.job_position_code === 'salesperson_cold')).toBe(true);
        (0, vitest_1.expect)(byPosition.body.items).toHaveLength(1);
        const fieldOnly = await api().get('/api/v1/staff').query({ is_field: 'true' }).expect(200);
        (0, vitest_1.expect)(fieldOnly.body.items.every((s) => s.is_field === true)).toBe(true);
        const bySupervisor = await api()
            .get('/api/v1/staff')
            .query({ supervisor_id: supervisorId })
            .expect(200);
        (0, vitest_1.expect)(bySupervisor.body.items.map((s) => s.id)).toContain(fieldStaffId);
    });
    (0, vitest_1.it)('صفحه‌بندی cursor: limit=1 ← has_more و صفحه بعد', async () => {
        const first = await api().get('/api/v1/staff').query({ limit: 1 }).expect(200);
        (0, vitest_1.expect)(first.body.items).toHaveLength(1);
        (0, vitest_1.expect)(first.body.has_more).toBe(true);
        const second = await api()
            .get('/api/v1/staff')
            .query({ limit: 1, cursor: first.body.next_cursor })
            .expect(200);
        (0, vitest_1.expect)(second.body.items).toHaveLength(1);
        (0, vitest_1.expect)(second.body.items[0].id).not.toBe(first.body.items[0].id);
    });
    (0, vitest_1.it)('is_field نامعتبر ← 400 با پیام فارسی فیلد', async () => {
        const res = await api().get('/api/v1/staff').query({ is_field: 'شاید' }).expect(400);
        (0, vitest_1.expect)(res.body.code).toBe('validation_failed');
        (0, vitest_1.expect)(res.body.details.fields.is_field[0]).toMatch(/[؀-ۿ]/);
    });
});
(0, vitest_1.describe)('POST /staff — ساخت پرسنل', () => {
    (0, vitest_1.it)('ساخت 201 با سمت، حوزه و سرپرست', async () => {
        const person = await pool.query(`insert into person (company_id, code, legal_type, first_name, last_name)
       values ($1, 'EMP-3', 'natural', 'نگار', 'احمدی') returning id`, [companyId]);
        const res = await api()
            .post('/api/v1/staff')
            .send({
            person_id: person.rows[0].id,
            job_position_code: 'courier',
            employee_no: '1003',
            hire_date: '2024-05-01',
            supervisor_id: supervisorId,
            is_field: true,
            area_ids: [areaId],
        })
            .expect(201);
        (0, vitest_1.expect)(res.body.job_position_code).toBe('courier');
        (0, vitest_1.expect)(res.body.status).toBe('active');
        (0, vitest_1.expect)(res.body.hire_date).toBe('2024-05-01');
        (0, vitest_1.expect)(res.body.area_ids).toEqual([areaId]);
        (0, vitest_1.expect)(res.body.branch_id).toBeTruthy(); // شعبه پیش‌فرض شرکت
        (0, vitest_1.expect)(res.body).not.toHaveProperty('row_version');
    });
    (0, vitest_1.it)('بدون توکن 401 و بدون مجوز 403', async () => {
        await api(null).post('/api/v1/staff').send({ person_id: 'x' }).expect(401);
        await api(viewerToken).post('/api/v1/staff').send({ person_id: 'x' }).expect(403);
    });
    (0, vitest_1.it)('بدون person_id ← 400 فیلد الزامی فارسی', async () => {
        const res = await api().post('/api/v1/staff').send({ job_position_code: 'courier' }).expect(400);
        (0, vitest_1.expect)(res.body.code).toBe('validation_failed');
        (0, vitest_1.expect)(res.body.details.fields.person_id[0]).toContain('الزامی');
    });
    (0, vitest_1.it)('بدون سمت ← 400 job_position_required با پیام فارسی', async () => {
        const person = await pool.query(`insert into person (company_id, code, legal_type, first_name, last_name)
       values ($1, 'EMP-4', 'natural', 'بدون', 'سمت') returning id`, [companyId]);
        const res = await api()
            .post('/api/v1/staff')
            .send({ person_id: person.rows[0].id })
            .expect(400);
        (0, vitest_1.expect)(res.body.code).toBe('job_position_required');
        (0, vitest_1.expect)(res.body.message_fa).toMatch(/[؀-ۿ]/);
    });
    (0, vitest_1.it)('سمت ناشناخته ← 400 job_position_not_found', async () => {
        const person = await pool.query(`insert into person (company_id, code, legal_type, first_name, last_name)
       values ($1, 'EMP-5', 'natural', 'سمت', 'ناموجود') returning id`, [companyId]);
        const res = await api()
            .post('/api/v1/staff')
            .send({ person_id: person.rows[0].id, job_position_code: 'astronaut' })
            .expect(400);
        (0, vitest_1.expect)(res.body.code).toBe('job_position_not_found');
    });
    (0, vitest_1.it)('شخص شرکت دیگر ← 400 person_not_found (درز چندشرکتی بسته است)', async () => {
        const foreign = await pool.query(`select id from person where code = 'F-1'`);
        const res = await api()
            .post('/api/v1/staff')
            .send({ person_id: foreign.rows[0].id, job_position_code: 'courier' })
            .expect(400);
        (0, vitest_1.expect)(res.body.code).toBe('person_not_found');
    });
    (0, vitest_1.it)('شخصِ قبلاً پرسنل‌شده ← 409 duplicate_person', async () => {
        const sup = await pool.query(`select id from person where company_id = $1 and code = 'SUP-1'`, [companyId]);
        const res = await api()
            .post('/api/v1/staff')
            .send({ person_id: sup.rows[0].id, job_position_code: 'courier' })
            .expect(409);
        (0, vitest_1.expect)(res.body.code).toBe('duplicate_person');
        (0, vitest_1.expect)(res.body.message_fa).toMatch(/[؀-ۿ]/);
    });
    (0, vitest_1.it)('حوزه شرکت دیگر ← 400 area_not_found', async () => {
        const person = await pool.query(`insert into person (company_id, code, legal_type, first_name, last_name)
       values ($1, 'EMP-6', 'natural', 'حوزه', 'نامعتبر') returning id`, [companyId]);
        const otherArea = await pool.query(`insert into sales_area (branch_id, code, name)
       select b.id, 'X-AREA', 'حوزه دیگر' from branch b join company c on c.id = b.company_id
        where c.code = 'OTHERSTAFF' returning id`);
        const res = await api()
            .post('/api/v1/staff')
            .send({
            person_id: person.rows[0].id,
            job_position_code: 'courier',
            area_ids: [otherArea.rows[0].id],
        })
            .expect(400);
        (0, vitest_1.expect)(res.body.code).toBe('area_not_found');
    });
});
(0, vitest_1.describe)('GET/PATCH /staff/{id} — جزئیات و ویرایش', () => {
    (0, vitest_1.it)('جزئیات 200 و شناسه نامعتبر 400', async () => {
        const res = await api().get(`/api/v1/staff/${fieldStaffId}`).expect(200);
        (0, vitest_1.expect)(res.body.id).toBe(fieldStaffId);
        (0, vitest_1.expect)(res.body.job_position_code).toBe('salesperson_cold');
        (0, vitest_1.expect)(res.body.supervisor_id).toBe(supervisorId);
        await api().get('/api/v1/staff/not-a-uuid').expect(400);
    });
    (0, vitest_1.it)('شناسه ناموجود 404 (از جمله پرسنل شرکت دیگر)', async () => {
        await api().get('/api/v1/staff/00000000-0000-4000-8000-000000000000').expect(404);
        const res = await api().get(`/api/v1/staff/${otherCompanyStaffId}`).expect(404);
        (0, vitest_1.expect)(res.body.code).toBe('not_found');
    });
    (0, vitest_1.it)('PATCH وضعیت به inactive ← نگاشت روی قرارداد و بازتاب در GET', async () => {
        const res = await api()
            .patch(`/api/v1/staff/${fieldStaffId}`)
            .send({ status: 'inactive' })
            .expect(200);
        (0, vitest_1.expect)(res.body.status).toBe('inactive');
        const read = await api().get(`/api/v1/staff/${fieldStaffId}`).expect(200);
        (0, vitest_1.expect)(read.body.status).toBe('inactive');
        // برگرداندن به حالت فعال برای بقیه تست‌ها
        await api().patch(`/api/v1/staff/${fieldStaffId}`).send({ status: 'active' }).expect(200);
    });
    (0, vitest_1.it)('PATCH حوزه‌ها جایگزین می‌شود و سرپرست قابل تغییر است', async () => {
        const area2 = await pool.query(`insert into sales_area (branch_id, code, name) values ($1, 'AREA-2', 'حوزه جنوب') returning id`, [
            (await pool.query(`select id from branch where company_id = $1`, [companyId])).rows[0].id,
        ]);
        const res = await api()
            .patch(`/api/v1/staff/${fieldStaffId}`)
            .send({ area_ids: [area2.rows[0].id], employee_no: '2002' })
            .expect(200);
        (0, vitest_1.expect)(res.body.area_ids).toEqual([area2.rows[0].id]);
        (0, vitest_1.expect)(res.body.employee_no).toBe('2002');
    });
    (0, vitest_1.it)('سرپرستِ خودِ پرسنل ← 400 supervisor_self', async () => {
        const res = await api()
            .patch(`/api/v1/staff/${fieldStaffId}`)
            .send({ supervisor_id: fieldStaffId })
            .expect(400);
        (0, vitest_1.expect)(res.body.code).toBe('supervisor_self');
        (0, vitest_1.expect)(res.body.message_fa).toMatch(/[؀-ۿ]/);
    });
    (0, vitest_1.it)('بدون مجوز 403 و شناسه نامعتبر 400', async () => {
        await api(viewerToken)
            .patch(`/api/v1/staff/${fieldStaffId}`)
            .send({ is_field: false })
            .expect(403);
        await api().patch('/api/v1/staff/nope').send({ is_field: false }).expect(400);
    });
});
//# sourceMappingURL=staff.api.test.js.map