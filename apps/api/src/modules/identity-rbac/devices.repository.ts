import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';

/** ردیف دستگاه — مطابق اسکیمای Device در openapi.yaml (جدول device، مهاجرت 0012) */
export interface DeviceRow extends QueryResultRow {
  id: string;
  app_user_id: string;
  device_uuid: string;
  platform: string;
  app_kind: string;
  app_version: string | null;
  os_version: string | null;
  push_token: string | null;
  is_trusted: boolean;
  last_seen_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface InsertDeviceInput {
  deviceUuid: string;
  platform: string;
  appKind: string;
  appVersion?: string | null;
  osVersion?: string | null;
  pushToken?: string | null;
}

export interface ListDevicesResult {
  items: DeviceRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

const COLUMNS = `id, app_user_id, device_uuid, platform, app_kind, app_version,
  os_version, push_token, is_trusted, last_seen_at, revoked_at, created_at`;

/**
 * cursor از `created_at|id` آخرین ردیف ساخته می‌شود (صفحه‌بندی keyset با ترتیب نزولی)
 */
const encodeCursor = (row: DeviceRow): string =>
  Buffer.from(`${new Date(row.created_at).toISOString()}|${row.id}`, 'utf8').toString('base64url');

const decodeCursor = (cursor: string): { createdAt: string; id: string } | null => {
  const raw = Buffer.from(cursor, 'base64url').toString('utf8');
  const at = raw.lastIndexOf('|');
  if (at <= 0) return null;
  const createdAt = raw.slice(0, at);
  const id = raw.slice(at + 1);
  if (Number.isNaN(Date.parse(createdAt))) return null;
  return { createdAt, id };
};

/**
 * دسترسی داده دستگاه‌های مجاز — SQL خام روی جدول `device` (بدون ORM، §۳.۲).
 * همه کوئری‌ها بر اساس app_user_id کاربرِ نشست‌اند؛ شناسه دستگاه از بیرون نمی‌آید
 * و به‌روزرسانی‌ها ستون‌های ثابت‌اند (مصون از injection).
 */
@Injectable()
export class DevicesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** دستگاه‌های کاربر، از تازه‌ترین به قدیمی‌ترین، با صفحه‌بندی keyset */
  async listByUser(userId: string, cursor?: string, limit = 50): Promise<ListDevicesResult> {
    const decoded = cursor ? decodeCursor(cursor) : null;
    const params: unknown[] = [userId, limit + 1];
    let where = 'where app_user_id = $1';
    if (decoded) {
      params.push(decoded.createdAt, decoded.id);
      where += ` and (created_at, id) < ($3::timestamptz, $4::uuid)`;
    }

    const { rows } = await this.pool.query<DeviceRow>(
      `select ${COLUMNS} from device ${where}
        order by created_at desc, id desc
        limit $2`,
      params,
    );
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, hasMore, nextCursor: hasMore && items.length > 0 ? encodeCursor(items[items.length - 1]) : null };
  }

  async findById(id: string): Promise<DeviceRow | null> {
    const { rows } = await this.pool.query<DeviceRow>(
      `select ${COLUMNS} from device where id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** دستگاهِ همین کاربر با همین شناسه سخت‌افزاری (ثبت تکراری / فعال‌سازی مجدد) */
  async findByUserAndUuid(userId: string, deviceUuid: string): Promise<DeviceRow | null> {
    const { rows } = await this.pool.query<DeviceRow>(
      `select ${COLUMNS} from device where app_user_id = $1 and device_uuid = $2`,
      [userId, deviceUuid],
    );
    return rows[0] ?? null;
  }

  /** هر ردیفی با همین شناسه سخت‌افزاری — برای ردِ تخصیص به کاربر دیگر */
  async findByUuid(deviceUuid: string): Promise<DeviceRow | null> {
    const { rows } = await this.pool.query<DeviceRow>(
      `select ${COLUMNS} from device where device_uuid = $1 limit 1`,
      [deviceUuid],
    );
    return rows[0] ?? null;
  }

  async insert(userId: string, input: InsertDeviceInput): Promise<DeviceRow> {
    const { rows } = await this.pool.query<DeviceRow>(
      `insert into device (app_user_id, device_uuid, platform, app_kind, app_version, os_version, push_token)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning ${COLUMNS}`,
      [
        userId,
        input.deviceUuid,
        input.platform,
        input.appKind,
        input.appVersion ?? null,
        input.osVersion ?? null,
        input.pushToken ?? null,
      ],
    );
    return rows[0];
  }

  /** دستگاه باطل‌شدهٔ همان کاربر: دوباره فعال می‌شود (is_trusted تا تأیید مجدد false) */
  async reactivate(
    id: string,
    userId: string,
    input: InsertDeviceInput,
  ): Promise<DeviceRow | null> {
    const { rows } = await this.pool.query<DeviceRow>(
      `update device
          set revoked_at = null, is_trusted = false, last_seen_at = null,
              platform = $3, app_kind = $4, app_version = $5, os_version = $6, push_token = $7
        where id = $1 and app_user_id = $2 and revoked_at is not null
        returning ${COLUMNS}`,
      [
        id,
        userId,
        input.platform,
        input.appKind,
        input.appVersion ?? null,
        input.osVersion ?? null,
        input.pushToken ?? null,
      ],
    );
    return rows[0] ?? null;
  }

  /** تأیید نهایی دستگاه با کد پیامکی (device_bind) + ثبت آخرین حضور */
  async markTrusted(id: string): Promise<void> {
    await this.pool.query(
      `update device set is_trusted = true, last_seen_at = now()
        where id = $1 and revoked_at is null`,
      [id],
    );
  }

  /** ابطال دستگاه همان کاربر؛ ردیف برای ممیزی می‌ماند */
  async revoke(id: string, userId: string): Promise<DeviceRow | null> {
    const { rows } = await this.pool.query<DeviceRow>(
      `update device set revoked_at = now(), is_trusted = false, last_seen_at = now()
        where id = $1 and app_user_id = $2 and revoked_at is null
        returning ${COLUMNS}`,
      [id, userId],
    );
    return rows[0] ?? null;
  }
}
