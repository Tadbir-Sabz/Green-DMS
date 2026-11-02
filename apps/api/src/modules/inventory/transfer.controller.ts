import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import { CreateTransferDto, ListTransfersQueryDto } from './stock.dto';
import type { TransferRow } from './transfer.repository';
import type { TransferService, TransferView } from './transfer.service';
import { TRANSFER_SERVICE } from './tokens';

/**
 * انتقال بین‌انباری — /transfers و /transfers/{id} مطابق openapi.yaml (فقط خواندن/ساخت؛
 * تغییر وضعیت در قرارداد نیست و سند با draft ساخته می‌شود).
 * خواندن inventory.stock.view؛ ثبت inventory.transfer.create.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('transfers')
export class TransferController {
  constructor(@Inject(TRANSFER_SERVICE) private readonly service: TransferService) {}

  @Get()
  @RequirePermissions('inventory.stock.view')
  list(
    @Query() query: ListTransfersQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<TransferRow>> {
    return this.service.list(companyId, query);
  }

  @Post()
  @RequirePermissions('inventory.transfer.create')
  create(
    @Body() dto: CreateTransferDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<TransferView> {
    return this.service.create(companyId, dto);
  }

  @Get(':id')
  @RequirePermissions('inventory.stock.view')
  get(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<TransferView> {
    return this.service.get(companyId, id);
  }
}
