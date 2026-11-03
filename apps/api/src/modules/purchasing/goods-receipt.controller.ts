import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import {
  CreateGoodsReceiptDto,
  ListGoodsReceiptsQueryDto,
  ListValuationQueryDto,
} from './goods-receipt.dto';
import type { GoodsReceiptRow, ValuationRow } from './goods-receipt.repository';
import type { GoodsReceiptService, ValuationService } from './goods-receipt.service';
import { GOODS_RECEIPT_SERVICE, VALUATION_SERVICE } from './tokens';

/** رسید انبار خرید (GRN) — /goods-receipts (ماژول ۸، برچسب ap) */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('goods-receipts')
export class GoodsReceiptController {
  constructor(@Inject(GOODS_RECEIPT_SERVICE) private readonly service: GoodsReceiptService) {}

  @Get()
  @RequirePermissions('ap.supplier.view')
  list(
    @Query() query: ListGoodsReceiptsQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<GoodsReceiptRow>> {
    return this.service.list(companyId, query);
  }

  @Get(':id')
  @RequirePermissions('ap.supplier.view')
  get(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<GoodsReceiptRow> {
    return this.service.get(companyId, id);
  }

  @Post()
  @RequirePermissions('ap.grn.post')
  create(
    @Body() dto: CreateGoodsReceiptDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<GoodsReceiptRow> {
    return this.service.create(companyId, dto);
  }

  @Post(':id/post')
  @HttpCode(200)
  @RequirePermissions('ap.grn.post')
  post(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<GoodsReceiptRow> {
    return this.service.post(companyId, id, userId);
  }
}

/** ارزش‌گذاری موجودی — /valuation (ماژول ۹، برچسب valuation) */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('valuation')
export class ValuationController {
  constructor(@Inject(VALUATION_SERVICE) private readonly service: ValuationService) {}

  @Get()
  @RequirePermissions('valuation.view')
  list(
    @Query() query: ListValuationQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<{ items: ValuationRow[] }> {
    return this.service.list(companyId, query);
  }
}
