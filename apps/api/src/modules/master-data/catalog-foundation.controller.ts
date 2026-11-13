import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsIn,
  IsUUID,
  Max,
  MaxLength,
  Min,
  IsBoolean,
  isUUID,
} from "class-validator";
import { Type } from "class-transformer";
import type { Pool } from "pg";
import { PG_POOL } from "../../database/database.module";
import { AuthGuard } from "../identity-rbac/auth.guard";
import { PermissionsGuard } from "../identity-rbac/permissions.guard";
import { RequirePermissions } from "../identity-rbac/require-permissions.decorator";
import {
  CurrentUser,
  type AuthContext,
} from "../identity-rbac/auth-context.decorator";
import { CatalogAccess } from "./catalog-access.service";
import { DomainCatalogGate } from "./domain-catalog.contract";

export class CatalogLabelDto {
  @IsString() @IsNotEmpty() @MaxLength(64) code: string;
  @IsString() @IsNotEmpty() @MaxLength(255) name: string;
}
export class FamilyNameDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(255) name?: string;
  @IsOptional() @IsBoolean() is_active?: boolean;
}
export class HistoryQueryDto {
  @IsOptional() @IsString() @MaxLength(24) before?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit: number =
    30;
}

/** Only central Product Master evidence from migration 0060; never domain membership. */
export const CENTRAL_CATALOG_HISTORY_ENTITY_TYPES = [
  "product",
  "product_category",
  "product_family",
  "product_alias",
  "product_attribute_def",
  "product_attribute_enum_value",
  "product_attribute_value",
  "product_relation",
  "product_bundle",
  "product_barcode",
  "product_packaging",
] as const;

export type CentralCatalogHistoryEntityType =
  (typeof CENTRAL_CATALOG_HISTORY_ENTITY_TYPES)[number];

export class CatalogHistoryQueryDto {
  @IsOptional() @IsIn(CENTRAL_CATALOG_HISTORY_ENTITY_TYPES)
  entity_type?: CentralCatalogHistoryEntityType;

  @IsOptional() @IsUUID("4") product_id?: string;

  @IsOptional() @IsString() @MaxLength(24) before?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit: number =
    30;
}

type HistoryWindowQuery = { before?: string; limit?: number };

@Injectable()
export class CatalogFoundationService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly access: CatalogAccess,
    private readonly domainGate: DomainCatalogGate,
  ) {}

  private historyWindow(q: HistoryWindowQuery) {
    if (q.before && !/^[0-9]{1,20}$/.test(q.before))
      throw new BadRequestException({
        code: "invalid_cursor",
        message_fa: "نشانگر تاریخچه معتبر نیست.",
      });
    return {
      before: q.before ?? null,
      limit: Math.min(100, Math.max(1, q.limit ?? 30)),
    };
  }
  async createCategory(user: AuthContext, dto: CatalogLabelDto) {
    return this.access.write(
      user.companyId,
      user.userId,
      "master.product.update",
      async () => {
        if (
          typeof dto.code !== 'string' || typeof dto.name !== 'string' || !dto.code.trim() ||
          !dto.name?.trim() ||
          dto.code.length > 64 ||
          dto.name.length > 255
        )
          throw new BadRequestException({
            code: "invalid_catalog_label",
            message_fa: "کد و عنوان معتبر الزامی است.",
          });
        try {
          const result = await this.pool.query(
            "insert into product_category(company_id,code,name) values($1,$2,$3) returning id,code,name",
            [user.companyId, dto.code.trim(), dto.name.trim()],
          );
          return result.rows[0];
        } catch (e) {
          if ((e as { code?: string }).code === "23505")
            throw new ConflictException({
              code: "duplicate_category",
              message_fa: "کد گروه قبلاً ثبت شده است.",
            });
          throw e;
        }
      },
    );
  }
  async renameFamily(user: AuthContext, id: string, dto: FamilyNameDto) {
    if (!isUUID(id, "4"))
      throw new BadRequestException({
        code: "invalid_id",
        message_fa: "شناسه معتبر نیست.",
      });
    return this.access.write(
      user.companyId,
      user.userId,
      "master.product.update",
      async () => {
        if ((!dto.name && dto.is_active === undefined) || (dto.name !== undefined && (typeof dto.name !== 'string' || !dto.name.trim() || dto.name.length > 255)) || (dto.is_active !== undefined && typeof dto.is_active !== 'boolean'))
          throw new BadRequestException({
            code: "invalid_family_name",
            message_fa: "نام خانواده معتبر نیست.",
          });
        const r = await this.pool.query(
          "update product_family set name=coalesce($3,name),is_active=coalesce($4,is_active),updated_at=now() where id=$1 and company_id=$2 returning id,code,name,is_active",
          [id, user.companyId, dto.name?.trim() ?? null, dto.is_active ?? null],
        );
        if (!r.rows[0])
          throw new NotFoundException({
            code: "family_not_found",
            message_fa: "خانواده یافت نشد.",
          });
        return r.rows[0];
      },
    );
  }
  async history(companyId: string, productId: string, q: HistoryQueryDto) {
    if (!isUUID(productId, "4"))
      throw new BadRequestException({
        code: "invalid_id",
        message_fa: "شناسه معتبر نیست.",
      });
    const { before, limit } = this.historyWindow(q);
    const product = await this.pool.query(
      "select id from product where id=$1 and company_id=$2",
      [productId, companyId],
    );
    if (!product.rows[0])
      throw new NotFoundException({
        code: "product_not_found",
        message_fa: "کالا یافت نشد.",
      });
    const r = await this.pool.query(
      `select id::text,product_id::text,entity_type,entity_id,action,actor_user_id,at,before_data,after_data from product_catalog_history
     where company_id=$1 and product_id=$2 and ($3::bigint is null or id<$3::bigint) order by id desc limit $4`,
      [companyId, productId, before, limit + 1],
    );
    const items = r.rows.slice(0, limit);
    return {
      items,
      has_more: r.rows.length > limit,
      next_cursor: r.rows.length > limit ? items[items.length - 1]?.id : null,
    };
  }
  /**
   * Company-wide, read-only central catalog evidence. Allowlisting the entity
   * types from migration 0060 keeps domain-specific history/behavior out of the
   * global product identity. RLS and the explicit company predicate both apply;
   * the service revalidates the existing view permission from the database.
   */
  async catalogHistory(user: AuthContext, q: CatalogHistoryQueryDto) {
    const { before, limit } = this.historyWindow(q);
    if (
      q.entity_type &&
      !(CENTRAL_CATALOG_HISTORY_ENTITY_TYPES as readonly string[]).includes(
        q.entity_type,
      )
    )
      throw new BadRequestException({
        code: "invalid_entity_type",
        message_fa: "نوع موجودیت تاریخچه معتبر نیست.",
      });
    if (q.product_id && !isUUID(q.product_id, "4"))
      throw new BadRequestException({
        code: "invalid_id",
        message_fa: "شناسه معتبر نیست.",
      });
    await this.access.assert(
      user.companyId,
      user.userId,
      "master.product.view",
    );
    const r = await this.pool.query(
      `select id::text, product_id::text, entity_type, entity_id, action,
              actor_user_id, at, before_data, after_data
         from product_catalog_history
        where company_id = $1
          and entity_type = any($2::text[])
          and ($3::text is null or entity_type = $3::text)
          and ($4::uuid is null or product_id = $4::uuid)
          and ($5::bigint is null or id < $5::bigint)
        order by id desc
        limit $6`,
      [
        user.companyId,
        CENTRAL_CATALOG_HISTORY_ENTITY_TYPES,
        q.entity_type ?? null,
        q.product_id ?? null,
        before,
        limit + 1,
      ],
    );
    const items = r.rows.slice(0, limit);
    return {
      items,
      has_more: r.rows.length > limit,
      next_cursor: r.rows.length > limit ? items[items.length - 1]?.id : null,
    };
  }

  domainContract() {
    return this.domainGate.status();
  }
  domainCatalog(): never {
    return this.domainGate.blocked("product_domain_catalog");
  }
  async currentDomain(user: AuthContext, domainId?: string): Promise<never> {
    await this.domainGate.requireAuthorizedDomain({
      companyId: user.companyId,
      userId: user.userId,
      domainId,
      action: "resolve_domain",
    });
    return this.domainGate.blocked("domain_context");
  }
  async domainList(user: AuthContext, query?: string): Promise<never> {
    await this.domainGate.listAuthorizedDomains({
      companyId: user.companyId,
      userId: user.userId,
      query,
    });
    return this.domainGate.blocked("domain_list");
  }
  async domainProducts(
    user: AuthContext,
    domainId: string,
  ): Promise<never> {
    await this.domainGate.requireAuthorizedDomain({
      companyId: user.companyId,
      userId: user.userId,
      domainId,
      action: "read_membership",
    });
    return this.domainGate.blocked("domain_products");
  }
  async membership(
    user: AuthContext,
    domainId?: string,
  ): Promise<never> {
    await this.domainGate.requireAuthorizedDomain({
      companyId: user.companyId,
      userId: user.userId,
      domainId,
      action: "read_membership",
    });
    return this.domainGate.blocked("product_membership");
  }
  async membershipHistory(
    user: AuthContext,
    domainId?: string,
  ): Promise<never> {
    await this.domainGate.requireAuthorizedDomain({
      companyId: user.companyId,
      userId: user.userId,
      domainId,
      action: "read_history",
    });
    return this.domainGate.blocked("membership_history");
  }
  /**
   * Existing central update permission is the outermost service guard; no
   * domain-management permission vocabulary has been invented. Domain context
   * and provider authorization are rechecked inside the shared transaction,
   * then the gate throws before any membership or history write can occur.
   */
  async blockedMembershipWrite(
    user: AuthContext,
    domainId: string,
    operation: string,
  ) {
    this.domainGate.requireDomainContext(domainId);
    const actor = {
      companyId: user.companyId,
      userId: user.userId,
      domainId,
      action: "manage_membership" as const,
    };
    await this.domainGate.requireAuthorizedDomain(actor);
    return this.access.write(
      user.companyId,
      user.userId,
      "master.product.update",
      async () => {
        await this.domainGate.requireAuthorizedDomain(actor);
        return this.domainGate.blocked(operation);
      },
    );
  }
}

@UseGuards(AuthGuard, PermissionsGuard)
@Controller()
export class CatalogFoundationController {
  constructor(private readonly service: CatalogFoundationService) {}
  @Post("product-categories")
  @RequirePermissions("master.product.update")
  category(@CurrentUser() user: AuthContext, @Body() dto: CatalogLabelDto) {
    return this.service.createCategory(user, dto);
  }
  @Patch("product-families/:id")
  @RequirePermissions("master.product.update")
  family(
    @CurrentUser() user: AuthContext,
    @Param("id") id: string,
    @Body() dto: FamilyNameDto,
  ) {
    return this.service.renameFamily(user, id, dto);
  }
  @Get("product-catalog/history")
  @RequirePermissions("master.product.view")
  catalogHistory(
    @CurrentUser() user: AuthContext,
    @Query() q: CatalogHistoryQueryDto,
  ) {
    return this.service.catalogHistory(user, q);
  }
  @Get("products/:id/history")
  @RequirePermissions("master.product.view")
  history(
    @CurrentUser("companyId") companyId: string,
    @Param("id") id: string,
    @Query() q: HistoryQueryDto,
  ) {
    return this.service.history(companyId, id, q);
  }
  @Get("product-domain-integration")
  @RequirePermissions("master.product.view")
  contract() {
    return this.service.domainContract();
  }
  @Get("products/:id/domain-catalog")
  @RequirePermissions("master.product.view")
  domain() {
    return this.service.domainCatalog();
  }
  @Get("operational-domains")
  @RequirePermissions("master.product.view")
  domains(
    @CurrentUser() user: AuthContext,
    @Query("q") q?: string,
  ) {
    return this.service.domainList(user, q);
  }
  @Get("operational-domains/current")
  @RequirePermissions("master.product.view")
  currentDomain(
    @CurrentUser() user: AuthContext,
    @Headers("x-domain-id") domainId?: string,
  ) {
    return this.service.currentDomain(user, domainId);
  }
  @Get("operational-domains/:domainId/products")
  @RequirePermissions("master.product.view")
  domainProducts(
    @CurrentUser() user: AuthContext,
    @Param("domainId") domainId: string,
  ) {
    return this.service.domainProducts(user, domainId);
  }
  @Get("products/:id/domain-membership")
  @RequirePermissions("master.product.view")
  productMembership(
    @CurrentUser() user: AuthContext,
    @Headers("x-domain-id") domainId?: string,
  ) {
    return this.service.membership(user, domainId);
  }
  @Get("products/:id/domain-membership/history")
  @RequirePermissions("master.product.view")
  productMembershipHistory(
    @CurrentUser() user: AuthContext,
    @Headers("x-domain-id") domainId?: string,
  ) {
    return this.service.membershipHistory(user, domainId);
  }
  @Post("operational-domains/:domainId/products")
  @RequirePermissions("master.product.update")
  addDomainProduct(
    @CurrentUser() user: AuthContext,
    @Param("domainId") domainId: string,
  ) {
    return this.service.blockedMembershipWrite(user, domainId, "membership_create");
  }
  @Patch("operational-domains/:domainId/products/:productId")
  @RequirePermissions("master.product.update")
  changeDomainProduct(
    @CurrentUser() user: AuthContext,
    @Param("domainId") domainId: string,
  ) {
    return this.service.blockedMembershipWrite(
      user,
      domainId,
      "membership_status_change",
    );
  }
  @Delete("operational-domains/:domainId/products/:productId")
  @RequirePermissions("master.product.update")
  removeDomainProduct(
    @CurrentUser() user: AuthContext,
    @Param("domainId") domainId: string,
  ) {
    return this.service.blockedMembershipWrite(user, domainId, "membership_removal");
  }
}
