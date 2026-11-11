import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Page } from '@dms/contracts';
import type { ProductRow } from './product.repository';
import type { ProductService } from './product.service';
import { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from './product.dto';
import { PRODUCT_SERVICE } from './tokens';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { CurrentUser, type AuthContext } from '../identity-rbac/auth-context.decorator';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { RequestMetaParam, type RequestMeta } from '../../common/request-meta';
import { DomainBoundaryGuard } from './domain-boundary.guard';

/**
 * CRUD کالا — GET/POST /products و GET/PATCH/DELETE /products/{id}
 * دقیقاً مطابق openapi.yaml (پیشوند /api/v1 توسط main.ts اضافه می‌شود).
 *
 * احراز هویت و مجوز: همه مسیرها AuthGuard دارند و هر کدام مجوز خودش را
 * می‌خواهد (PermissionsGuard). شرکت از نشست می‌آید نه از query — بنابراین
 * داده چندشرکتی با توکن کاربر دیگر قابل دسترسی نیست.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('products')
export class ProductController {
  constructor(@Inject(PRODUCT_SERVICE) private readonly service: ProductService) {}

  // TASK-PM-02-B2 — fail-closed parity on central READ surfaces.
  // `validationPipeOptions` sets `whitelist: true` (not `forbidNonWhitelisted`),
  // so an unknown query key such as `?available=true` or `?domain_id=…` would
  // otherwise be *silently stripped*: the client receives an unchanged central
  // page while believing it asked for domain-scoped data. The guard makes this
  // an explicit 400 before any pipe/whitelist runs. It grants no domain identity,
  // membership, availability or authority; domain-context routes (which read
  // `x-domain-id` and fail closed via DomainCatalogGate) are deliberately NOT
  // guarded here.
  @Get()
  @RequirePermissions('master.product.view')
  @UseGuards(DomainBoundaryGuard)
  list(
    @Query() query: ListProductsQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<ProductRow>> {
    return this.service.list(companyId, query);
  }

  @Get(':id')
  @RequirePermissions('master.product.view')
  @UseGuards(DomainBoundaryGuard)
  get(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<ProductRow> {
    return this.service.get(companyId, id);
  }

  @Post()
  @RequirePermissions('master.product.create')
  @UseGuards(DomainBoundaryGuard)
  create(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: AuthContext,
    @RequestMetaParam() meta: RequestMeta,
  ): Promise<ProductRow> {
    return this.service.create(user.companyId, dto, user, meta);
  }

  @Patch(':id')
  @RequirePermissions('master.product.update')
  @UseGuards(DomainBoundaryGuard)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthContext,
    @RequestMetaParam() meta: RequestMeta,
  ): Promise<ProductRow> {
    return this.service.update(user.companyId, id, dto, user, meta);
  }

  @Delete(':id')
  @RequirePermissions('master.product.update')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(DomainBoundaryGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthContext,
    @RequestMetaParam() meta: RequestMeta,
  ): Promise<void> {
    await this.service.remove(user.companyId, id, user, meta);
  }
}
