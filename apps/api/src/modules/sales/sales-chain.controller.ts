import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import type { OrderView } from './order.service';
// این DTOها باید «value import» باشند نه `import type`: NestJS نوع پارامترِ
// @Body/@Query را از metadata بازتاب‌شده می‌خواند و `import type` در زمان کامپایل
// پاک می‌شود، پس ValidationPipe بی‌صدا برای این سه کنترلر (requests/invoices/
// deliveries) نادیده گرفته می‌شد. Row/Service/Page فقط نوع‌اند و type می‌مانند.
import { ListInvoicesQueryDto, CreateInvoiceDto } from './invoice.dto';
import { CreateRequestDto, ListRequestsQueryDto, UpdateRequestDto } from './request.dto';
import { ListDeliveriesQueryDto, UpdateDeliveryDto } from './delivery.dto';
import type {
  DeliveryRow,
  InvoiceRow,
  RequestRow,
} from './sales-chain.repository';
import type { DeliveryService, InvoiceService, RequestService } from './sales-chain.service';
import {
  DELIVERY_SERVICE,
  INVOICE_SERVICE,
  REQUEST_SERVICE,
} from './tokens';

/**
 * درخواست‌های مشتری — /requests، /requests/{id}، /requests/{id}/convert.
 * ثبت با sales.request.create، مشاهده با sales.request.view، تبدیل با sales.request.convert.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('requests')
export class RequestController {
  constructor(@Inject(REQUEST_SERVICE) private readonly service: RequestService) {}

  @Get()
  @RequirePermissions('sales.request.view')
  list(
    @Query() query: ListRequestsQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<RequestRow>> {
    return this.service.list(companyId, query);
  }

  @Post()
  @RequirePermissions('sales.request.create')
  create(
    @Body() dto: CreateRequestDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<RequestRow> {
    return this.service.create(companyId, dto, userId) as Promise<RequestRow>;
  }

  @Get(':id')
  @RequirePermissions('sales.request.view')
  get(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<RequestRow> {
    return this.service.get(companyId, id) as Promise<RequestRow>;
  }

  @Patch(':id')
  @RequirePermissions('sales.request.create')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRequestDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<RequestRow> {
    return this.service.update(companyId, id, dto) as Promise<RequestRow>;
  }

  @Post(':id/convert')
  @HttpCode(201)
  @RequirePermissions('sales.request.convert')
  convert(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<OrderView> {
    return this.service.convert(companyId, id);
  }
}

/**
 * فاکتورهای فروش — /invoices، /invoices/{id}.
 * صدور با sales.invoice.create، مشاهده با sales.invoice.view.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('invoices')
export class InvoiceController {
  constructor(@Inject(INVOICE_SERVICE) private readonly service: InvoiceService) {}

  @Get()
  @RequirePermissions('sales.invoice.view')
  list(
    @Query() query: ListInvoicesQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<InvoiceRow>> {
    return this.service.list(companyId, query);
  }

  @Post()
  @RequirePermissions('sales.invoice.create')
  create(
    @Body() dto: CreateInvoiceDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<InvoiceRow> {
    return this.service.create(companyId, dto, userId) as Promise<InvoiceRow>;
  }

  @Get(':id')
  @RequirePermissions('sales.invoice.view')
  get(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<InvoiceRow> {
    return this.service.get(companyId, id) as Promise<InvoiceRow>;
  }
}

/**
 * پیگیری تحویل — /deliveries، /deliveries/{id}.
 * مشاهده با sales.delivery.view، ثبت تحویل/POD با sales.delivery.update.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('deliveries')
export class DeliveryController {
  constructor(@Inject(DELIVERY_SERVICE) private readonly service: DeliveryService) {}

  @Get()
  @RequirePermissions('sales.delivery.view')
  list(
    @Query() query: ListDeliveriesQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<DeliveryRow>> {
    return this.service.list(companyId, query);
  }

  @Get(':id')
  @RequirePermissions('sales.delivery.view')
  get(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<DeliveryRow> {
    return this.service.get(companyId, id);
  }

  @Patch(':id')
  @RequirePermissions('sales.delivery.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<DeliveryRow> {
    return this.service.update(companyId, id, dto);
  }
}
