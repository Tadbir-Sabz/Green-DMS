import { catalogTransaction } from './catalog-access.service';
import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';

/**
 * دسترسیِ دادهٔ Product Master (P1) — SQL خام روی جدول‌های مهاجرت 0046
 * (product_family، product_alias، صفات، روابط، bundle، product_barcode، import).
 * الگو همانندِ product.repository: بدون ORM، ستون‌های نوشتنی صریح (مصون از injection).
 */

export interface FamilyRow extends QueryResultRow {
  id: string;
  code: string;
  name: string;
}

export interface AliasRow extends QueryResultRow {
  id: string;
  product_id: string;
  alias: string;
  alias_norm: string;
  kind: string;
}

export interface AttributeDefRow extends QueryResultRow {
  id: string;
  code: string;
  title: string;
  kind: string;
  is_variant_axis: boolean;
  is_required: boolean;
  sort_order: number;
}

export interface AttributeValueRow extends QueryResultRow {
  id: string;
  product_id: string;
  def_id: string;
  value_text: string | null;
  value_num: string | null;
  value_enum: string | null;
}

export interface BarcodeRow extends QueryResultRow {
  id: string;
  company_id: string;
  product_id: string;
  packaging_id: string | null;
  barcode: string;
  kind: string;
  is_primary: boolean;
  product_code?: string;
  product_name?: string;
}

export interface RelationRow extends QueryResultRow {
  id: string;
  product_id: string;
  related_id: string;
  kind: string;
  priority: number;
  related_code?: string;
  related_name?: string;
}

export interface BundleRow extends QueryResultRow {
  bundle_product_id: string;
  component_product_id: string;
  qty: string;
  component_code?: string;
  component_name?: string;
  component_status?: string;
}

@Injectable()
export class ProductMasterRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  // ---------- خانواده ----------
  async listFamilies(companyId: string): Promise<FamilyRow[]> {
    const { rows } = await this.pool.query<FamilyRow>(
      'select id, code, name from product_family where company_id = $1 order by code',
      [companyId],
    );
    return rows;
  }

  async createFamily(companyId: string, code: string, name: string): Promise<FamilyRow> {
    const { rows } = await this.pool.query<FamilyRow>(
      'insert into product_family (company_id, code, name) values ($1, $2, $3) returning id, code, name',
      [companyId, code, name],
    );
    return rows[0];
  }

  async familyExists(companyId: string, id: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      'select 1 from product_family where id = $1 and company_id = $2',
      [id, companyId],
    );
    return rows.length > 0;
  }

  // ---------- alias ----------
  async listAliases(companyId: string, productId: string): Promise<AliasRow[]> {
    const { rows } = await this.pool.query<AliasRow>(
      `select id, product_id, alias, alias_norm, kind from product_alias
        where company_id = $1 and product_id = $2 order by alias`,
      [companyId, productId],
    );
    return rows;
  }

  async insertAlias(
    companyId: string,
    productId: string,
    alias: string,
    aliasNorm: string,
    kind: string,
  ): Promise<AliasRow> {
    const { rows } = await this.pool.query<AliasRow>(
      `insert into product_alias (company_id, product_id, alias, alias_norm, kind)
       values ($1, $2, $3, $4, $5) returning id, product_id, alias, alias_norm, kind`,
      [companyId, productId, alias, aliasNorm, kind],
    );
    return rows[0];
  }

  async deleteAlias(companyId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'delete from product_alias where id = $1 and company_id = $2',
      [id, companyId],
    );
    return (rowCount ?? 0) > 0;
  }

  /** برخوردِ alias با کدها/aliasهای دیگر (تشخیصِ تکرارِ D2) */
  async findAliasConflicts(companyId: string, aliasNorm: string): Promise<
    { kind: 'product_code' | 'alias' | 'barcode'; product_id: string; code: string; name: string }[]
  > {
    const { rows } = await this.pool.query(
      `select 'product_code' as kind, p.id as product_id, p.code, p.name
         from product p where p.company_id = $1 and p.deleted_at is null
           and lower(p.code) = $2
       union all
       select 'alias', a.product_id, p.code, p.name
         from product_alias a join product p on p.id = a.product_id
        where a.company_id = $1 and a.alias_norm = $2 and p.deleted_at is null
       union all
       select 'barcode', b.product_id, p.code, p.name
         from product_barcode b join product p on p.id = b.product_id
        where b.company_id = $1 and b.barcode = $2 and p.deleted_at is null`,
      [companyId, aliasNorm],
    );
    return rows;
  }

  /** نام‌های مشابه (D2: فقط هشدار) — با trgm */
  async findSimilarNames(
    companyId: string,
    name: string,
    excludeProductId?: string,
  ): Promise<{ id: string; code: string; name: string; score: number }[]> {
    const { rows } = await this.pool.query(
      `select id, code, name, similarity(name, $2)::numeric(4,3) as score
         from product
        where company_id = $1 and deleted_at is null
          and (name % $2 or similarity(name, $2) >= 0.35)
          and ($3::uuid is null or id <> $3)
        order by similarity(name, $2) desc
        limit 5`,
      [companyId, name, excludeProductId ?? null],
    );
    return rows;
  }

  // ---------- صفات ----------
  async listAttributeDefs(companyId: string): Promise<AttributeDefRow[]> {
    const { rows } = await this.pool.query<AttributeDefRow>(
      `select id, code, title, kind, is_variant_axis, is_required, sort_order
         from product_attribute_def where company_id = $1 order by sort_order, code`,
      [companyId],
    );
    return rows;
  }

  async createAttributeDef(
    companyId: string,
    d: { code: string; title: string; kind: string; is_variant_axis: boolean; is_required: boolean; sort_order: number },
  ): Promise<AttributeDefRow> {
    const { rows } = await this.pool.query<AttributeDefRow>(
      `insert into product_attribute_def (company_id, code, title, kind, is_variant_axis, is_required, sort_order)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, code, title, kind, is_variant_axis, is_required, sort_order`,
      [companyId, d.code, d.title, d.kind, d.is_variant_axis, d.is_required, d.sort_order],
    );
    return rows[0];
  }

  async addEnumValue(defId: string, value: string, valueNorm: string): Promise<{ id: string; value: string }> {
    const { rows } = await this.pool.query<{ id: string; value: string }>(
      'insert into product_attribute_enum_value (def_id, value, value_norm) values ($1, $2, $3) returning id, value',
      [defId, value, valueNorm],
    );
    return rows[0];
  }

  async listEnumValues(defId: string): Promise<{ id: string; value: string; value_norm: string }[]> {
    const { rows } = await this.pool.query(
      'select id, value, value_norm from product_attribute_enum_value where def_id = $1 order by value',
      [defId],
    );
    return rows;
  }

  async getAttributeDef(companyId: string, defId: string): Promise<AttributeDefRow | null> {
    const { rows } = await this.pool.query<AttributeDefRow>(
      `select id, code, title, kind, is_variant_axis, is_required, sort_order
         from product_attribute_def where id = $1 and company_id = $2`,
      [defId, companyId],
    );
    return rows[0] ?? null;
  }

  async listAttributeValues(productId: string): Promise<AttributeValueRow[]> {
    const { rows } = await this.pool.query<AttributeValueRow>(
      `select id, product_id, def_id, value_text, value_num, value_enum
         from product_attribute_value where product_id = $1`,
      [productId],
    );
    return rows;
  }

  async upsertAttributeValue(v: {
    productId: string;
    defId: string;
    valueText: string | null;
    valueNum: string | null;
    valueEnum: string | null;
  }): Promise<AttributeValueRow> {
    const { rows } = await this.pool.query<AttributeValueRow>(
      `insert into product_attribute_value (product_id, def_id, value_text, value_num, value_enum)
       values ($1, $2, $3, $4, $5)
       on conflict (product_id, def_id) do update
         set value_text = excluded.value_text,
             value_num = excluded.value_num,
             value_enum = excluded.value_enum
       returning id, product_id, def_id, value_text, value_num, value_enum`,
      [v.productId, v.defId, v.valueText, v.valueNum, v.valueEnum],
    );
    return rows[0];
  }

  async deleteAttributeValue(productId: string, defId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'delete from product_attribute_value where product_id = $1 and def_id = $2',
      [productId, defId],
    );
    return (rowCount ?? 0) > 0;
  }

  async setProductVariantSignature(productId: string, signature: string | null): Promise<void> {
    await this.pool.query('update product set variant_signature = $2 where id = $1', [productId, signature]);
  }

  async getProductAxisInfo(productId: string): Promise<{
    family_id: string | null;
    variant_signature: string | null;
  } | null> {
    const { rows } = await this.pool.query(
      'select family_id, variant_signature from product where id = $1',
      [productId],
    );
    return rows[0] ?? null;
  }

  // ---------- روابط ----------
  async listRelations(productId: string): Promise<RelationRow[]> {
    const { rows } = await this.pool.query<RelationRow>(
      `select r.id, r.product_id, r.related_id, r.kind, r.priority, p.code as related_code, p.name as related_name
         from product_relation r join product p on p.id = r.related_id
        where r.product_id = $1 order by r.kind, r.priority`,
      [productId],
    );
    return rows;
  }

  async insertRelation(
    companyId: string,
    productId: string,
    relatedId: string,
    kind: string,
    priority: number,
  ): Promise<RelationRow> {
    const { rows } = await this.pool.query<RelationRow>(
      `insert into product_relation (company_id, product_id, related_id, kind, priority)
       values ($1, $2, $3, $4, $5) returning id, product_id, related_id, kind, priority`,
      [companyId, productId, relatedId, kind, priority],
    );
    return rows[0];
  }

  async deleteRelation(companyId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'delete from product_relation where id = $1 and company_id = $2',
      [id, companyId],
    );
    return (rowCount ?? 0) > 0;
  }

  /** حلقهٔ substitute: آیا relatedId (به‌صورتِ مستقیم/غیرمستقیم) به productId برمی‌گردد؟ */
  async substitutePathExists(productId: string, relatedId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      `with recursive reach(id) as (
         select $2::uuid
         union
         select r.related_id from product_relation r join reach h on r.product_id = h.id
          where r.kind = 'substitute'
       )
       select 1 from reach where id = $1::uuid`,
      [productId, relatedId],
    );
    return rows.length > 0;
  }

  // ---------- bundle ----------
  async listBundle(bundleProductId: string): Promise<BundleRow[]> {
    const { rows } = await this.pool.query<BundleRow>(
      `select b.bundle_product_id, b.component_product_id, b.qty::text as qty,
              p.code as component_code, p.name as component_name, p.status as component_status
         from product_bundle b join product p on p.id = b.component_product_id
        where b.bundle_product_id = $1 order by p.code`,
      [bundleProductId],
    );
    return rows;
  }

  async replaceBundle(
    bundleProductId: string,
    items: { componentProductId: string; qty: string }[],
  ): Promise<void> {
    const ambient = catalogTransaction.getStore();
    const client = ambient ?? await this.pool.connect();
    try {
      if (!ambient) await client.query('begin');
      await client.query('delete from product_bundle where bundle_product_id = $1', [bundleProductId]);
      for (const item of items) {
        await client.query(
          'insert into product_bundle (bundle_product_id, component_product_id, qty) values ($1, $2, $3)',
          [bundleProductId, item.componentProductId, item.qty],
        );
      }
      if (!ambient) await client.query('commit');
    } catch (err) {
      if (!ambient) await client.query('rollback');
      throw err;
    } finally {
      if (!ambient) client.release();
    }
  }

  /** کدام‌یک از این SKUها بسته‌اند؟ (D5) */
  async findBundleProductIds(productIds: string[]): Promise<string[]> {
    if (productIds.length === 0) return [];
    const { rows } = await this.pool.query<{ bundle_product_id: string }>(
      'select distinct bundle_product_id from product_bundle where bundle_product_id = any($1::uuid[])',
      [productIds],
    );
    return rows.map((r) => r.bundle_product_id);
  }

  async productExists(companyId: string, productId: string): Promise<{ id: string; code: string; status: string } | null> {
    const { rows } = await this.pool.query(
      'select id, code, status from product where id = $1 and company_id = $2 and deleted_at is null',
      [productId, companyId],
    );
    return rows[0] ?? null;
  }

  // ---------- بارکد ----------
  async listBarcodes(companyId: string, productId: string): Promise<BarcodeRow[]> {
    const { rows } = await this.pool.query<BarcodeRow>(
      `select id, company_id, product_id, packaging_id, barcode, kind, is_primary
         from product_barcode where company_id = $1 and product_id = $2
        order by is_primary desc, created_at`,
      [companyId, productId],
    );
    return rows;
  }

  async insertBarcode(b: {
    companyId: string;
    productId: string;
    packagingId: string | null;
    barcode: string;
    kind: string;
    isPrimary: boolean;
  }): Promise<BarcodeRow> {
    const { rows } = await this.pool.query<BarcodeRow>(
      `insert into product_barcode (company_id, product_id, packaging_id, barcode, kind, is_primary)
       values ($1, $2, $3, $4, $5, $6)
       returning id, company_id, product_id, packaging_id, barcode, kind, is_primary`,
      [b.companyId, b.productId, b.packagingId, b.barcode, b.kind, b.isPrimary],
    );
    return rows[0];
  }

  async deleteBarcode(companyId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'delete from product_barcode where id = $1 and company_id = $2',
      [id, companyId],
    );
    return (rowCount ?? 0) > 0;
  }

  async clearPrimaryBarcodes(productId: string, packagingId: string | null): Promise<void> {
    await this.pool.query(
      `update product_barcode set is_primary = false
        where product_id = $1 and packaging_id is not distinct from $2`,
      [productId, packagingId],
    );
  }

  /** نام‌های دیگرِ همین مقدارِ بارکد (برای resolution چندپاسخی و برخورد) */
  async findBarcodeMatches(barcodeNorm: string): Promise<BarcodeRow[]> {
    const { rows } = await this.pool.query<BarcodeRow>(
      `select b.id, b.company_id, b.product_id, b.packaging_id, b.barcode, b.kind, b.is_primary,
              p.code as product_code, p.name as product_name
         from product_barcode b join product p on p.id = b.product_id
        where b.barcode = $1 and p.deleted_at is null`,
      [barcodeNorm],
    );
    return rows;
  }

  /** محصول بر اساسِ کد (مرحلهٔ ۲ resolution) */
  async findProductByCode(companyId: string, code: string): Promise<
    { id: string; code: string; name: string; status: string }[]
  > {
    const { rows } = await this.pool.query(
      `select id, code, name, status from product
        where company_id = $1 and deleted_at is null and lower(code) = lower($2)`,
      [companyId, code],
    );
    return rows;
  }

  /** alias از نوعِ code (مرحلهٔ ۳ resolution) */
  async findProductByCodeAlias(companyId: string, valueNorm: string): Promise<
    { id: string; code: string; name: string; status: string }[]
  > {
    const { rows } = await this.pool.query(
      `select p.id, p.code, p.name, p.status
         from product_alias a join product p on p.id = a.product_id
        where a.company_id = $1 and a.kind = 'code' and a.alias_norm = $2 and p.deleted_at is null`,
      [companyId, valueNorm],
    );
    return rows;
  }

  /** آیا این مقدار با کد/aliasِ نوعِ code محصولِ دیگری هم‌ارز است؟ (جلوگیری از برخوردِ H-1) */
  async codeAliasCollisions(companyId: string, valueNorm: string, excludeProductId: string): Promise<
    { product_id: string; source: 'code' | 'alias' }[]
  > {
    const { rows } = await this.pool.query(
      `select p.id as product_id, 'code' as source from product p
        where p.company_id = $1 and p.deleted_at is null and p.id <> $3 and lower(p.code) = $2
       union all
       select a.product_id, 'alias' from product_alias a join product p on p.id = a.product_id
        where a.company_id = $1 and a.kind = 'code' and a.alias_norm = $2 and a.product_id <> $3 and p.deleted_at is null`,
      [companyId, valueNorm, excludeProductId],
    );
    return rows;
  }

  // ---------- شمارندهٔ کدِ خودکار (D1) ----------
  async nextCodeSeq(companyId: string): Promise<number> {
    const { rows } = await this.pool.query<{ next_seq: string }>(
      `insert into product_code_seq (company_id, next_seq) values ($1, 1)
       on conflict (company_id) do update set next_seq = product_code_seq.next_seq + 1
       returning next_seq`,
      [companyId],
    );
    return Number(rows[0].next_seq);
  }

  // ---------- تغییرناپذیریِ variant (M-3) ----------
  /** آیا SKU به ارجاعِ عملیاتی (سند/موجودی/قیمت/بچ) رسیده است؟ */
  async productHasOperationalRefs(productId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      `select 1 where exists (select 1 from sales_order_line where product_id = $1)
          or exists (select 1 from invoice_line where product_id = $1)
          or exists (select 1 from credit_note_line where product_id = $1)
          or exists (select 1 from return_request_line where product_id = $1)
          or exists (select 1 from purchase_order_line where product_id = $1)
          or exists (select 1 from goods_receipt_line where product_id = $1)
          or exists (select 1 from stock_transfer_line where product_id = $1)
          or exists (select 1 from waybill_line where product_id = $1)
          or exists (select 1 from delivery_line where product_id = $1)
          or exists (select 1 from stock_count_line where product_id = $1)
          or exists (select 1 from inventory_txn where product_id = $1)
          or exists (select 1 from price_list_item where product_id = $1)
          or exists (select 1 from customer_price where product_id = $1)
          or exists (select 1 from batch where product_id = $1)`,
      [productId],
    );
    return rows.length > 0;
  }

  // ---------- import ----------
  async insertImport(r: {
    companyId: string;
    idempotencyKey: string;
    mode: string;
    totalRows: number;
    createdRows: number;
    updatedRows: number;
    failedRows: number;
    report: unknown;
    createdBy: string | null;
  }): Promise<{ id: string }> {
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into product_import
         (company_id, idempotency_key, mode, total_rows, created_rows, updated_rows, failed_rows, report, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (company_id, idempotency_key) do update
         set total_rows = excluded.total_rows, created_rows = excluded.created_rows,
             updated_rows = excluded.updated_rows, failed_rows = excluded.failed_rows,
             report = excluded.report
       returning id`,
      [r.companyId, r.idempotencyKey, r.mode, r.totalRows, r.createdRows, r.updatedRows, r.failedRows, JSON.stringify(r.report), r.createdBy],
    );
    return rows[0];
  }

  async findImportByIdempotencyKey(companyId: string, key: string): Promise<
    { id: string; total_rows: number; created_rows: number; updated_rows: number; failed_rows: number } | null
  > {
    const { rows } = await this.pool.query(
      `select id, total_rows, created_rows, updated_rows, failed_rows
         from product_import where company_id = $1 and idempotency_key = $2`,
      [companyId, key],
    );
    return rows[0] ?? null;
  }

  async getImport(companyId: string, id: string): Promise<(QueryResultRow & { report: unknown }) | null> {
    const { rows } = await this.pool.query(
      `select id, mode, total_rows, created_rows, updated_rows, failed_rows, report, created_at
         from product_import where id = $1 and company_id = $2`,
      [id, companyId],
    );
    return rows[0] ?? null;
  }

  // ---------- کمکی ----------
  async resolveCategoryCodes(companyId: string, codes: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (codes.length === 0) return map;
    const { rows } = await this.pool.query<{ id: string; code: string }>(
      'select id, code from product_category where company_id = $1 and code = any($2::text[])',
      [companyId, codes],
    );
    for (const r of rows) map.set(r.code, r.id);
    return map;
  }

  async resolveUomCodes(codes: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (codes.length === 0) return map;
    const { rows } = await this.pool.query<{ id: string; code: string }>(
      'select id, code from uom where code = any($1::text[])',
      [codes],
    );
    for (const r of rows) map.set(r.code, r.id);
    return map;
  }

  async resolveTaxCodes(companyId: string, codes: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (codes.length === 0) return map;
    const { rows } = await this.pool.query<{ id: string; code: string }>(
      'select id, code from tax_code where company_id = $1 and code = any($2::text[])',
      [companyId, codes],
    );
    for (const r of rows) map.set(r.code, r.id);
    return map;
  }

  /** درجِ ردیفِ import (mode=create) */
  async insertProductRow(p: {
    companyId: string;
    code: string;
    name: string;
    nameLatin: string | null;
    categoryId: string;
    uomId: string;
    taxId: string | null;
    minOrderQty: number;
    weightGr: number | null;
    volumeCm3: number | null;
    distributionKind: string;
    status: string | null;
  }): Promise<{ id: string; code: string }> {
    const { rows } = await this.pool.query<{ id: string; code: string }>(
      `insert into product (company_id, code, name, name_latin, category_id, base_uom_id, tax_code_id,
                            min_order_qty, weight_gr, volume_cm3, distribution_kind, status)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, coalesce($12, 'active'))
       returning id, code`,
      [p.companyId, p.code, p.name, p.nameLatin, p.categoryId, p.uomId, p.taxId,
       p.minOrderQty, p.weightGr, p.volumeCm3, p.distributionKind, p.status],
    );
    return rows[0];
  }

  /** بروزرسانیِ ردیفِ import (mode=update/upsert) */
  async updateProductRow(
    id: string,
    companyId: string,
    sets: { col: string; value: unknown }[],
  ): Promise<void> {
    if (sets.length === 0) return;
    const params: unknown[] = [id, companyId];
    const clauses = sets.map((s) => {
      params.push(s.value);
      return `${s.col} = $${params.length}`;
    });
    await this.pool.query(
      `update product set ${clauses.join(', ')} where id = $1 and company_id = $2 and deleted_at is null`,
      params,
    );
  }

  async productCodeExists(companyId: string, code: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      'select 1 from product where company_id = $1 and deleted_at is null and code = $2',
      [companyId, code],
    );
    return rows.length > 0;
  }

  async getProductsForImport(companyId: string, codes: string[]): Promise<Map<string, { id: string; code: string }>> {
    const map = new Map<string, { id: string; code: string }>();
    if (codes.length === 0) return map;
    const { rows } = await this.pool.query<{ id: string; code: string }>(
      'select id, code from product where company_id = $1 and deleted_at is null and code = any($2::text[])',
      [companyId, codes],
    );
    for (const r of rows) map.set(r.code, r);
    return map;
  }
}
