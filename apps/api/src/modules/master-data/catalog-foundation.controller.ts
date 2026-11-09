import { BadRequestException, Body, ConflictException, Controller, Get, Inject, Injectable, NotFoundException, Param, Patch, Post, Query, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, IsUUID, isUUID } from 'class-validator';
import { Type } from 'class-transformer';
import type { Pool } from 'pg';
import { PG_POOL } from '../../database/database.module';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser, type AuthContext } from '../identity-rbac/auth-context.decorator';
import { CatalogAccess } from './catalog-access.service';

export class CatalogLabelDto {
 @IsString() @IsNotEmpty() @MaxLength(64) code: string;
 @IsString() @IsNotEmpty() @MaxLength(255) name: string;
}
export class FamilyNameDto { @IsString() @IsNotEmpty() @MaxLength(255) name: string; }
export class HistoryQueryDto {
 @IsOptional() @IsString() @MaxLength(24) before?: string;
 @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit: number = 30;
}

@Injectable()
export class CatalogFoundationService {
 constructor(@Inject(PG_POOL) private readonly pool: Pool, private readonly access: CatalogAccess) {}
 async createCategory(user: AuthContext, dto: CatalogLabelDto) {
   return this.access.write(user.companyId, user.userId, 'master.product.update', async () => {
     if (!dto.code?.trim() || !dto.name?.trim() || dto.code.length > 64 || dto.name.length > 255)
       throw new BadRequestException({code:'invalid_catalog_label',message_fa:'کد و عنوان معتبر الزامی است.'});
     try {
       const result = await this.pool.query('insert into product_category(company_id,code,name) values($1,$2,$3) returning id,code,name', [user.companyId,dto.code.trim(),dto.name.trim()]);
       return result.rows[0];
     } catch (e) {
       if ((e as {code?:string}).code === '23505') throw new ConflictException({code:'duplicate_category',message_fa:'کد گروه قبلاً ثبت شده است.'});
       throw e;
     }
   });
 }
 async renameFamily(user: AuthContext, id: string, dto: FamilyNameDto) {
   if (!isUUID(id,'4')) throw new BadRequestException({code:'invalid_id',message_fa:'شناسه معتبر نیست.'});
   return this.access.write(user.companyId,user.userId,'master.product.update',async()=>{
     if (!dto.name?.trim() || dto.name.length > 255) throw new BadRequestException({code:'invalid_family_name',message_fa:'نام خانواده معتبر نیست.'});
     const r = await this.pool.query('update product_family set name=$3,updated_at=now() where id=$1 and company_id=$2 returning id,code,name',[id,user.companyId,dto.name.trim()]);
     if (!r.rows[0]) throw new NotFoundException({code:'family_not_found',message_fa:'خانواده یافت نشد.'});
     return r.rows[0];
   });
 }
 async history(companyId: string, productId: string, q: HistoryQueryDto) {
   if (!isUUID(productId,'4')) throw new BadRequestException({code:'invalid_id',message_fa:'شناسه معتبر نیست.'});
   if (q.before && !/^[0-9]{1,20}$/.test(q.before)) throw new BadRequestException({code:'invalid_cursor',message_fa:'نشانگر تاریخچه معتبر نیست.'});
   const limit = Math.min(100, Math.max(1, q.limit ?? 30));
   const product = await this.pool.query('select id from product where id=$1 and company_id=$2',[productId,companyId]);
   if (!product.rows[0]) throw new NotFoundException({code:'product_not_found',message_fa:'کالا یافت نشد.'});
   const r = await this.pool.query(`select id::text,entity_type,entity_id,action,actor_user_id,at,before_data,after_data from product_catalog_history
     where company_id=$1 and product_id=$2 and ($3::bigint is null or id<$3::bigint) order by id desc limit $4`, [companyId,productId,q.before??null,limit+1]);
   const items = r.rows.slice(0,limit);
   return {items,has_more:r.rows.length>limit,next_cursor:r.rows.length>limit?items[items.length-1]?.id:null};
 }
 domainContract() {
   return {available:false,code:'domain_identity_unresolved',message_fa:'هویت دامنه عملیاتی و مرز اختیار آن تعریف نشده است. دامنه قیمت‌گذاری جایگزین دامنه کاتالوگ نیست. فعال بودن مرکزی به معنی عرضه در همه دامنه‌ها نیست.'};
 }
 domainCatalog(): never {
   throw new ServiceUnavailableException(this.domainContract());
 }
}

@UseGuards(AuthGuard,PermissionsGuard)
@Controller()
export class CatalogFoundationController {
 constructor(private readonly service: CatalogFoundationService) {}
 @Post('product-categories') @RequirePermissions('master.product.update')
 category(@CurrentUser() user: AuthContext,@Body() dto: CatalogLabelDto) { return this.service.createCategory(user,dto); }
 @Patch('product-families/:id') @RequirePermissions('master.product.update')
 family(@CurrentUser() user: AuthContext,@Param('id') id: string,@Body() dto: FamilyNameDto) { return this.service.renameFamily(user,id,dto); }
 @Get('products/:id/history') @RequirePermissions('master.product.view')
 history(@CurrentUser('companyId') companyId: string,@Param('id') id: string,@Query() q: HistoryQueryDto) { return this.service.history(companyId,id,q); }
 @Get('product-domain-integration') @RequirePermissions('master.product.view')
 contract() { return this.service.domainContract(); }
 @Get('products/:id/domain-catalog') @RequirePermissions('master.product.view')
 domain() { return this.service.domainCatalog(); }
}
