import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { CurrentUser, type AuthContext } from '../identity-rbac/auth-context.decorator';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { RequestMetaParam, type RequestMeta } from '../../common/request-meta';
import { DomainBoundaryGuard } from './domain-boundary.guard';
import { ProductDomainScopeService } from './product-domain-scope.service';

/**
 * GET /api/v1/products/{id}/domain-scope — نمای خواندنی «مرز مرکزی/دامنهای».
 *
 * برخلاف مسیرهای fail-closed عضویت دامنه (503)، این مسیر واقعیتِ موجود و
 * مصوب را برمیگرداند: یک کالای مرکزی با چرخهٔ حیات مرکزی، و نبودِ هرگونه
 * هویت/عضویت/دسترسپذیری دامنهای. این پاسخ جایگزین عضویت دامنه نیست و نباید
 * بهعنوان «کالا در هیچ دامنهای عرضه نمیشود» خوانده شود؛ صرفاً «تعییننشده»
 * است. زمینهٔ دامنه توسط DomainBoundaryGuard صریحاً رد میشود تا کسی گمان
 * نکند هدر `x-domain-id` این نمای مرکزی را دامنهای کرده است.
 */
@UseGuards(AuthGuard, PermissionsGuard, DomainBoundaryGuard)
@Controller('products')
export class ProductDomainScopeController {
  constructor(private readonly service: ProductDomainScopeService) {}

  @Get(':id/domain-scope')
  @RequirePermissions('master.product.view')
  getScope(
    @Param('id') id: string,
    @CurrentUser() user: AuthContext,
    @RequestMetaParam() meta: RequestMeta,
  ) {
    return this.service.getScope(user, id, meta);
  }
}
