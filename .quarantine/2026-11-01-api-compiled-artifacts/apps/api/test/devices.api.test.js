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
const tokens_1 = require("../src/modules/identity-rbac/tokens");
/**
 * تست API دستگاه‌های مجاز — /devices و device_bind در /auth/otp/verify:
 * ۱) دیتابیس موقت «greendms_devices_test» از صفر + همه مهاجرت‌ها (0012 device و 0025 دلیل ابطال)
 * ۲) ثبت/فهرست/ابطال دستگاه با جداسازی کامل بین دو کاربر
 * ۳) باندینگ فقط با کد پیامکی purpose=device_bind و مالکیت/ابطال دستگاه
 * ۴) ابطال دستگاه نشست‌های باز آن را می‌بندد (refresh → 401)
 * ۵) صفحه‌بندی cursor و پوشش اسکیمای Device در پاسخ‌ها
 * ۶) تزریق بین دو کاربر واقعی: کدِ یکی دستگاه دیگری را نمی‌بندد و کد نمی‌سوزد؛
 *    کد قربانی با نام کاربر مهاجم پذیرفته نمی‌شود؛ ابطال دستگاه، نشستِ متصل
 *    به همان دستگاه را در همان لحظه می‌بندد (نه فقط با refresh بعدی)
 */
const ROOT = node_path_1.default.resolve(node_path_1.default.dirname((0, node_url_1.fileURLToPath)(import.meta.url)), '..', '..', '..');
(0, dotenv_1.config)({ path: node_path_1.default.join(ROOT, '.env'), quiet: true });
const TEST_DB = 'greendms_devices_test';
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
const PASSWORD = 'Device!pass12';
const OWNER = 'dev_owner';
const OTHER = 'dev_other';
let adminPool;
let pool;
let app;
/** درگاه پیامک آزمایشی: کدها را نگه می‌دارد (بدون ارسال واقعی) */
const sent = [];
const fakeSms = {
    send: async (message) => {
        sent.push(message);
    },
};
const post = (url) => (0, supertest_1.default)(app.getHttpServer()).post(url);
const login = async (username) => {
    const res = await post('/api/v1/auth/login').send({ username, password: PASSWORD }).expect(200);
    return { access: res.body.access_token, refresh: res.body.refresh_token };
};
/** درخواست کد تازه: ردیف‌های قبلی کاربر پاک می‌شوند تا نرخ‌گیری بین تست‌ها مزاحم نشود */
const requestCode = async (username, purpose, extra = {}) => {
    await pool.query('delete from auth_otp where username = $1', [username]);
    const before = sent.length;
    await post('/api/v1/auth/otp/request').send({ username, purpose, ...extra }).expect(202);
    const message = sent.slice(before).find((m) => m.username === username);
    const match = message && /(\d{4,8})/.exec(message.body);
    (0, vitest_1.expect)(match, `پیامکی برای «${username}» در درگاه ثبت نشد`).toBeTruthy();
    return match[1];
};
const verifyOtp = (username, code, extra = {}) => post('/api/v1/auth/otp/verify').send({ username, code, ...extra });
/**
 * هدر Bearer کاربر. توکن را **پیش از** ساخت زنجیره درخواست بگیرید: اگر await داخل
 * زنجیره supertest باشد، سرور آزمایشی پیش از dispatch بسته می‌شود و درخواست
 * با «address of null» می‌شکند (race در serverStates سوپرتست).
 */
const bearerOf = async (username) => `Bearer ${(await login(username)).access}`;
(0, vitest_1.beforeAll)(async () => {
    // ۱) دیتابیس موقت تمیز + همه مهاجرت‌ها در یک تراکنش
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
    // ۲) seed: شرکت + دو کاربر (هر دو شماره موبایل دارند تا device_bind بشود)
    pool = new pg_1.default.Pool({ connectionString: testUrl.toString(), max: 1 });
    const company = await pool.query(`insert into company (code, legal_name) values ('DEVCOS', 'شرکت تست دستگاه') returning id`);
    const companyId = company.rows[0].id;
    const makeUser = async (code, username, phone) => {
        const person = await pool.query(`insert into person (company_id, code, first_name, last_name)
       values ($1, $2, 'کاربر', $2) returning id`, [companyId, code]);
        await pool.query(`insert into person_phone (person_id, phone, kind, is_primary) values ($1, $2, 'mobile', true)`, [person.rows[0].id, phone]);
        await pool.query(`insert into app_user (person_id, username, password_hash, access_level)
       values ($1, $2, $3, 'web')`, [person.rows[0].id, username, await (0, password_1.hashPassword)(PASSWORD)]);
        await pool.query(`insert into user_role (app_user_id, role_id)
       select u.id, $1 from app_user u where u.username = $2`, [roleId, username]);
    };
    // نقش واحد با همه مجوزها برای هر دو کاربر (قید یکتایی نقش اجازه ساخت دوباره نمی‌دهد)
    const role = await pool.query(`insert into role (company_id, code, name) values ($1, 'admin_full', 'مدیر کامل') returning id`, [companyId]);
    const roleId = role.rows[0].id;
    await pool.query(`insert into role_permission (role_id, permission_code) select $1, code from permission`, [roleId]);
    await makeUser('DVP-1', OWNER, '09121110001');
    await makeUser('DVP-2', OTHER, '09121110002');
    // ۳) اپ واقعی با درگاه پیامک آزمایشی
    process.env.DATABASE_URL = testUrl.toString();
    const moduleRef = await testing_1.Test.createTestingModule({ imports: [app_module_1.AppModule] })
        .overrideProvider(tokens_1.SMS_SENDER)
        .useValue(fakeSms)
        .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });
    app.useGlobalPipes(new common_1.ValidationPipe(validation_1.validationPipeOptions));
    await app.init();
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
// A) نگهبان مسیرها: همه‌چیز احراز هویت می‌خواهد
// =====================================================================
(0, vitest_1.describe)('A — احراز هویت /devices', () => {
    (0, vitest_1.it)('بدون توکن هر سه مسیر 401 می‌دهند', async () => {
        await (0, supertest_1.default)(app.getHttpServer()).get('/api/v1/devices').expect(401);
        await post('/api/v1/devices')
            .send({ device_uuid: 'unauth-1', platform: 'android', app_kind: 'sales' })
            .expect(401);
        await (0, supertest_1.default)(app.getHttpServer())
            .delete('/api/v1/devices/00000000-0000-4000-8000-000000000000')
            .expect(401);
    });
    (0, vitest_1.it)('توکن نامعتبر هم 401 می‌دهد', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/v1/devices')
            .set('Authorization', 'Bearer not.a.valid.jwt')
            .expect(401);
    });
});
// =====================================================================
// B) ثبت، فهرست، صفحه‌بندی و جداسازی کاربران
// =====================================================================
(0, vitest_1.describe)('B — ثبت و فهرست دستگاه‌ها', () => {
    let ownerToken = '';
    let otherToken = '';
    let deviceB = '';
    (0, vitest_1.it)('پیش از ثبت، فهرست خالی است', async () => {
        ownerToken = (await login(OWNER)).access;
        otherToken = (await login(OTHER)).access;
        const res = await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/v1/devices')
            .set('Authorization', `Bearer ${ownerToken}`)
            .expect(200);
        (0, vitest_1.expect)(res.body).toMatchObject({ items: [], next_cursor: null, has_more: false });
    });
    (0, vitest_1.it)('POST /devices دستگاه را با is_trusted=false ثبت می‌کند', async () => {
        const res = await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/v1/devices')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({
            device_uuid: 'a1b2c3d4-owner-phone',
            platform: 'android',
            app_kind: 'sales',
            app_version: '1.4.0',
            os_version: '14',
        })
            .expect(201);
        (0, vitest_1.expect)(res.body).toMatchObject({
            device_uuid: 'a1b2c3d4-owner-phone',
            platform: 'android',
            app_kind: 'sales',
            app_version: '1.4.0',
            is_trusted: false,
            revoked_at: null,
        });
        (0, vitest_1.expect)(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
        (0, vitest_1.expect)(res.body.created_at).toBeTruthy();
    });
    (0, vitest_1.it)('بدنه ناقص با code=validation_failed و پیام فارسی رد می‌شود', async () => {
        const res = await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/v1/devices')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ platform: 'android' })
            .expect(400);
        (0, vitest_1.expect)(res.body.code).toBe('validation_failed');
        (0, vitest_1.expect)(res.body.message_fa).toBeTruthy();
        (0, vitest_1.expect)(res.body.message_fa).not.toBe('Bad Request');
    });
    (0, vitest_1.it)('platform خارج از enum قرارداد رد می‌شود', async () => {
        const res = await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/v1/devices')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ device_uuid: 'x-1', platform: 'ios', app_kind: 'sales' })
            .expect(400);
        (0, vitest_1.expect)(res.body.code).toBe('validation_failed');
    });
    (0, vitest_1.it)('ثبت همان device_uuid دوباره 409 device_exists می‌دهد', async () => {
        const res = await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/v1/devices')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ device_uuid: 'a1b2c3d4-owner-phone', platform: 'android', app_kind: 'sales' })
            .expect(409);
        (0, vitest_1.expect)(res.body.code).toBe('device_exists');
    });
    (0, vitest_1.it)('دستگاه کاربر دیگر برای این کاربر 409 device_taken می‌دهد', async () => {
        const res = await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/v1/devices')
            .set('Authorization', `Bearer ${otherToken}`)
            .send({ device_uuid: 'a1b2c3d4-owner-phone', platform: 'android', app_kind: 'sales' })
            .expect(409);
        (0, vitest_1.expect)(res.body.code).toBe('device_taken');
    });
    (0, vitest_1.it)('هر کاربر فقط دستگاه‌های خودش را می‌بیند', async () => {
        // دستگاه دوم مالک + دستگاه کاربر دیگر
        const a = await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/v1/devices')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ device_uuid: 'e5f6-owner-tablet', platform: 'android', app_kind: 'delivery' })
            .expect(201);
        deviceB = a.body.id;
        const c = await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/v1/devices')
            .set('Authorization', `Bearer ${otherToken}`)
            .send({ device_uuid: 'c7d8-other-phone', platform: 'android', app_kind: 'telesales' })
            .expect(201);
        const mine = await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/v1/devices')
            .set('Authorization', `Bearer ${ownerToken}`)
            .expect(200);
        const uuids = mine.body.items.map((d) => d.device_uuid);
        (0, vitest_1.expect)(uuids).toContain('a1b2c3d4-owner-phone');
        (0, vitest_1.expect)(uuids).toContain('e5f6-owner-tablet');
        (0, vitest_1.expect)(uuids).not.toContain('c7d8-other-phone');
        const theirs = await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/v1/devices')
            .set('Authorization', `Bearer ${otherToken}`)
            .expect(200);
        (0, vitest_1.expect)(theirs.body.items.map((d) => d.id)).toEqual([c.body.id]);
    });
    (0, vitest_1.it)('صفحه‌بندی cursor دستگاه‌های تکراری نشان نمی‌دهد', async () => {
        const page1 = await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/v1/devices?limit=1')
            .set('Authorization', `Bearer ${ownerToken}`)
            .expect(200);
        (0, vitest_1.expect)(page1.body.items).toHaveLength(1);
        (0, vitest_1.expect)(page1.body.has_more).toBe(true);
        (0, vitest_1.expect)(page1.body.next_cursor).toBeTruthy();
        const page2 = await (0, supertest_1.default)(app.getHttpServer())
            .get(`/api/v1/devices?limit=1&cursor=${encodeURIComponent(page1.body.next_cursor)}`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .expect(200);
        (0, vitest_1.expect)(page2.body.items).toHaveLength(1);
        (0, vitest_1.expect)(page2.body.items[0].id).not.toBe(page1.body.items[0].id);
        (0, vitest_1.expect)(page2.body.has_more).toBe(false);
        (0, vitest_1.expect)(page2.body.next_cursor).toBeNull();
    });
    (0, vitest_1.it)('DELETE شناسه خراب 400 و ناموجود 404 می‌دهد', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .delete('/api/v1/devices/نه-uuid')
            .set('Authorization', `Bearer ${ownerToken}`)
            .expect(400);
        await (0, supertest_1.default)(app.getHttpServer())
            .delete('/api/v1/devices/00000000-0000-4000-8000-000000000001')
            .set('Authorization', `Bearer ${ownerToken}`)
            .expect(404);
    });
    (0, vitest_1.it)('ابطال دستگاه مالک دیگر 404 می‌دهد (درز ندارد)', async () => {
        const res = await (0, supertest_1.default)(app.getHttpServer())
            .delete(`/api/v1/devices/${deviceB}`)
            .set('Authorization', `Bearer ${otherToken}`)
            .expect(404);
        (0, vitest_1.expect)(res.body.code).toBe('device_not_found');
        // دستگاه سر جایش است
        const still = await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/v1/devices')
            .set('Authorization', `Bearer ${ownerToken}`)
            .expect(200);
        (0, vitest_1.expect)(still.body.items.some((d) => d.id === deviceB)).toBe(true);
    });
});
// =====================================================================
// C) device_bind: باندینگ فقط با کد پیامکی و مالکیت درست
// =====================================================================
(0, vitest_1.describe)('C — باندینگ دستگاه با کد پیامکی', () => {
    let ownerDevice = '';
    let otherDevice = '';
    let boundRefresh = '';
    (0, vitest_1.it)('device_id برای purpose غیر device_bind پذیرفته نمی‌شود', async () => {
        const ownerAuth = await bearerOf(OWNER);
        const otherAuth = await bearerOf(OTHER);
        const devices = await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/v1/devices')
            .set('Authorization', ownerAuth)
            .expect(200);
        ownerDevice = devices.body.items.find((d) => d.device_uuid === 'a1b2c3d4-owner-phone').id;
        const others = await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/v1/devices')
            .set('Authorization', otherAuth)
            .expect(200);
        otherDevice = others.body.items[0].id;
        const code = await requestCode(OWNER, 'login');
        const res = await verifyOtp(OWNER, code, { device_id: ownerDevice }).expect(400);
        (0, vitest_1.expect)(res.body.code).toBe('device_bind_purpose');
    });
    (0, vitest_1.it)('device_id ناشناخته با 400 رد می‌شود و کد نمی‌سوزد', async () => {
        const code = await requestCode(OWNER, 'device_bind', { device_id: ownerDevice });
        const res = await verifyOtp(OWNER, code, {
            device_id: '00000000-0000-4000-8000-000000000099',
        }).expect(400);
        (0, vitest_1.expect)(res.body.code).toBe('device_not_registered');
        // همان کد هنوز معتبر است → با دستگاه درست بسته می‌شود
        const ok = await verifyOtp(OWNER, code, { device_id: ownerDevice }).expect(200);
        (0, vitest_1.expect)(ok.body.access_token).toBeTruthy();
        boundRefresh = ok.body.refresh_token;
    });
    (0, vitest_1.it)('باندینگ موفق is_trusted را true و نشست را قابل تازه‌سازی می‌کند', async () => {
        const ownerAuth = await bearerOf(OWNER);
        const res = await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/v1/devices')
            .set('Authorization', ownerAuth)
            .expect(200);
        const row = res.body.items.find((d) => d.id === ownerDevice);
        (0, vitest_1.expect)(row.is_trusted).toBe(true);
        const refreshed = await post('/api/v1/auth/refresh')
            .send({ refresh_token: boundRefresh })
            .expect(200);
        (0, vitest_1.expect)(refreshed.body.access_token).toBeTruthy();
    });
    (0, vitest_1.it)('device_id متعلق به کاربر دیگر با 403 رد می‌شود', async () => {
        const code = await requestCode(OWNER, 'device_bind', { device_id: ownerDevice });
        const res = await verifyOtp(OWNER, code, { device_id: otherDevice }).expect(403);
        (0, vitest_1.expect)(res.body.code).toBe('device_not_owned');
    });
    (0, vitest_1.it)('device_bind بدون device_id هم کار می‌کند (باندینگ اختیاری)', async () => {
        const code = await requestCode(OTHER, 'device_bind');
        const res = await verifyOtp(OTHER, code).expect(200);
        (0, vitest_1.expect)(res.body.access_token).toBeTruthy();
        (0, vitest_1.expect)(res.body.user.username).toBe(OTHER);
    });
});
// =====================================================================
// D) ابطال: نشست‌ها می‌بندد، ردیف می‌ماند، دوباره قابل ثبت است
// =====================================================================
(0, vitest_1.describe)('D — ابطال دستگاه از راه دور', () => {
    let ownerToken = '';
    let ownerDevice = '';
    let revokedRefresh = '';
    (0, vitest_1.it)('کد device_bind روی دستگاه باطل‌شده 403 device_revoked می‌دهد', async () => {
        // نشستی روی دستگاه می‌سازیم تا بعد از ابطال بسته‌شدن را بسنجیم
        const code = await requestCode(OWNER, 'device_bind');
        const ownerAuth = await bearerOf(OWNER);
        const devices = await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/v1/devices')
            .set('Authorization', ownerAuth)
            .expect(200);
        ownerDevice = devices.body.items.find((d) => d.device_uuid === 'a1b2c3d4-owner-phone').id;
        const session = await verifyOtp(OWNER, code, { device_id: ownerDevice }).expect(200);
        revokedRefresh = session.body.refresh_token;
        ownerToken = session.body.access_token;
        // اکنون ابطال
        await (0, supertest_1.default)(app.getHttpServer())
            .delete(`/api/v1/devices/${ownerDevice}`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .expect(204);
        const next = await requestCode(OWNER, 'device_bind', { device_id: ownerDevice });
        const res = await verifyOtp(OWNER, next, { device_id: ownerDevice }).expect(403);
        (0, vitest_1.expect)(res.body.code).toBe('device_revoked');
    });
    (0, vitest_1.it)('نشست‌های دستگاه باطل‌شده می‌بندد (refresh → 401)', async () => {
        const res = await post('/api/v1/auth/refresh')
            .send({ refresh_token: revokedRefresh })
            .expect(401);
        (0, vitest_1.expect)(res.body.code).toBe('invalid_refresh_token');
    });
    (0, vitest_1.it)('دستگاه باطل‌شده در فهرست revoked_at دارد و is_trusted آن false است', async () => {
        const ownerAuth = await bearerOf(OWNER);
        const res = await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/v1/devices')
            .set('Authorization', ownerAuth)
            .expect(200);
        const row = res.body.items.find((d) => d.id === ownerDevice);
        (0, vitest_1.expect)(row.revoked_at).toBeTruthy();
        (0, vitest_1.expect)(row.is_trusted).toBe(false);
    });
    (0, vitest_1.it)('DELETE تکراری هم 204 است (idempotent) و ابطال دوباره ثبت نمی‌شود', async () => {
        const token = (await login(OWNER)).access;
        await (0, supertest_1.default)(app.getHttpServer())
            .delete(`/api/v1/devices/${ownerDevice}`)
            .set('Authorization', `Bearer ${token}`)
            .expect(204);
        const res = await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/v1/devices')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);
        const row = res.body.items.find((d) => d.id === ownerDevice);
        // فقط یک ردیف برای همان device_uuid می‌ماند (revive همان ردیف را برمی‌گرداند)
        const same = res.body.items.filter((d) => d.device_uuid === 'a1b2c3d4-owner-phone');
        (0, vitest_1.expect)(same).toHaveLength(1);
        (0, vitest_1.expect)(row.revoked_at).toBeTruthy();
    });
    (0, vitest_1.it)('ثبت مجدد دستگاه باطل‌شده همان ردیف را دوباره فعال می‌کند', async () => {
        const ownerAuth = await bearerOf(OWNER);
        const res = await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/v1/devices')
            .set('Authorization', ownerAuth)
            .send({
            device_uuid: 'a1b2c3d4-owner-phone',
            platform: 'android',
            app_kind: 'sales',
            app_version: '1.4.1',
        })
            .expect(201);
        (0, vitest_1.expect)(res.body.id).toBe(ownerDevice);
        (0, vitest_1.expect)(res.body.revoked_at).toBeNull();
        (0, vitest_1.expect)(res.body.is_trusted).toBe(false); // باندینگ باید دوباره با کد پیامکی انجام شود
        (0, vitest_1.expect)(res.body.app_version).toBe('1.4.1');
    });
});
// =====================================================================
// E) تزریق بین دو کاربر واقعی: مالکیت دستگاه + فوریت بستن نشست
// =====================================================================
(0, vitest_1.describe)('E — تزریق دستگاه بین دو کاربر', () => {
    let attackerDevice = ''; // دستگاه کاربر اول (OWNER)
    let victimDevice = ''; // دستگاه کاربر دوم (OTHER)
    let attackerAccess = ''; // نشستی که کاربر اول روی دستگاه خودش بسته است
    let victimAccess = ''; // نشستِ متصل به دستگاه قربانی
    let victimRefresh = '';
    (0, vitest_1.it)('هر دو کاربر دستگاه خودشان را با is_trusted=false ثبت می‌کنند', async () => {
        // توکن‌ها پیش از ساخت زنجیره درخواست گرفته می‌شوند (race سوپرتست)
        const attackerAuth = await bearerOf(OWNER);
        const victimAuth = await bearerOf(OTHER);
        const mine = await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/v1/devices')
            .set('Authorization', attackerAuth)
            .send({ device_uuid: 'inject-owner-01', platform: 'android', app_kind: 'sales' })
            .expect(201);
        attackerDevice = mine.body.id;
        const theirs = await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/v1/devices')
            .set('Authorization', victimAuth)
            .send({ device_uuid: 'inject-other-01', platform: 'android', app_kind: 'delivery' })
            .expect(201);
        victimDevice = theirs.body.id;
        (0, vitest_1.expect)(mine.body.is_trusted).toBe(false);
        (0, vitest_1.expect)(theirs.body.is_trusted).toBe(false);
        (0, vitest_1.expect)(attackerDevice).not.toBe(victimDevice);
    });
    (0, vitest_1.it)('کد device_bind کاربر اول، دستگاه کاربر دوم را نمی‌بندد و کد نمی‌سوزد', async () => {
        // مهاجم کدی برای دستگاهِ خودش می‌گیرد و با آن دستگاهِ قربانی را هدف می‌گیرد
        const code = await requestCode(OWNER, 'device_bind', { device_id: attackerDevice });
        const injected = await verifyOtp(OWNER, code, { device_id: victimDevice }).expect(403);
        (0, vitest_1.expect)(injected.body.code).toBe('device_not_owned');
        // دستگاه قربانی دست‌نخورده می‌ماند: نه مورد اعتماد می‌شود، نه باطل
        const victimAuth = await bearerOf(OTHER);
        const before = await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/v1/devices')
            .set('Authorization', victimAuth)
            .expect(200);
        const row = before.body.items.find((d) => d.id === victimDevice);
        (0, vitest_1.expect)(row).toBeTruthy();
        (0, vitest_1.expect)(row.is_trusted).toBe(false);
        (0, vitest_1.expect)(row.revoked_at).toBeNull();
        // کد مصرف نشده است: همان کد با دستگاهِ خودِ مهاجم بسته می‌شود و نشست می‌گیرد
        const ok = await verifyOtp(OWNER, code, { device_id: attackerDevice }).expect(200);
        (0, vitest_1.expect)(ok.body.user.username).toBe(OWNER);
        attackerAccess = ok.body.access_token;
        const mineAfter = await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/v1/devices')
            .set('Authorization', `Bearer ${attackerAccess}`)
            .expect(200);
        (0, vitest_1.expect)(mineAfter.body.items.find((d) => d.id === attackerDevice).is_trusted).toBe(true);
    });
    (0, vitest_1.it)('کد قربانی با نام کاربر مهاجم پذیرفته نمی‌شود و کد دست‌نخورده می‌ماند', async () => {
        await pool.query('delete from auth_otp where username = $1', [OWNER]); // مهاجم کدِ در انتظار نداشته باشد
        const victimCode = await requestCode(OTHER, 'device_bind');
        // مهاجم کدِ قربانی را با نام خودش و دستگاهِ قربانی می‌فرستد → رد می‌شود
        const res = await verifyOtp(OWNER, victimCode, { device_id: victimDevice }).expect(401);
        (0, vitest_1.expect)(res.body.code).toBe('otp_invalid');
        // کد قربانی هنوز سالم است: خودِ او با دستگاهِ خودش باندینگ را کامل می‌کند
        const legit = await verifyOtp(OTHER, victimCode, { device_id: victimDevice }).expect(200);
        (0, vitest_1.expect)(legit.body.user.username).toBe(OTHER);
        victimAccess = legit.body.access_token;
        victimRefresh = legit.body.refresh_token;
    });
    (0, vitest_1.it)('نشستِ متصل به دستگاه، device_id همان دستگاه را دارد و همان لحظه کار می‌کند', async () => {
        const me = await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/v1/auth/me')
            .set('Authorization', `Bearer ${victimAccess}`)
            .expect(200);
        (0, vitest_1.expect)(me.body.user.username).toBe(OTHER);
        const devices = await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/v1/devices')
            .set('Authorization', `Bearer ${victimAccess}`)
            .expect(200);
        (0, vitest_1.expect)(devices.body.items.find((d) => d.id === victimDevice).is_trusted).toBe(true);
        // نشستِ همین دستگاه در دیتابیس با device_id ثبت شده است (پایهٔ ابطال 0025)
        const sessions = await pool.query('select id, revoked_at from auth_session where device_id = $1', [victimDevice]);
        (0, vitest_1.expect)(sessions.rows).toHaveLength(1);
        (0, vitest_1.expect)(sessions.rows[0].revoked_at).toBeNull();
    });
    (0, vitest_1.it)('ابطال دستگاه، نشستِ متصل را در همان لحظه می‌بندد (بدون نیاز به refresh)', async () => {
        // پیش از ابطال، نشست کاملاً زنده است
        await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/v1/auth/me')
            .set('Authorization', `Bearer ${victimAccess}`)
            .expect(200);
        const victimAuth = await bearerOf(OTHER);
        await (0, supertest_1.default)(app.getHttpServer())
            .delete(`/api/v1/devices/${victimDevice}`)
            .set('Authorization', victimAuth)
            .expect(204);
        // همان لحظه، با همان توکنی که ثانیه‌ای پیش کار می‌کرد:
        const me = await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/v1/auth/me')
            .set('Authorization', `Bearer ${victimAccess}`)
            .expect(401);
        (0, vitest_1.expect)(me.body.code).toBe('session_revoked');
        // هر مسیر محافظت‌شدهٔ دیگری هم همان لحظه بسته می‌شود
        await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/v1/devices')
            .set('Authorization', `Bearer ${victimAccess}`)
            .expect(401);
        // و refresh هم دیگر کار نمی‌کند
        const refreshed = await post('/api/v1/auth/refresh')
            .send({ refresh_token: victimRefresh })
            .expect(401);
        (0, vitest_1.expect)(refreshed.body.code).toBe('invalid_refresh_token');
        // دلیل ابطال در دیتابیس همان device_revoked است (مهاجرت 0025)
        const row = await pool.query(`select revoked_reason from auth_session
        where device_id = $1 and revoked_at is not null
        order by revoked_at desc limit 1`, [victimDevice]);
        (0, vitest_1.expect)(row.rows[0]?.revoked_reason).toBe('device_revoked');
        // ابطالِ دستگاهِ قربانی روی نشستِ مهاجم اثری ندارد (دستگاهش هنوز باطل نشده)
        await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/v1/auth/me')
            .set('Authorization', `Bearer ${attackerAccess}`)
            .expect(200);
    });
});
//# sourceMappingURL=devices.api.test.js.map