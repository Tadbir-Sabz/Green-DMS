import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser, type AuthContext } from '../identity-rbac/auth-context.decorator';
import { pricingPermissionsFromSession } from '../pricing/pricing-permissions';
import { CreateOrderDto, ListOrdersQueryDto, UpdateOrderDto } from './order.dto';
import type { OrderRow } from './order.repository';
import type { OrderService, OrderView } from './order.service';
import { ORDER_SERVICE } from './tokens';

/**
 * سفارش فروش — /orders و /orders/{id} و تأیید مطابق openapi.yaml.
 * خواندن sales.order.view؛ ثبت sales.order.create؛ تأیید sales.order.approve.
 * شرکت/شعبه از نشست و مشتری می‌آید.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('orders')
export class OrderController {
  constructor(@Inject(ORDER_SERVICE) private readonly service: OrderService) {}

  /**
   * TASK-24F · HIGH-3 / TASK-24W: مجوزهای مؤثر بر قیمت فقط از نشست خوانده می‌شوند.
   * ساختِ مجموعه اکنون در `pricing-permissions.ts` است تا هر سه مسیر
   * (`/orders`, `/pricing/quote|simulate`, `/requests/{id}/convert`) یک قاعده داشته باشند.
   */
  private pricingPermissions(user: AuthContext) {
    return pricingPermissionsFromSession(user);
  }

  @Get()
  @RequirePermissions('sales.order.view')
  list(
    @Query() query: ListOrdersQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<OrderRow>> {
    return this.service.list(companyId, query);
  }

  @Post()
  @RequirePermissions('sales.order.create')
  create(
    @Body() dto: CreateOrderDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser() user: AuthContext,
  ): Promise<OrderView> {
    return this.service.create(companyId, dto, userId, this.pricingPermissions(user));
  }

  @Get(':id')
  @RequirePermissions('sales.order.view')
  get(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<OrderView> {
    return this.service.get(companyId, id);
  }

  @Patch(':id')
  @RequirePermissions('sales.order.create')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOrderDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser() user: AuthContext,
  ): Promise<OrderView> {
    return this.service.update(companyId, id, dto, userId, this.pricingPermissions(user));
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions('sales.order.approve')
  approve(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<OrderView> {
    // TASK-24Y: تأیید نیازمندِ هویتِ تأییدکننده است (جداسازیِ وظایف + ممیزی)
    return this.service.approve(companyId, id, userId);
  }
}
