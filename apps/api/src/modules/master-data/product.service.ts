import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { isUUID } from 'class-validator';
import type { ProductRow } from './product.repository';
import { ProductRepository } from './product.repository';
import { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from './product.dto';
import { PRODUCT_REPOSITORY } from './tokens';

@Injectable()
export class ProductService {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly repo: ProductRepository,
  ) {}

  async list(companyId: string, query: ListProductsQueryDto): Promise<Page<ProductRow>> {
    const { items, nextCursor, hasMore } = await this.repo.list(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  private assertId(id: string): void {
    if (!isUUID(id, '4')) {
      throw new BadRequestException({
        code: 'invalid_id',
        message_fa: 'شناسه ارسال‌شده معتبر نیست.',
      });
    }
  }

  async get(companyId: string, id: string): Promise<ProductRow> {
    this.assertId(id);
    const row = await this.repo.findById(companyId, id);
    if (!row) throw new NotFoundException({ code: 'not_found', message_fa: 'کالا یافت نشد' });
    return row;
  }

  async create(companyId: string, dto: CreateProductDto): Promise<ProductRow> {
    await this.assertReferences(companyId, dto);
    try {
      return await this.repo.insert(companyId, dto);
    } catch (err) {
      throw this.mapDbError(err, 'ساخت کالا');
    }
  }

  async update(
    companyId: string,
    id: string,
    dto: UpdateProductDto,
  ): Promise<ProductRow> {
    this.assertId(id);
    if (!(await this.repo.findById(companyId, id))) {
      throw new NotFoundException({ code: 'not_found', message_fa: 'کالا یافت نشد' });
    }
    await this.assertReferences(companyId, dto);

    const row = await this.repo.update(companyId, id, dto, dto.row_version);
    if (!row) {
      // فقط وقتی row_version فرستاده شده به اینجا می‌رسیم
      throw new ConflictException({
        code: 'version_conflict',
        message_fa: 'کالا هم‌زمان توسط کاربر دیگری تغییر کرده است؛ دوباره بارگیری کنید.',
      });
    }
    return row;
  }

  async remove(companyId: string, id: string): Promise<void> {
    this.assertId(id);
    const ok = await this.repo.softDelete(companyId, id);
    if (!ok) throw new NotFoundException({ code: 'not_found', message_fa: 'کالا یافت نشد' });
  }

  private async assertReferences(
    companyId: string,
    dto: CreateProductDto | UpdateProductDto,
  ): Promise<void> {
    if (dto.category_id && !(await this.repo.categoryExists(companyId, dto.category_id))) {
      throw new BadRequestException({
        code: 'invalid_category',
        message_fa: 'دسته‌بندی انتخاب‌شده برای این شرکت تعریف نشده است.',
      });
    }
    if (dto.base_uom_id && !(await this.repo.uomExists(dto.base_uom_id))) {
      throw new BadRequestException({
        code: 'invalid_uom',
        message_fa: 'واحد اندازه‌گیری انتخاب‌شده معتبر نیست.',
      });
    }
  }

  private mapDbError(err: unknown, action: string): Error {
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr?.code === '23505' && pgErr.constraint === 'uq_product_code') {
      return new ConflictException({
        code: 'duplicate_code',
        message_fa: 'کد کالا قبلاً ثبت شده است؛ کد دیگری انتخاب کنید.',
      });
    }
    if (pgErr?.code === '23514') {
      return new BadRequestException({
        code: 'check_violation',
        message_fa: `شرایط کالا معتبر نیست (${pgErr.constraint}).`,
      });
    }
    if (pgErr?.code === '23503') {
      return new BadRequestException({
        code: 'invalid_reference',
        message_fa: 'یکی از مراجع (دسته‌بندی/واحد) معتبر نیست.',
      });
    }
    return new BadRequestException({
      code: `${action}_failed`,
      message_fa: 'خطای غیرمنتظره در ذخیره کالا.',
      details: { db_code: pgErr?.code },
    });
  }
}
