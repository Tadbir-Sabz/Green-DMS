import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
// PG_POOL tenant-aware از database.module (نه db/pg.module که Pool خام بدون GUC نشست
// بود و RLS مهاجرت 0021 را دور می‌زد).
import { PG_POOL } from '../../database/database.module';

export interface UomRow extends QueryResultRow {
  id: string;
  code: string;
  title: string;
  decimal_places: number;
}

export interface ProductPackagingRow extends QueryResultRow {
  id: string;
  product_id: string;
  uom_id: string;
  factor_to_base: number;
  barcode: string | null;
  is_sales_default: boolean;
  is_purchase_default: boolean;
  uom_code?: string;
  uom_title?: string;
}

export interface CreateUomInput {
  code: string;
  title: string;
  decimal_places?: number;
}

export interface CreateProductPackagingInput {
  product_id: string;
  uom_id: string;
  factor_to_base: number;
  barcode?: string | null;
  is_sales_default?: boolean;
  is_purchase_default?: boolean;
}

/**
 * داده‌های اشتراکی بسته‌بندی — uom سراسری (کد مشترک همه شرکت‌ها) ولی
 * product_packaging حتماً باید در محدودهٔ شرکت نشست باقی بماند (ایزوله‌سازی
 * شرکت‌های چندمستأجری؛ فاز B).
 */
@Injectable()
export class MasterDataRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** uom فهرست مرجع سراسری است؛ companyId برای هماهنگی امضا گرفته می‌شود */
  async listUom(companyId: string): Promise<UomRow[]> {
    const res = await this.pool.query<UomRow>('select * from uom order by code');
    return res.rows;
  }

  /** upsert بر اساس code سراسری */
  async createUom(companyId: string, body: CreateUomInput): Promise<UomRow> {
    const res = await this.pool.query<UomRow>(
      'insert into uom (code, title, decimal_places) values ($1,$2,$3) on conflict (code) do update set title = excluded.title returning *',
      [body.code, body.title, body.decimal_places ?? 0],
    );
    return res.rows[0];
  }

  /** بسته‌بندی‌های یک کالا — فقط اگر کالا متعلق به شرکت نشست باشد */
  async listProductPackaging(companyId: string, productId: string): Promise<ProductPackagingRow[]> {
    const res = await this.pool.query<ProductPackagingRow>(
      `select pp.*, u.code as uom_code, u.title as uom_title
         from product_packaging pp
         join product p on p.id = pp.product_id and p.company_id = $1
         left join uom u on u.id = pp.uom_id
        where pp.product_id = $2
        order by pp.factor_to_base asc`,
      [companyId, productId],
    );
    return res.rows;
  }

  /**
   * ثبت/به‌روزرسانی بسته‌بندی — insert از روی ردیف محصول انتخاب می‌شود تا
   * محصولِ شرکت دیگر قابل استفاده نباشد؛ null یعنی محصول در این شرکت نیست.
   */
  async createProductPackaging(
    companyId: string,
    body: CreateProductPackagingInput,
  ): Promise<ProductPackagingRow | null> {
    const res = await this.pool.query<ProductPackagingRow>(
      `insert into product_packaging
         (product_id, uom_id, factor_to_base, barcode, is_sales_default, is_purchase_default)
       select p.id, $2, $3, $4, $5, $6
         from product p
        where p.id = $1 and p.company_id = $7
       on conflict (product_id, uom_id)
       do update set factor_to_base = excluded.factor_to_base, barcode = excluded.barcode
       returning *`,
      [
        body.product_id,
        body.uom_id,
        body.factor_to_base,
        body.barcode ?? null,
        body.is_sales_default ?? false,
        body.is_purchase_default ?? false,
        companyId,
      ],
    );
    return res.rows[0] ?? null;
  }

  /** آیا کالا متعلق به شرکت نشست است؟ (برای تفکیک 404 از لیست خالی) */
  async productBelongsToCompany(companyId: string, productId: string): Promise<boolean> {
    const res = await this.pool.query(
      'select 1 from product where id = $1 and company_id = $2',
      [productId, companyId],
    );
    return res.rows.length > 0;
  }

  /** مالکیت بسته‌بندی (برای تغییر پیش‌فرض) — null اگر در شرکت نباشد */
  async packagingOwner(companyId: string, id: string): Promise<{ product_id: string } | null> {
    const res = await this.pool.query<{ product_id: string }>(
      `select pp.product_id
         from product_packaging pp
         join product p on p.id = pp.product_id and p.company_id = $2
        where pp.id = $1`,
      [id, companyId],
    );
    return res.rows[0] ?? null;
  }

  /**
   * تعیین پیش‌فرض فروش — فقط برای بسته‌بندی در شرکت نشست؛ null اگر متعلق
   * به شرکت دیگر باشد تا کنترلر 404 بدهد.
   */
  async setDefaultPackaging(
    companyId: string,
    id: string,
    isSalesDefault: boolean,
  ): Promise<ProductPackagingRow | null> {
    const owner = await this.packagingOwner(companyId, id);
    if (!owner) return null;
    if (isSalesDefault) {
      // در هر کالا حداکثر یک پیش‌فرض فروش
      await this.pool.query(
        'update product_packaging set is_sales_default = false where product_id = $1',
        [owner.product_id],
      );
    }
    const res = await this.pool.query<ProductPackagingRow>(
      'update product_packaging set is_sales_default = $1 where id = $2 returning *',
      [isSalesDefault, id],
    );
    return res.rows[0] ?? null;
  }
}

export default MasterDataRepository;
