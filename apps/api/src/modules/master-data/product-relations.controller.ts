import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { CurrentUser, type AuthContext } from '../identity-rbac/auth-context.decorator';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { RequestMetaParam, type RequestMeta } from '../../common/request-meta';
import { DomainBoundaryGuard } from './domain-boundary.guard';
import { ProductRelationsService } from './product-relations.service';

/**
 * TASK-PM-02-C6 — سطحِ مرکزیِ روابطِ کالا‑به‑کالا.
 *
 * فقط دو نوعِ مصوبِ `0046` (`substitute`, `complement`) با همان مجوزهای موجود
 * (`master.product.view` / `master.product.update`) و همان کنترل‌های D4/مرزِ دامنه.
 * بدنه/کوئری خام به سرویس داده می‌شود تا فیلدهای شرکت/هویت/مجوز/ممیزی/دامنه و
 * فیلدهای تعریف‌نشده صریحاً ۴۰۰ بگیرند (نه حذفِ بی‌صدا).
 *
 * ثبت این کنترلر **پیش از** `ProductController` تضمین می‌کند مسیرهای
 * `/products/:id/relations` با `:id` عمومی برخورد نکنند.
 */
@UseGuards(AuthGuard, PermissionsGuard, DomainBoundaryGuard)
@Controller()
export class ProductRelationsController {
  constructor(private readonly service: ProductRelationsService) {}

  @Get('products/:id/relations')
  @RequirePermissions('master.product.view')
  overview(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    return this.service.overview(user, id, query);
  }

  @Get('products/:id/relations/history')
  @RequirePermissions('master.product.view')
  history(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return this.service.history(user, id);
  }

  @Get('products/:id/relations/graph')
  @RequirePermissions('master.product.view')
  graph(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    return this.service.graph(user, id, query);
  }

  @Post('products/:id/relations')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('master.product.update')
  add(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() body: unknown,
    @RequestMetaParam() meta: RequestMeta,
  ) {
    return this.service.add(user, id, body, meta);
  }

  @Patch('products/:id/relations/:relationId')
  @RequirePermissions('master.product.update')
  updatePriority(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Param('relationId') relationId: string,
    @Body() body: unknown,
    @RequestMetaParam() meta: RequestMeta,
  ) {
    return this.service.updatePriority(user, id, relationId, body, meta);
  }

  @Delete('products/:id/relations/:relationId')
  @RequirePermissions('master.product.update')
  remove(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Param('relationId') relationId: string,
    @RequestMetaParam() meta: RequestMeta,
  ) {
    return this.service.remove(user, id, relationId, meta);
  }
}
