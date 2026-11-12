import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { CurrentUser, type AuthContext } from '../identity-rbac/auth-context.decorator';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { RequestMetaParam, type RequestMeta } from '../../common/request-meta';
import { DomainBoundaryGuard } from './domain-boundary.guard';
import { ProductLifecycleService } from './product-lifecycle.service';

/**
 * TASK-PM-02-C5 — نمای خواندنی و گذار اختصاصی چرخهٔ حیات مرکزی کالا.
 *
 * وضعیت/مجوز/تأیید D4 در یک نگهبان واحد متمرکز میشود: `active↔blocked` همان
 * رفتار شاهدپذیر PATCH را حفظ میکند و گذارهای شامل `discontinued` عمداً BLOCKEDاند.
 * `DomainBoundaryGuard`
 * زمینهٔ دامنه را پیش از حذف بیصدای whitelist رد میکند. بدنه/کوئری خام به
 * سرویس داده میشود تا فیلدهای مالکیت، هویت، مجوز و ممیزی نیز صریحاً رد شوند.
 */
@UseGuards(AuthGuard, PermissionsGuard, DomainBoundaryGuard)
@Controller('products')
export class ProductLifecycleController {
  constructor(private readonly service: ProductLifecycleService) {}

  @Get(':id/lifecycle')
  @RequirePermissions('master.product.view')
  read(
    @Param('id') id: string,
    @Query() query: unknown,
    @CurrentUser() user: AuthContext,
  ) {
    return this.service.read(user, id, query);
  }

  @Post(':id/lifecycle/transitions')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('master.product.update')
  transition(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthContext,
    @RequestMetaParam() meta: RequestMeta,
  ) {
    return this.service.transition(user, id, body, meta);
  }
}
