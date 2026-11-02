"use strict";
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersRepository = void 0;
const common_1 = require("@nestjs/common");
const COLUMNS = `
  u.id, u.username, s.id as staff_id,
  coalesce((
    select json_agg(ur.role_id order by ur.role_id)
      from user_role ur where ur.app_user_id = u.id
  ), '[]'::json) as role_ids,
  (u.is_active and p.is_active) as is_active,
  u.is_locked, u.locked_until, u.last_login_at, u.created_at`;
const FROM = `
  from app_user u
  join person p on p.id = u.person_id
  left join staff s on s.person_id = p.id`;
const encodeCursor = (username) => Buffer.from(username, 'utf8').toString('base64url');
const decodeCursor = (cursor) => Buffer.from(cursor, 'base64url').toString('utf8');
/**
 * دسترسی داده کاربران — SQL خام روی app_user/person/user_role (بدون ORM، §۳.۲).
 * شرکتِ نشست همیشه از person پیمایش می‌شود؛ app_user خودش company_id ندارد
 * و هیچ کوئری‌ای بدون آن اجرا نمی‌شود (درز چندشرکتی ندارد).
 * کاربر هرگز حذف فیزیکی نمی‌شود (ممیزی): غیرفعال‌سازی با is_active انجام می‌شود.
 */
let UsersRepository = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var UsersRepository = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            UsersRepository = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        pool;
        constructor(pool) {
            this.pool = pool;
        }
        async list(companyId, query) {
            const limit = query.limit ?? 50;
            const params = [companyId];
            const where = ['p.company_id = $1'];
            if (query.role) {
                params.push(query.role);
                where.push(`exists (
        select 1 from user_role ur
        join role r on r.id = ur.role_id
         where ur.app_user_id = u.id
           and (r.code = $${params.length} or r.id::text = $${params.length}))`);
            }
            if (query.is_active !== undefined) {
                params.push(query.is_active);
                where.push(`(u.is_active and p.is_active) = $${params.length}`);
            }
            if (query.cursor) {
                params.push(decodeCursor(query.cursor));
                where.push(`u.username > $${params.length}`);
            }
            params.push(limit + 1);
            const { rows } = await this.pool.query(`select ${COLUMNS} ${FROM}
        where ${where.join(' and ')}
        order by u.username
        limit $${params.length}`, params);
            const hasMore = rows.length > limit;
            const items = hasMore ? rows.slice(0, limit) : rows;
            const last = items[items.length - 1];
            return { items, hasMore, nextCursor: hasMore && last ? encodeCursor(last.username) : null };
        }
        async findById(companyId, id) {
            const { rows } = await this.pool.query(`select ${COLUMNS} ${FROM} where u.id = $1 and p.company_id = $2`, [id, companyId]);
            return rows[0] ?? null;
        }
        /** آیا نام کاربری قبلاً ثبت شده؟ (سریع‌تر از قید دیتابیس؛ پیام روشن 409 می‌دهد) */
        async usernameExists(username) {
            const { rows } = await this.pool.query('select 1 from app_user where username = $1', [
                username,
            ]);
            return rows.length > 0;
        }
        /** شخصِ پرسنل انتخاب‌شده در همین شرکت؛ null یعنی پرسنل برای این شرکت نیست */
        async findStaffPersonId(companyId, staffId) {
            const { rows } = await this.pool.query(`select s.person_id from staff s
         join branch b on b.id = s.branch_id
        where s.id = $1 and b.company_id = $2`, [staffId, companyId]);
            return rows[0]?.person_id ?? null;
        }
        /** کدام‌یک از نقش‌های خواسته‌شده برای همین شرکت وجود دارند (برای پیام روشن 400) */
        async findExistingRoleIds(companyId, roleIds) {
            if (roleIds.length === 0)
                return [];
            const { rows } = await this.pool.query('select id from role where company_id = $1 and id = any($2::uuid[])', [companyId, roleIds]);
            return rows.map((r) => r.id);
        }
        /**
         * ساخت کاربر در یک تراکنش: شخصِ تازه (در صورت نبودِ staff) ← app_user ← نگاشت نقش‌ها.
         * خطای نام/کد تکراری همان 23505 دیتابیس است تا سرویس آن را 409 کند.
         */
        async insert(companyId, input) {
            const client = await this.pool.connect();
            let userId;
            try {
                await client.query('begin');
                let personId = input.personId ?? null;
                if (!personId) {
                    const { rows } = await client.query(`insert into person (company_id, code, first_name, last_name)
           values ($1, $2, $3, $4) returning id`, [
                        companyId,
                        input.personCode ?? `USR-${input.username}`,
                        input.firstName ?? input.username,
                        input.lastName ?? null,
                    ]);
                    personId = rows[0].id;
                }
                const { rows: userRows } = await client.query(`insert into app_user (person_id, username, password_hash, access_level, is_active)
         values ($1, $2, $3, $4, $5) returning id`, [personId, input.username, input.passwordHash, input.accessLevel, input.isActive]);
                userId = userRows[0].id;
                for (const roleId of input.roleIds) {
                    await client.query('insert into user_role (app_user_id, role_id) values ($1, $2) on conflict do nothing', [userId, roleId]);
                }
                await client.query('commit');
            }
            catch (err) {
                await client.query('rollback');
                throw err;
            }
            finally {
                client.release();
            }
            return (await this.findById(companyId, userId));
        }
        /**
         * بروزرسانی فیلدها و (در صورت داده‌شدن) جایگزینی کامل نقش‌ها — همه در یک تراکنش.
         * is_locked=false قفل زمانی و شمارنده تلاش را هم پاک می‌کند (باز کردن توسط مدیر).
         */
        async update(companyId, id, input) {
            const sets = [];
            const params = [id, companyId];
            const add = (fragment, value) => {
                params.push(value);
                sets.push(fragment.replace('$?', `$${params.length}`));
            };
            if (input.username !== undefined)
                add('username = $?', input.username);
            if (input.passwordHash !== undefined)
                add('password_hash = $?', input.passwordHash);
            if (input.accessLevel !== undefined)
                add('access_level = $?', input.accessLevel);
            if (input.isActive !== undefined)
                add('is_active = $?', input.isActive);
            if (input.isLocked !== undefined) {
                add('is_locked = $?', input.isLocked);
                if (!input.isLocked) {
                    sets.push('locked_until = null', 'failed_attempts = 0');
                }
            }
            const client = await this.pool.connect();
            try {
                await client.query('begin');
                if (sets.length > 0) {
                    const { rows } = await client.query(`update app_user set ${sets.join(', ')}
            where id = $1
              and person_id in (select id from person where company_id = $2)
            returning id`, params);
                    if (rows.length === 0) {
                        await client.query('rollback');
                        return null;
                    }
                }
                if (input.roleIds) {
                    await client.query('delete from user_role where app_user_id = $1', [id]);
                    for (const roleId of input.roleIds) {
                        await client.query('insert into user_role (app_user_id, role_id) values ($1, $2) on conflict do nothing', [id, roleId]);
                    }
                }
                await client.query('commit');
            }
            catch (err) {
                await client.query('rollback');
                throw err;
            }
            finally {
                client.release();
            }
            return this.findById(companyId, id);
        }
        /** غیرفعال‌سازی (حذف فیزیکی ممنوع — ممیزی)؛ false یعنی کاربر در این شرکت نیست */
        async deactivate(companyId, id) {
            const { rowCount } = await this.pool.query(`update app_user set is_active = false
        where id = $1
          and person_id in (select id from person where company_id = $2)`, [id, companyId]);
            return (rowCount ?? 0) > 0;
        }
    };
    return UsersRepository = _classThis;
})();
exports.UsersRepository = UsersRepository;
