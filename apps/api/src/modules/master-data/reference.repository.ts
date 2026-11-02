import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';

/** ردیف دسته‌بندی — openapi › ProductCategory */
export interface CategoryRow extends QueryResultRow {
  id: string;
  code: string;
  name: string;
  parent_id: string | null;
}

/** ردیف واحد اندازه‌گیری — openapi › Unit (جدول uom با ستون title) */
export interface UnitRow extends QueryResultRow {
  id: string;
  code: string;
  title: string;
  decimal_places: number;
}

/**
 * داده‌های مرجع موردنیاز فرم کالا — فقط خواندن:
 *   GET /product-categories (دسته‌بندی شرکتِ نشست) و GET /units (سراسری)
 */
@Injectable()
export class ReferenceRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findCategories(companyId: string): Promise<CategoryRow[]> {
    const { rows } = await this.pool.query<CategoryRow>(
      `select id, code, name, parent_id
         from product_category
        where company_id = $1 and is_active
        order by code`,
      [companyId],
    );
    return rows;
  }

  async findUnits(): Promise<UnitRow[]> {
    const { rows } = await this.pool.query<UnitRow>(
      `select id, code, title, decimal_places
         from uom
        order by code`,
    );
    return rows;
  }
}
