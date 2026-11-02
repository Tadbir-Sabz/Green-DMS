import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import type {
  CreatePriceListDto,
  CreatePromotionDto,
  ListPriceListsQueryDto,
  ListPromotionsQueryDto,
  UpdatePriceListDto,
  UpdatePromotionDto,
} from './pricing.dto';

export interface PriceListRow extends QueryResultRow {
  id: string;
  code: string;
  title: string;
  kind: string;
  currency: string;
  is_active: boolean;
}

export interface PriceListItemRow extends QueryResultRow {
  product_id: string;
  price: string;
  valid_from: string | null;
  valid_to: string | null;
}

export interface PromotionRow extends QueryResultRow {
  id: string;
  code: string;
  title: string;
  kind: string;
  valid_from: string;
  valid_to: string | null;
  priority: number;
  allow_stacking: boolean;
  max_discount_amount: string | null;
  max_per_customer_per_day: string | null;
  conditions: Record<string, unknown>;
  benefit: Record<string, unknown>;
  is_active: boolean;
}

const encodeCursor = (v: string): string => Buffer.from(v, 'utf8').toString('base64url');
const decodeCursor = (c: string): string => Buffer.from(c, 'base64url').toString('utf8');

/** ساخت بازهٔ تاریخ از پارامترهای nullable (بدون injection — همه پارامتری) */
const RANGE = `daterange(coalesce($%d::date, current_date), $%d::date)`;

@Injectable()
export class PricingRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  // ---------------- لیست قیمت ----------------

  async listPriceLists(companyId: string, query: ListPriceListsQueryDto): Promise<{
    items: PriceListRow[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const where: string[] = ['company_id = $1'];
    if (query.cursor) {
      params.push(decodeCursor(query.cursor));
      where.push(`code > $${params.length}`);
    }
    params.push(limit + 1);
    const { rows } = await this.pool.query<PriceListRow>(
      `select id, code, title, kind, currency, is_active from price_list
        where ${where.join(' and ')}
        order by code
        limit $${params.length}`,
      params,
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return { items: page, hasMore, nextCursor: hasMore && last ? encodeCursor(last.code) : null };
  }

  async findPriceList(companyId: string, id: string): Promise<PriceListRow | null> {
    const { rows } = await this.pool.query<PriceListRow>(
      `select id, code, title, kind, currency, is_active from price_list
        where id = $1 and company_id = $2`,
      [id, companyId],
    );
    return rows[0] ?? null;
  }

  async findPriceListItems(priceListId: string): Promise<PriceListItemRow[]> {
    const { rows } = await this.pool.query<PriceListItemRow>(
      `select product_id, price::text as price,
              lower(valid)::text as valid_from,
              upper(valid)::text as valid_to
         from price_list_item
        where price_list_id = $1
        order by product_id`,
      [priceListId],
    );
    return rows;
  }

  async insertPriceList(companyId: string, dto: CreatePriceListDto): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const header = await client.query<{ id: string }>(
        `insert into price_list (company_id, code, title, kind, currency, is_active)
         values ($1, $2, $3, coalesce($4,'general'), coalesce($5,'IRR'), coalesce($6,true))
         returning id`,
        [companyId, dto.code, dto.title, dto.kind ?? null, dto.currency ?? null, dto.is_active ?? null],
      );
      const id = header.rows[0].id;
      for (const item of dto.items ?? []) {
        await this.insertItem(client, id, item);
      }
      await client.query('commit');
      return id;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async updatePriceList(companyId: string, id: string, dto: UpdatePriceListDto): Promise<string | null> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const owned = await client.query(
        `update price_list set
           code = coalesce($3, code),
           title = coalesce($4, title),
           kind = coalesce($5, kind),
           currency = coalesce($6, currency),
           is_active = coalesce($7, is_active)
         where id = $1 and company_id = $2
         returning id`,
        [id, companyId, dto.code ?? null, dto.title ?? null, dto.kind ?? null, dto.currency ?? null, dto.is_active ?? null],
      );
      if (owned.rowCount === 0) {
        await client.query('rollback');
        return null;
      }
      if (dto.items) {
        await client.query(`delete from price_list_item where price_list_id = $1`, [id]);
        for (const item of dto.items) {
          await this.insertItem(client, id, item);
        }
      }
      await client.query('commit');
      return id;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  private async insertItem(
    client: PoolClient,
    priceListId: string,
    item: { product_id: string; price: string; valid_from?: string | null; valid_to?: string | null },
  ): Promise<void> {
    await client.query(
      `insert into price_list_item (price_list_id, product_id, price, min_qty, valid)
       values ($1, $2, $3, 0, ${RANGE.replace('%d', '4').replace('%d', '5')})`,
      [priceListId, item.product_id, item.price, item.valid_from ?? null, item.valid_to ?? null],
    );
  }

  async productExists(companyId: string, productId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      `select 1 from product where id = $1 and company_id = $2`,
      [productId, companyId],
    );
    return rows.length > 0;
  }

  // ---------------- تشویق ----------------

  async listPromotions(companyId: string, query: ListPromotionsQueryDto): Promise<{
    items: PromotionRow[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const where: string[] = ['company_id = $1'];
    if (query.is_active !== undefined) {
      params.push(query.is_active);
      where.push(`is_active = $${params.length}`);
    }
    if (query.cursor) {
      params.push(decodeCursor(query.cursor));
      where.push(`code > $${params.length}`);
    }
    params.push(limit + 1);
    const { rows } = await this.pool.query<PromotionRow>(
      `select id, code, title, kind,
              lower(valid)::text as valid_from,
              upper(valid)::text as valid_to,
              priority, allow_stacking,
              max_discount_amount::text as max_discount_amount,
              max_per_customer_per_day::text as max_per_customer_per_day,
              conditions, benefit, is_active
         from promotion
        where ${where.join(' and ')}
        order by code
        limit $${params.length}`,
      params,
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return { items: page, hasMore, nextCursor: hasMore && last ? encodeCursor(last.code) : null };
  }

  async findPromotion(companyId: string, id: string): Promise<PromotionRow | null> {
    const { rows } = await this.pool.query<PromotionRow>(
      `select id, code, title, kind,
              lower(valid)::text as valid_from,
              upper(valid)::text as valid_to,
              priority, allow_stacking,
              max_discount_amount::text as max_discount_amount,
              max_per_customer_per_day::text as max_per_customer_per_day,
              conditions, benefit, is_active
         from promotion
        where id = $1 and company_id = $2`,
      [id, companyId],
    );
    return rows[0] ?? null;
  }

  async insertPromotion(companyId: string, dto: CreatePromotionDto): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into promotion
         (company_id, code, title, kind, valid, priority, allow_stacking,
          max_discount_amount, max_per_customer_per_day, conditions, benefit, is_active)
       values ($1, $2, $3, $4,
               ${RANGE.replace('%d', '5').replace('%d', '6')},
               coalesce($7,100), coalesce($8,false), $9, $10,
               coalesce($11::jsonb,'{}'::jsonb), coalesce($12::jsonb,'{}'::jsonb), coalesce($13,true))
       returning id`,
      [
        companyId,
        dto.code,
        dto.title,
        dto.kind,
        dto.valid_from ?? null,
        dto.valid_to ?? null,
        dto.priority ?? null,
        dto.allow_stacking ?? null,
        dto.max_discount_amount ?? null,
        dto.max_per_customer_per_day ?? null,
        JSON.stringify(dto.conditions ?? {}),
        JSON.stringify(dto.benefit ?? {}),
        dto.is_active ?? null,
      ],
    );
    return rows[0].id;
  }

  async updatePromotion(companyId: string, id: string, dto: UpdatePromotionDto): Promise<string | null> {
    const sets: string[] = [];
    const params: unknown[] = [id, companyId];
    const add = (fragment: string, value: unknown): void => {
      params.push(value);
      sets.push(fragment.replace('$?', `$${params.length}`));
    };
    if (dto.code !== undefined) add('code = $?', dto.code);
    if (dto.title !== undefined) add('title = $?', dto.title);
    if (dto.kind !== undefined) add('kind = $?', dto.kind);
    if (dto.valid_from !== undefined || dto.valid_to !== undefined) {
      params.push(dto.valid_from ?? null, dto.valid_to ?? null);
      const n = params.length;
      sets.push(`valid = daterange(coalesce(${n - 1}::date, lower(valid)), coalesce(${n}::date, upper(valid)))`);
    }
    if (dto.priority !== undefined) add('priority = $?', dto.priority);
    if (dto.allow_stacking !== undefined) add('allow_stacking = $?', dto.allow_stacking);
    if (dto.max_discount_amount !== undefined) add('max_discount_amount = $?', dto.max_discount_amount);
    if (dto.max_per_customer_per_day !== undefined) add('max_per_customer_per_day = $?', dto.max_per_customer_per_day);
    if (dto.conditions !== undefined) add(`conditions = $?::jsonb`, JSON.stringify(dto.conditions));
    if (dto.benefit !== undefined) add(`benefit = $?::jsonb`, JSON.stringify(dto.benefit));
    if (dto.is_active !== undefined) add('is_active = $?', dto.is_active);

    if (sets.length === 0) return id;
    const { rows } = await this.pool.query<{ id: string }>(
      `update promotion set ${sets.join(', ')} where id = $1 and company_id = $2 returning id`,
      params,
    );
    return rows[0]?.id ?? null;
  }
}
