import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import { ownerTenantSql } from './owner-scope';

/** یک ضمیمه — شکل schemas.Attachment (ستون company_id در مهاجرت 0035 افزوده شد) */
export interface AttachmentRow extends QueryResultRow {
  id: string;
  company_id: string | null;
  owner_type: string;
  owner_id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  storage_key: string;
  sha256: string;
  uploaded_by: string | null;
  created_at: string;
}

const COLS = `id, company_id, owner_type, owner_id, file_name, content_type,
              size_bytes, storage_key, sha256, uploaded_by, created_at`;

export interface NewAttachment {
  company_id: string;
  owner_type: string;
  owner_id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  storage_key: string;
  sha256: string;
  uploaded_by: string | null;
}

/**
 * دسترسی دادهٔ ضمیمه‌ها روی جدول attachment (مهاجرت 0002 + ستون company_id از 0035).
 * همه کوئری‌ها با company_id نشست محدود می‌شوند (جداسازی چنداجاره‌ای در لایهٔ برنامه،
 * هم‌راستا با سایر ریپوزیتوری‌ها) تا یک شرکت نتواند ضمیمهٔ شرکت دیگر را ببیند/بگیرد.
 */
@Injectable()
export class AttachmentsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async insert(a: NewAttachment): Promise<AttachmentRow> {
    const { rows } = await this.pool.query<AttachmentRow>(
      `insert into attachment
         (company_id, owner_type, owner_id, file_name, content_type,
          size_bytes, storage_key, sha256, uploaded_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning ${COLS}`,
      [
        a.company_id,
        a.owner_type,
        a.owner_id,
        a.file_name,
        a.content_type,
        a.size_bytes,
        a.storage_key,
        a.sha256,
        a.uploaded_by,
      ],
    );
    return rows[0];
  }

  /** یافتن ضمیمه فقط در دامنهٔ همان شرکت (جلوگیری از IDOR بین اجاره‌ها). */
  async findByIdInCompany(id: string, companyId: string): Promise<AttachmentRow | null> {
    const { rows } = await this.pool.query<AttachmentRow>(
      `select ${COLS} from attachment where id = $1 and company_id = $2`,
      [id, companyId],
    );
    return rows[0] ?? null;
  }

  /**
   * اثباتِ مالکیتِ اجاره‌ایِ «موجودیتِ مالکِ ضمیمه» از راهِ زنجیرهٔ والد در خودِ DB.
   *
   * company_idِ واقعیِ موجودیتِ مالک را برمی‌گرداند، یا null اگر:
   *   - موجودیت وجود ندارد، یا
   *   - به اجارهٔ دیگری تعلق دارد (RLS روی جداولِ والد آن را نامرئی می‌کند)، یا
   *   - owner_type مسیرِ راستی‌آزمایی‌شده ندارد (مثلِ `other`).
   * چون خودِ کوئری زیرِ RLS اجرا می‌شود، نبودِ سطر با «مالکِ شرکتِ دیگر» یکسان برخورد می‌شود
   * و وجودِ موجودیتِ اجارهٔ دیگر لو نمی‌رود (ضدِّ enumerate).
   */
  async resolveOwnerCompany(
    ownerType: string,
    ownerId: string,
  ): Promise<string | null> {
    const sql = ownerTenantSql(ownerType);
    if (!sql) return null;
    const { rows } = await this.pool.query<{ company_id: string | null }>(sql, [ownerId]);
    return rows[0]?.company_id ?? null;
  }

  /** فهرست ضمیمه‌های یک موجودیت (owner) در دامنهٔ شرکت — برای نمایش در فرم‌ها. */
  async listByOwner(
    companyId: string,
    ownerType: string,
    ownerId: string,
  ): Promise<AttachmentRow[]> {
    const { rows } = await this.pool.query<AttachmentRow>(
      `select ${COLS} from attachment
        where company_id = $1 and owner_type = $2 and owner_id = $3
        order by created_at desc, id desc`,
      [companyId, ownerType, ownerId],
    );
    return rows;
  }
}
