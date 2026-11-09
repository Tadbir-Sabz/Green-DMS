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

/**
 * GET /api/v1/products/export — filtered Product Master CSV snapshot.
 * Registered before ProductController so the literal path wins over /:id.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('products')
export class ProductExportController {
  constructor(private readonly service: ProductExportService) {}

  @Get('export')
  @RequirePermissions('master.product.view')
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
