import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../../database/database.module';
import { tenantStorage } from '../../database/tenant-context';
import { AuditService, AUDIT_SERVICE } from '../../common/audit.service';
import { withTransaction } from '../../common/transaction';
import type { RequestMeta } from '../../common/request-meta';
import { CatalogAccess } from './catalog-access.service';
import { PRODUCT_REPOSITORY } from './tokens';
import type { ProductRepository } from './product.repository';
import type { ExportProductsQueryDto } from './product-export.dto';
import {
  buildProductExportCsv,
  productExportFilename,
  type ProductExportRow,
} from './product-export';

export interface ProductExportResult {
  csv: string;
  filename: string;
  rowCount: number;
  truncated: boolean;
  maxRows: number;
}

/**
 * TASK-PM-01D-M3 — central Product Master CSV portability.
 *
 * One repeatable-read, read-only transaction holds: service-level authorization,
 * tenant GUCs, the filtered projection and all reference joins. This gives an
 * internally consistent CSV snapshot under concurrent writes without adding a
 * write lock or a new runtime permission. RLS and the company predicate both
 * remain active; company_id comes only from the authenticated session.
 */
@Injectable()
export class ProductExportService {
  constructor(
    private readonly access: CatalogAccess,
    @Inject(PRODUCT_REPOSITORY) private readonly repo: ProductRepository,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  async export(
    companyId: string,
    userId: string,
    query: ExportProductsQueryDto,
    meta: RequestMeta,
  ): Promise<ProductExportResult> {
    const maxRows = query.limit ?? 10_000;
    const result = await withTransaction(this.pool, async (client) => {
      // Must be the first statements of the transaction; no data query precedes them.
      await client.query('set transaction isolation level repeatable read');
      await client.query('set transaction read only');
      await client.query(
        `select set_config('app.company_id', $1, true), set_config('app.user_id', $2, true)`,
        [companyId, userId],
      );
      return tenantStorage.run({ client, tenant: { companyId, userId } }, async () => {
        // Defense in depth: do not rely solely on the controller guard.
        await this.access.assert(companyId, userId, 'master.product.view');
        return this.repo.exportRows(companyId, query, client);
      });
    });

    const csv = buildProductExportCsv(result.rows as ProductExportRow[]);
    // Audit is intentionally outside the read transaction: audit failure must
    // never invalidate a successful read, matching the existing AuditService.
    await this.audit.record({
      companyId,
      actorUserId: userId,
      action: 'export',
      entityType: 'product_catalog',
      after: {
        row_count: result.rows.length,
        truncated: result.truncated,
        max_rows: maxRows,
        filters: {
          q: query.q ?? null,
          status: query.status ?? null,
          category_id: query.category_id ?? null,
          brand_id: query.brand_id ?? null,
          sort: query.sort ?? 'code_asc',
        },
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return {
      csv,
      filename: productExportFilename(),
      rowCount: result.rows.length,
      truncated: result.truncated,
      maxRows,
    };
  }
}
