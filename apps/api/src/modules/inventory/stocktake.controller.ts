import {
  Body,
  Controller,
  Get,
  HttpCode,
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
import { CreateStockTakeDto, ListStocktakesQueryDto, UpdateStockTakeDto } from './stock.dto';
import type { StockTakeView, StocktakeService } from './stocktake.service';
import { STOCKTAKE_SERVICE } from './tokens';

/**
 * چرخه انبارگردانی — /stocktakes و زیرمسیرهایش دقیقاً مطابق openapi.yaml.
 * خواندن inventory.stock.view؛ شروع/شمارش inventory.count.create؛ ثبت نهایی inventory.count.approve.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('stocktakes')
export class StocktakeController {
  constructor(@Inject(STOCKTAKE_SERVICE) private readonly service: StocktakeService) {}

  @Get()
  @RequirePermissions('inventory.stock.view')
  list(
    @Query() query: ListStocktakesQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<StockTakeView>> {
    return this.service.list(companyId, query);
  }

  @Post()
  @RequirePermissions('inventory.count.create')
  create(
    @Body() dto: CreateStockTakeDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<StockTakeView> {
    return this.service.create(companyId, dto);
  }

  @Get(':id')
  @RequirePermissions('inventory.stock.view')
  get(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<StockTakeView> {
    return this.service.get(companyId, id);
  }

  @Patch(':id')
  @RequirePermissions('inventory.count.create')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStockTakeDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<StockTakeView> {
    return this.service.update(companyId, id, dto);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermissions('inventory.count.approve')
  submit(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<StockTakeView> {
    return this.service.submit(companyId, id, userId);
  }
}
