import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser, type AuthContext } from '../identity-rbac/auth-context.decorator';
import { pricingPermissionsFromSession } from '../pricing/pricing-permissions';
import { CreateOrderCreditExceptionDto, CreateOrderDto, ListOrdersQueryDto, RequestCreditExceptionDto, UpdateOrderDto } from './order.dto';
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

  /**
   * P3 — ثبتِ **پیش‌نویسِ** سفارشِ فراتر از سقف/محدودیتِ اعتبار همراه با گردشِ
   * «استثنای اعتبار» (ar.credit.exception). اگر هیچ محدودیتی وجود نداشته باشد با
   * `409 no_credit_exception_needed` پاسخ می‌دهد و گردشِ بی‌مورد ساخته نمی‌شود.
   */
  @Post('credit-exception')
  @HttpCode(201)
  @RequirePermissions('sales.order.create')
  createCreditException(
    @Body() dto: CreateOrderCreditExceptionDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser() user: AuthContext,
  ): Promise<OrderView & { approval_request_id: string }> {
    return this.service.createCreditException(companyId, dto, userId, this.pricingPermissions(user));
  }

  /** P3 — درخواستِ استثنا برای سفارشِ پیش‌نویسِ موجود (گردشِ ar.credit.exception) */
  @Post(':id/credit-exception')
  @HttpCode(201)
  @RequirePermissions('sales.order.create')
  requestCreditException(
    @Param('id') id: string,
    @Body() dto: RequestCreditExceptionDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<{ approval_request_id: string; current_step: number; expires_at: string | null; stages: number }> {
    return this.service.requestCreditException(companyId, id, dto.reason, userId);
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

  /**
   * TASK-24Z — ارسال به گردشِ تأیید. این مسیر **اتصال** می‌سازد؛ بدونِ آن
   * `POST :id/approve` هرگز نمی‌توانست موفق شود (یافتهٔ A-1).
   */
  @Post(':id/request-approval')
  @HttpCode(201)
  @RequirePermissions('sales.order.create')
  requestApproval(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.service.requestApproval(companyId, id, userId);
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
