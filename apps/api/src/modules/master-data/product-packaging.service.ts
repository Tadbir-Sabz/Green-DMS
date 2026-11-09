import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { CatalogAccess } from "./catalog-access.service";
import type { AuthContext } from "../identity-rbac/auth-context.decorator";
import type { RequestMeta } from "../../common/request-meta";
import { AUDIT_SERVICE, AuditService } from "../../common/audit.service";
import { MASTER_DATA_REPOSITORY } from "./tokens";
import { MasterDataRepository } from "./master-data.repository";
import { ProductMasterService } from "./product-master.service";
import { assertSensitiveConfirmed } from "./product-sensitivity";
import type {
  CreateUomDto,
  CreateProductPackagingDto,
  SetDefaultPackagingDto,
} from "./packaging.controller";
@Injectable()
export class ProductPackagingService {
  constructor(
    private readonly access: CatalogAccess,
    @Inject(MASTER_DATA_REPOSITORY) private readonly repo: MasterDataRepository,
    private readonly productMaster: ProductMasterService,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
  ) {}
  async createUom(user: AuthContext, dto: CreateUomDto, meta: RequestMeta) {
    return this.access.write(
      user.companyId,
      user.userId,
      "master.product.update",
      async () => {
        const created = await this.repo.createUom(user.companyId, dto);
        await this.audit.record({
          companyId: user.companyId,
          actorUserId: user.userId,
          action: "create",
          entityType: "uom",
          entityId: (created as { id?: string }).id,
          after: created,
          ip: meta.ip,
          userAgent: meta.userAgent,
          requestId: meta.requestId,
        });
        return created;
      },
    );
  }
  async createProductPackaging(
    user: AuthContext,
    dto: CreateProductPackagingDto,
    meta: RequestMeta,
  ) {
    if (
      !Number.isFinite(dto.factor_to_base) ||
      dto.factor_to_base <= 0 ||
      Math.abs(
        dto.factor_to_base * 10000 - Math.round(dto.factor_to_base * 10000),
      ) > 1e-7
    )
      throw new BadRequestException({
        code: "conversion_precision",
        message_fa: "ضریب تبدیل باید مثبت و حداکثر چهار رقم اعشار باشد.",
      });
    return this.access.write(
      user.companyId,
      user.userId,
      "master.product.update",
      async () => {
        // D4 — enforcement در مرزِ نوشتن: فاکتورِ تبدیل حساس است (همهٔ مسیرها)
        assertSensitiveConfirmed(
          [
            {
              field: "factor_to_base",
              before: null,
              after: dto.factor_to_base,
            },
          ],
          dto.confirm_sensitive ?? false,
          true,
          "تعریفِ بسته‌بندی با فاکتورِ تبدیل",
        );

        const created = await this.repo.createProductPackaging(
          user.companyId,
          dto,
        );
        if (!created) {
          throw new NotFoundException({
            code: "not_found",
            message_fa: "کالای درخواستی در این شرکت یافت نشد.",
          });
        }

        // H-1: بارکد در مدلِ جدیدِ product_barcode هم ثبت می‌شود (ستونِ legacy تا P5 می‌ماند)
        if (dto.barcode && dto.barcode.trim()) {
          await this.productMaster.addBarcode(
            user.companyId,
            dto.product_id,
            {
              barcode: dto.barcode,
              kind: "other",
              packaging_id: (created as { id?: string }).id ?? null,
              is_primary: true,
            },
            meta,
            user.userId,
          );
        }

        await this.audit.record({
          companyId: user.companyId,
          actorUserId: user.userId,
          action: "create",
          entityType: "product_packaging",
          entityId: (created as { id?: string }).id,
          after: created,
          ip: meta.ip,
          userAgent: meta.userAgent,
          requestId: meta.requestId,
        });
        return created;
      },
    );
  }
  async setDefaultPackaging(
    user: AuthContext,
    dto: SetDefaultPackagingDto,
    id: string,
    meta: RequestMeta,
  ) {
    return this.access.write(
      user.companyId,
      user.userId,
      "master.product.update",
      async () => {
        const updated = await this.repo.setDefaultPackaging(
          user.companyId,
          id,
          dto?.is_sales_default ?? true,
        );
        if (!updated) {
          throw new NotFoundException({
            code: "not_found",
            message_fa: "بسته‌بندی درخواستی در این شرکت یافت نشد.",
          });
        }
        await this.audit.record({
          companyId: user.companyId,
          actorUserId: user.userId,
          action: "update",
          entityType: "product_packaging",
          entityId: id,
          after: { is_sales_default: dto?.is_sales_default ?? true },
          ip: meta.ip,
          userAgent: meta.userAgent,
          requestId: meta.requestId,
        });
        return updated;
      },
    );
  }
}
