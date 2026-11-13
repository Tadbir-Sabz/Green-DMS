import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  IsBoolean,
  IsDefined,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { CurrentUser, type AuthContext } from '../identity-rbac/auth-context.decorator';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { RequestMetaParam, type RequestMeta } from '../../common/request-meta';
import { DomainBoundaryGuard } from './domain-boundary.guard';
import { ReferenceDataService } from './reference-data.service';
import {
  BRAND_WRITABLE_KEYS,
  CATEGORY_WRITABLE_KEYS,
  UNIT_WRITABLE_KEYS,
  unknownQueryKeys,
} from './reference-data.rules';

/**
 * مدیریت دادههای مرجع کالا (TASK-PM-02-C2) — مسیر تازهٔ `/reference-data/*`.
 *
 * چرا مسیر تازه و نه تغییر مسیرهای قدیمی: `GET /units`، `GET /product-categories`،
 * `POST /product-categories` و `GET|POST /packaging/uom` همان قراردادهای پشتیبان
 * فرم کالا/بستهبندیاند و دستنخورده میمانند (عدم شکست کلاینتها). این کنترلر
 * **همان جداول** ۰۰۰۵ را با قابلیت کامل CRUD/سلسلهمراتب/ممیزی در اختیار میگذارد؛
 * هیچ جدول، مجوز، نقش یا لایهٔ دادهٔ موازی ساخته نشد.
 *
 * `DomainBoundaryGuard` (B2) روی همهٔ مسیرها: کلید/هدر دامنهای ۴۰۰ میگیرد.
 * پارامترهای ناشناختهٔ query (سرویس) و فیلدهای ناشناختهٔ بدنه (کنترلر، پیش
 * از اثر `whitelist` سراسری) بیصدا حذف نمیشوند و ۴۰۰ صریح و فارسی میگیرند.
 * مجوزها صرفاً خانوادهٔ مصوب §F: خواندن master.product.view، نوشتن
 * master.product.update؛ هیچ مجوز تازهای seed نشد.
 */

interface RawRequest {
  query?: Record<string, unknown>;
  body?: unknown;
}

export class CreateBrandDto {
  @IsDefined() @IsString() @IsNotEmpty() @MaxLength(64) code: string;
  @IsDefined() @IsString() @IsNotEmpty() @MaxLength(255) name: string;
  @IsOptional() @IsString() @MaxLength(255) name_latin?: string | null;
  @IsOptional() @IsBoolean() is_active?: boolean;
}

export class UpdateBrandDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(64) code?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(255) name?: string;
  @IsOptional() @IsString() @MaxLength(255) name_latin?: string | null;
  @IsOptional() @IsBoolean() is_active?: boolean;
}

export class CreateUnitDto {
  @IsDefined() @IsString() @IsNotEmpty() @MaxLength(16) code: string;
  @IsDefined() @IsString() @IsNotEmpty() @MaxLength(64) title: string;
  @IsOptional() @IsString() @MaxLength(16) symbol?: string | null;
  @IsOptional() @IsString() @MaxLength(64) title_latin?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(4) decimal_places?: number;
  @IsOptional() @IsBoolean() is_active?: boolean;
}

export class UpdateUnitDto {
  /** کد واحد تغییرناپذیر است؛ ارسال آن خطای صریح و فارسی میگیرد (نه حذف بیصدا). */
  @IsOptional() @IsString() @MaxLength(16) code?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(64) title?: string;
  @IsOptional() @IsString() @MaxLength(16) symbol?: string | null;
  @IsOptional() @IsString() @MaxLength(64) title_latin?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(4) decimal_places?: number;
  @IsOptional() @IsBoolean() is_active?: boolean;
}

export class CreateCategoryDto {
  @IsDefined() @IsString() @IsNotEmpty() @MaxLength(64) code: string;
  @IsDefined() @IsString() @IsNotEmpty() @MaxLength(255) name: string;
  @IsOptional() @IsString() @MaxLength(255) name_latin?: string | null;
  @IsOptional() @IsUUID('4') parent_id?: string | null;
  @IsOptional() @IsBoolean() is_active?: boolean;
}

export class UpdateCategoryDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(64) code?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(255) name?: string;
  @IsOptional() @IsString() @MaxLength(255) name_latin?: string | null;
  /** null = انتقال به ریشه؛ IsOptional اجازهٔ null میدهد و سرویس آن را تشخیص میدهد. */
  @IsOptional() @IsUUID('4') parent_id?: string | null;
  @IsOptional() @IsBoolean() is_active?: boolean;
}

@UseGuards(AuthGuard, PermissionsGuard)
@Controller('reference-data')
export class ReferenceDataController {
  constructor(private readonly service: ReferenceDataService) {}

  private query(req: RawRequest): Record<string, unknown> {
    return req.query ?? {};
  }

  /** بدنهٔ خام (پیش از ValidationPipe) — فیلد ناشناخته نباید بیصدا حذف شود. */
  private assertBody(req: RawRequest, allowed: readonly string[]): void {
    const raw = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : {};
    const keys = unknownQueryKeys(raw, allowed);
    if (keys.length > 0) {
      throw new BadRequestException({
        code: 'unsupported_request_field',
        message_fa: `فیلد(های) پشتیبانی\u200cنشده: ${keys.join('، ')}.`,
        details: { fields: keys },
      });
    }
  }

  // ───────────────────────── تاریخچهٔ ممیزی ─────────────────────────

  @Get('history')
  @RequirePermissions('master.product.view')
  @UseGuards(DomainBoundaryGuard)
  history(@CurrentUser() user: AuthContext, @Req() req: RawRequest) {
    return this.service.history(user, this.query(req));
  }

  // ───────────────────────────── برند ───────────────────────────────

  @Get('brands')
  @RequirePermissions('master.product.view')
  @UseGuards(DomainBoundaryGuard)
  listBrands(@CurrentUser() user: AuthContext, @Req() req: RawRequest) {
    return this.service.listBrands(user, this.query(req));
  }

  @Post('brands')
  @RequirePermissions('master.product.update')
  @UseGuards(DomainBoundaryGuard)
  @HttpCode(HttpStatus.CREATED)
  createBrand(
    @CurrentUser() user: AuthContext,
    @Body() dto: CreateBrandDto,
    @Req() req: RawRequest,
    @RequestMetaParam() meta: RequestMeta,
  ) {
    this.assertBody(req, BRAND_WRITABLE_KEYS);
    return this.service.createBrand(user, dto, meta);
  }

  @Get('brands/:id')
  @RequirePermissions('master.product.view')
  @UseGuards(DomainBoundaryGuard)
  getBrand(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return this.service.getBrand(user, id);
  }

  @Patch('brands/:id')
  @RequirePermissions('master.product.update')
  @UseGuards(DomainBoundaryGuard)
  updateBrand(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateBrandDto,
    @Req() req: RawRequest,
    @RequestMetaParam() meta: RequestMeta,
  ) {
    this.assertBody(req, BRAND_WRITABLE_KEYS);
    return this.service.updateBrand(user, id, dto, meta);
  }

  @Delete('brands/:id')
  @RequirePermissions('master.product.update')
  @UseGuards(DomainBoundaryGuard)
  deleteBrand(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @RequestMetaParam() meta: RequestMeta,
  ) {
    return this.service.deleteBrand(user, id, meta);
  }

  // ───────────────────────────── واحد ───────────────────────────────

  @Get('units')
  @RequirePermissions('master.product.view')
  @UseGuards(DomainBoundaryGuard)
  listUnits(@CurrentUser() user: AuthContext, @Req() req: RawRequest) {
    return this.service.listUnits(user, this.query(req));
  }

  @Post('units')
  @RequirePermissions('master.product.update')
  @UseGuards(DomainBoundaryGuard)
  @HttpCode(HttpStatus.CREATED)
  createUnit(
    @CurrentUser() user: AuthContext,
    @Body() dto: CreateUnitDto,
    @Req() req: RawRequest,
    @RequestMetaParam() meta: RequestMeta,
  ) {
    this.assertBody(req, UNIT_WRITABLE_KEYS);
    return this.service.createUnit(user, dto, meta);
  }

  @Get('units/:id')
  @RequirePermissions('master.product.view')
  @UseGuards(DomainBoundaryGuard)
  getUnit(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return this.service.getUnit(user, id);
  }

  @Patch('units/:id')
  @RequirePermissions('master.product.update')
  @UseGuards(DomainBoundaryGuard)
  updateUnit(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateUnitDto,
    @Req() req: RawRequest,
    @RequestMetaParam() meta: RequestMeta,
  ) {
    this.assertBody(req, UNIT_WRITABLE_KEYS);
    return this.service.updateUnit(user, id, dto, meta);
  }

  @Delete('units/:id')
  @RequirePermissions('master.product.update')
  @UseGuards(DomainBoundaryGuard)
  deleteUnit(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @RequestMetaParam() meta: RequestMeta,
  ) {
    return this.service.deleteUnit(user, id, meta);
  }

  // ─────────────────────────── دستهبندی ─────────────────────────────

  @Get('categories')
  @RequirePermissions('master.product.view')
  @UseGuards(DomainBoundaryGuard)
  listCategories(@CurrentUser() user: AuthContext, @Req() req: RawRequest) {
    return this.service.listCategories(user, this.query(req));
  }

  @Post('categories')
  @RequirePermissions('master.product.update')
  @UseGuards(DomainBoundaryGuard)
  @HttpCode(HttpStatus.CREATED)
  createCategory(
    @CurrentUser() user: AuthContext,
    @Body() dto: CreateCategoryDto,
    @Req() req: RawRequest,
    @RequestMetaParam() meta: RequestMeta,
  ) {
    this.assertBody(req, CATEGORY_WRITABLE_KEYS);
    return this.service.createCategory(user, dto, meta);
  }

  @Get('categories/:id')
  @RequirePermissions('master.product.view')
  @UseGuards(DomainBoundaryGuard)
  getCategory(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return this.service.getCategory(user, id);
  }

  @Patch('categories/:id')
  @RequirePermissions('master.product.update')
  @UseGuards(DomainBoundaryGuard)
  updateCategory(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @Req() req: RawRequest,
    @RequestMetaParam() meta: RequestMeta,
  ) {
    this.assertBody(req, CATEGORY_WRITABLE_KEYS);
    return this.service.updateCategory(user, id, dto, meta);
  }

  /** `?reassign_to=<uuid>` انتساب ایمن وابستگان پیش از حذف (در همان تراکنش). */
  @Delete('categories/:id')
  @RequirePermissions('master.product.update')
  @UseGuards(DomainBoundaryGuard)
  deleteCategory(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Req() req: RawRequest,
    @RequestMetaParam() meta: RequestMeta,
  ) {
    return this.service.deleteCategory(user, id, this.query(req), meta);
  }
}
