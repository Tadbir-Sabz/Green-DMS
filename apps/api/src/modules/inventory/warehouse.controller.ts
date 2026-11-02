import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import {
  CreateWarehouseDto,
  ListWarehousesQueryDto,
  UpdateWarehouseDto,
} from './warehouse.dto';
import type { WarehouseRow } from './warehouse.repository';
import type { WarehouseService } from './warehouse.service';
import { WAREHOUSE_SERVICE } from './tokens';

/**
 * CRUD انبار — /warehouses و /warehouses/{id} دقیقاً مطابق openapi.yaml
 * (پیشوند /api/v1 توسط main.ts اضافه می‌شود). DELETE در قرارداد نیست؛
 * وضعیت با is_active تغییر می‌کند.
 *
 * مجوزها: خواندن inventory.warehouse.view، ساخت inventory.warehouse.create
 * و ویرایش inventory.warehouse.update (seed 0022). شرکت از نشست می‌آید نه query.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('warehouses')
export class WarehouseController {
  constructor(@Inject(WAREHOUSE_SERVICE) private readonly service: WarehouseService) {}

  @Get()
  @RequirePermissions('inventory.warehouse.view')
  list(
    @Query() query: ListWarehousesQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<WarehouseRow>> {
    return this.service.list(companyId, query);
  }

  @Get(':id')
  @RequirePermissions('inventory.warehouse.view')
  get(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<WarehouseRow> {
    return this.service.get(companyId, id);
  }

  @Post()
  @RequirePermissions('inventory.warehouse.create')
  create(
    @Body() dto: CreateWarehouseDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<WarehouseRow> {
    return this.service.create(companyId, dto);
  }

  @Patch(':id')
  @RequirePermissions('inventory.warehouse.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWarehouseDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<WarehouseRow> {
    return this.service.update(companyId, id, dto);
  }
}
