import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { ModuleInfo } from '../../common/module-info';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import { PortalAuthGuard } from './portal-auth.guard';
import { PortalUser } from './portal-context.decorator';
import { PORTAL_SERVICE } from './tokens';
import type { PortalRequestMeta, PortalService } from './portal.service';
import {
  CreatePortalUserDto,
  PortalLoginDto,
  PortalRefreshDto,
  type PortalBalance,
  type PortalIdentity,
  type PortalInvoice,
  type PortalMe,
  type PortalOrder,
  type PortalSessionResponse,
} from './portal.dto';

interface ReqLike {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

const metaOf = (req: ReqLike): PortalRequestMeta => {
  const ua = req.headers?.['user-agent'];
  const xff = req.headers?.['x-forwarded-for'];
  return {
    userAgent: typeof ua === 'string' ? ua : null,
    ip:
      req.ip ??
      (typeof xff === 'string' ? xff.split(',')[0].trim() : null),
  };
};

/**
 * پورتال B2B مشتریان — openapi › /portal/*.
 * سه دسته مسیر با گاردهای متفاوت (در سطحِ متد، نه کلاس):
 *  • عمومی: ورود و refresh (بدونِ گارد).
 *  • PortalAuthGuard: دادهٔ خودِ مشتری (me/invoices/orders/balance) و logout.
 *  • AuthGuard+PermissionsGuard کارکنان: ساختِ حسابِ پورتال برای مشتری و info.
 * company_id/customer_id از نشستِ پورتال می‌آید و هرگز از کلاینت پذیرفته نمی‌شود.
 */
@Controller('portal')
export class PortalController {
  constructor(@Inject(PORTAL_SERVICE) private readonly service: PortalService) {}

  // ---------------- عمومی ----------------

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: PortalLoginDto, @Req() req: ReqLike): Promise<PortalSessionResponse> {
    return this.service.signIn(dto.email, dto.password, metaOf(req));
  }

  @Post('auth/refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: PortalRefreshDto, @Req() req: ReqLike): Promise<PortalSessionResponse> {
    return this.service.refresh(dto.refresh_token, metaOf(req));
  }

  // ---------------- محافظت‌شده با گاردِ پورتال ----------------

  @UseGuards(PortalAuthGuard)
  @Post('auth/logout')
  @HttpCode(HttpStatus.OK)
  logout(@PortalUser('sessionId') sessionId: string): Promise<{ revoked: boolean }> {
    return this.service.logout(sessionId);
  }

  @UseGuards(PortalAuthGuard)
  @Get('me')
  me(
    @PortalUser('companyId') companyId: string,
    @PortalUser('portalUserId') portalUserId: string,
  ): Promise<PortalMe> {
    return this.service.me(companyId, portalUserId);
  }

  @UseGuards(PortalAuthGuard)
  @Get('invoices')
  invoices(
    @PortalUser('companyId') companyId: string,
    @PortalUser('customerId') customerId: string,
  ): Promise<PortalInvoice[]> {
    return this.service.invoices(companyId, customerId);
  }

  @UseGuards(PortalAuthGuard)
  @Get('orders')
  orders(
    @PortalUser('companyId') companyId: string,
    @PortalUser('customerId') customerId: string,
  ): Promise<PortalOrder[]> {
    return this.service.orders(companyId, customerId);
  }

  @UseGuards(PortalAuthGuard)
  @Get('balance')
  balance(
    @PortalUser('companyId') companyId: string,
    @PortalUser('customerId') customerId: string,
  ): Promise<PortalBalance> {
    return this.service.balance(companyId, customerId);
  }

  // ---------------- محافظت‌شده با گاردِ کارکنان ----------------

  @UseGuards(AuthGuard, PermissionsGuard)
  @Post('users')
  @RequirePermissions('master.customer.update')
  @HttpCode(HttpStatus.CREATED)
  createPortalUser(
    @Body() dto: CreatePortalUserDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<PortalIdentity> {
    return this.service.createPortalUser(dto, companyId);
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @Get()
  @RequirePermissions('master.customer.view')
  info(): ModuleInfo {
    return {
      module: 'portal',
      title: 'پورتال مشتری آنلاین',
      resources: ['auth', 'me', 'invoices', 'orders', 'balance', 'users'],
      status: 'implemented',
    };
  }
}
