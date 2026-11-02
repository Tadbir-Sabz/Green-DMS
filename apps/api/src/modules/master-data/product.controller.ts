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
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';

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

  @Get()
  @RequirePermissions('master.product.view')
  list(
    @Query() query: ListProductsQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<ProductRow>> {
    return this.service.list(companyId, query);
  }

  @Get(':id')
  @RequirePermissions('master.product.view')
  get(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<ProductRow> {
    return this.service.get(companyId, id);
  }

  @Post()
  @RequirePermissions('master.product.create')
  create(
    @Body() dto: CreateProductDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<ProductRow> {
    return this.service.create(companyId, dto);
  }

  @Patch(':id')
  @RequirePermissions('master.product.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<ProductRow> {
    return this.service.update(companyId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('master.product.update')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<void> {
    await this.service.remove(companyId, id);
  }
}
