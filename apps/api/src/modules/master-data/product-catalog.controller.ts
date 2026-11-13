import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { CurrentUser, type AuthContext } from '../identity-rbac/auth-context.decorator';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { RequestMetaParam, type RequestMeta } from '../../common/request-meta';
import { ProductMasterService } from './product-master.service';

export class CreateFamilyDto {
  @IsString() @MaxLength(64) code: string;
  @IsString() @MaxLength(255) name: string;
}

export class CreateAttributeDefDto {
  @IsString() @MaxLength(64) code: string;
  @IsString() @MaxLength(255) title: string;
  @IsIn(['text', 'number', 'enum']) kind: string;
  @IsOptional() @IsBoolean() is_variant_axis?: boolean;
  @IsOptional() @IsBoolean() is_required?: boolean;
  @IsOptional() @IsInt() @Min(0) sort_order?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) enum_values?: string[];
}

export class AddEnumValueDto {
  @IsString() @MaxLength(255) value: string;
}

export class BundleItemDto {
  @IsUUID('4') component_product_id: string;
  @IsNumber() @Min(0.0001) qty: number;
}

export class SetBundleDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => BundleItemDto)
  items: BundleItemDto[];

  /** تأییدِ صریحِ دومرحله‌ایِ D4 (اجزای bundle حساس) */
  @IsOptional() @IsBoolean() confirm_sensitive?: boolean;
}

export class DuplicateCheckQueryDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() barcode?: string;
  @IsOptional() @IsUUID('4') product_id?: string;
}

/**
 * منابعِ کاتالوگِ Product Master: خانواده، alias، صفات/variant، روابط، bundle (D5).
 * همه مسیرها AuthGuard + PermissionsGuard؛ شرکت فقط از نشست.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller()
export class ProductCatalogController {
  constructor(private readonly service: ProductMasterService) {}

  // ---------- خانواده ----------
  @Get('product-families')
  @RequirePermissions('master.product.view')
  listFamilies(@CurrentUser('companyId') companyId: string) {
    return this.service.listFamilies(companyId);
  }

  @Post('product-families')
  @RequirePermissions('master.product.update')
  createFamily(
    @CurrentUser() user: AuthContext,
    @Body() dto: CreateFamilyDto,
    @RequestMetaParam() meta: RequestMeta,
  ) {
    return this.service.createFamily(user.companyId, dto.code, dto.name, meta, user.userId);
  }

  // ---------- alias / صفاتِ کالا ----------
  // TASK-PM-02-C7: این دو سطح به `ProductIdentityController` منتقل شدند
  // (نمای کامل alias با برخوردهای نرم، افزودن/حذف با ممیزی fail-closed،
  // نمای صفات با الزام/محور/امضا، ثبت/پاک‌کردن مقدار و تاریخچهٔ هویت).
  // این کنترلر فقط کاتالوگِ صفات (تعریف/مقدارِ مجاز) و bundle/تشخیص تکرار را نگه می‌دارد.

  // ---------- صفات ----------
  @Get('product-attributes')
  @RequirePermissions('master.product.view')
  listAttributeDefs(@CurrentUser('companyId') companyId: string) {
    return this.service.listAttributeDefs(companyId);
  }

  @Post('product-attributes')
  @RequirePermissions('master.product.update')
  createAttributeDef(
    @CurrentUser() user: AuthContext,
    @Body() dto: CreateAttributeDefDto,
    @RequestMetaParam() meta: RequestMeta,
  ) {
    return this.service.createAttributeDef(user.companyId, dto, meta, user.userId);
  }

  @Get('product-attributes/:defId/enum-values')
  @RequirePermissions('master.product.view')
  listEnumValues(@CurrentUser('companyId') companyId: string, @Param('defId') defId: string) {
    return this.service.listEnumValues(companyId, defId);
  }

  @Post('product-attributes/:defId/enum-values')
  @RequirePermissions('master.product.update')
  addEnumValue(
    @CurrentUser() user: AuthContext,
    @Param('defId') defId: string,
    @Body() dto: AddEnumValueDto,
    @RequestMetaParam() meta: RequestMeta,
  ) {
    return this.service.addAttributeEnumValue(user.companyId, defId, dto.value, meta, user.userId);
  }

  // ---------- روابط ----------
  // TASK-PM-02-C6: سطحِ روابطِ کالا به `ProductRelationsController` منتقل شد
  // (نمای کامل، تاریخچه، پیمایشِ محدود، افزودن/ویرایشِ اولویت/حذف با ممیزیِ
  // fail-closed). این کنترلر فقط منابعِ خانواده/alias/صفات/bundle را نگه می‌دارد
  // تا هیچ مسیرِ تکراری یا نسخهٔ قدیمیِ ضعیف‌تر در دسترس نماند.

  // ---------- bundle (D5 — فقط کاتالوگ) ----------
  @Get('products/:id/bundle')
  @RequirePermissions('master.product.view')
  listBundle(@CurrentUser('companyId') companyId: string, @Param('id') id: string) {
    return this.service.listBundle(companyId, id);
  }

  @Put('products/:id/bundle')
  @RequirePermissions('master.product.update')
  setBundle(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: SetBundleDto,
    @RequestMetaParam() meta: RequestMeta,
  ) {
    return this.service.setBundle(
      user.companyId,
      id,
      dto.items,
      { confirm_sensitive: dto.confirm_sensitive ?? false },
      meta,
      user.userId,
    );
  }

  // ---------- تشخیصِ تکرار (D2 — نامِ مشابه = هشدار) ----------
  @Get('products/duplicate-check')
  @RequirePermissions('master.product.view')
  duplicateCheck(@CurrentUser('companyId') companyId: string, @Query() dto: DuplicateCheckQueryDto) {
    return this.service.duplicateCheck(companyId, dto);
  }
}
