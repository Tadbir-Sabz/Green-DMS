import {
  Controller,
  Get,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { CurrentUser, type AuthContext } from '../identity-rbac/auth-context.decorator';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { RequestMetaParam, type RequestMeta } from '../../common/request-meta';
import { ExportProductsQueryDto } from './product-export.dto';
import { ProductExportService } from './product-export.service';
import { DomainBoundaryGuard } from './domain-boundary.guard';

/**
 * GET /api/v1/products/export — filtered Product Master CSV snapshot.
 * Registered before ProductController so the literal path wins over /:id.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('products')
export class ProductExportController {
  constructor(private readonly service: ProductExportService) {}

  // TASK-PM-02-B2 — read-surface parity with the central CRUD boundary.
  // The global ValidationPipe has `whitelist: true`; without this guard a
  // `?available=true` / `?domain_id=…` export request would have the unknown
  // query key *silently dropped* and would return a FULL central CSV snapshot
  // while the caller believed it had asked for domain-scoped data. The guard
  // rejects such keys (and any `x-domain-id` header) with 400 before the pipe
  // runs. It creates no domain identity, membership, availability or authority.
  @Get('export')
  @RequirePermissions('master.product.view')
  @UseGuards(DomainBoundaryGuard)
  async export(
    @Query() query: ExportProductsQueryDto,
    @CurrentUser() user: AuthContext,
    @RequestMetaParam() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const result = await this.service.export(user.companyId, user.userId, query, meta);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('X-Product-Export-Row-Count', String(result.rowCount));
    res.setHeader('X-Product-Export-Truncated', result.truncated ? 'true' : 'false');
    res.setHeader('X-Product-Export-Max-Rows', String(result.maxRows));
    res.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(Buffer.from(result.csv, 'utf8'));
  }
}
