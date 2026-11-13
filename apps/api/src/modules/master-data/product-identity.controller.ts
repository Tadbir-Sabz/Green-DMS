import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { CurrentUser, type AuthContext } from '../identity-rbac/auth-context.decorator';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { RequestMetaParam, type RequestMeta } from '../../common/request-meta';
import { DomainBoundaryGuard } from './domain-boundary.guard';
import { ProductIdentityService } from './product-identity.service';

/**
 * TASK-PM-02-C7 — هویتِ کالا: نام‌های جایگزین (alias) و مقادیرِ صفات (attribute).
 *
 * مجوزها همان مجوزهای موجود کاتالوگ‌اند: `master.product.view` برای خواندن و
 * `master.product.update` برای نوشتن. `DomainBoundaryGuard` روی کلِ سطح نصب است تا
 * `x-domain-id`/`domain_id` صریحاً ۴۰۰ بگیرند (ویژگی دامنه‌ای خارج از دامنه است).
 *
 * بدنه/کوئریِ خام به سرویس داده می‌شود تا فیلدهای شرکت/هویت/مجوز/ممیزی/دامنه و
 * فیلدهای تعریف‌نشده ۴۰۰ صریح بگیرند، نه حذف بی‌صدا.
 *
 * مسیرها عیناً همان مسیرهای موجودِ قرارداد هستند؛ C7 فقط سطحِ خواندن/نوشتن را کامل
 * می‌کند و هیچ مسیر تکراری نمی‌سازد.
 */
@UseGuards(AuthGuard, PermissionsGuard, DomainBoundaryGuard)
@Controller()
export class ProductIdentityController {
  constructor(private readonly service: ProductIdentityService) {}

  // ------------------------------------------------------------- alias

  @Get('products/:id/aliases')
  @RequirePermissions('master.product.view')
  listAliases(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    return this.service.listAliases(user, id, query);
  }

  @Post('products/:id/aliases')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('master.product.update')
  addAlias(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() body: unknown,
    @RequestMetaParam() meta: RequestMeta,
  ) {
    return this.service.addAlias(user, id, body, meta);
  }

  @Delete('products/:id/aliases/:aliasId')
  @RequirePermissions('master.product.update')
  removeAlias(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Param('aliasId') aliasId: string,
    @RequestMetaParam() meta: RequestMeta,
  ) {
    return this.service.removeAlias(user, id, aliasId, meta);
  }

  // ------------------------------------------------------- attribute values

  @Get('products/:id/attributes')
  @RequirePermissions('master.product.view')
  listAttributes(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    return this.service.listAttributes(user, id, query);
  }

  @Put('products/:id/attributes')
  @RequirePermissions('master.product.update')
  setAttributes(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() body: unknown,
    @RequestMetaParam() meta: RequestMeta,
  ) {
    return this.service.setAttributeValues(user, id, body, meta);
  }

  @Get('products/:id/identity/history')
  @RequirePermissions('master.product.view')
  history(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return this.service.identityHistory(user, id);
  }
}
