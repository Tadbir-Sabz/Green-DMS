import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { isUUID } from 'class-validator';
import type { PersonRow } from './person.repository';
import {
  CreatePersonDto,
  ListPersonsQueryDto,
  UpdatePersonDto,
} from './person.dto';
import { PERSON_REPOSITORY } from './tokens';
import type { PersonRepository } from './person.repository';

/** شکل مورد نیاز قاعده نام — هم ردیف دیتابیس و هم DTO را پوشش می‌دهد */
interface NameParts {
  legal_type: string;
  first_name?: string | null;
  last_name?: string | null;
  legal_name?: string | null;
}

const notFound = (): NotFoundException =>
  new NotFoundException({ code: 'not_found', message_fa: 'شخص یافت نشد' });

/**
 * سرویس اشخاص — CRUD مسیرهای openapi › /persons با قواعد قرارداد و قیدهای DDL:
 * - قاعده نام: شخص حقوقی legal_name می‌خواهد، شخص حقیقی دست‌کم نام یا نام خانوادگی
 *   (همان ck_person_name — پیش از رسیدن به دیتابیس با پیام فارسی سنجیده می‌شود)
 * - کد و شناسه ملی در شرکت یکتا: تکرار → 409
 * - همه عملیات company_id نشست را شرط می‌کنند؛ شخص شرکت دیگر 404 می‌شود
 */
@Injectable()
export class PersonService {
  constructor(@Inject(PERSON_REPOSITORY) private readonly repo: PersonRepository) {}

  private assertId(id: string): void {
    if (!isUUID(id, '4')) {
      throw new BadRequestException({
        code: 'invalid_id',
        message_fa: 'شناسه ارسال‌شده معتبر نیست.',
      });
    }
  }

  async list(companyId: string, query: ListPersonsQueryDto): Promise<Page<PersonRow>> {
    const { items, nextCursor, hasMore } = await this.repo.list(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  async get(companyId: string, id: string): Promise<PersonRow> {
    this.assertId(id);
    const row = await this.repo.findById(companyId, id);
    if (!row) throw notFound();
    return row;
  }

  async create(companyId: string, dto: CreatePersonDto): Promise<PersonRow> {
    this.assertNameRule(dto);
    if (await this.repo.codeExists(companyId, dto.code)) throw codeTaken();
    try {
      return await this.repo.insert(companyId, dto);
    } catch (err) {
      throw this.mapDbError(err, 'ساخت شخص');
    }
  }

  async update(companyId: string, id: string, dto: UpdatePersonDto): Promise<PersonRow> {
    this.assertId(id);
    const before = await this.repo.findById(companyId, id);
    if (!before) throw notFound();

    // قاعده نام روی وضعیت ادغام‌شده سنجیده می‌شود نه فقط فیلدهای فرستاده‌شده
    this.assertNameRule({
      legal_type: dto.legal_type ?? before.legal_type,
      first_name: dto.first_name !== undefined ? dto.first_name : before.first_name,
      last_name: dto.last_name !== undefined ? dto.last_name : before.last_name,
      legal_name: dto.legal_name !== undefined ? dto.legal_name : before.legal_name,
    });
    if (dto.code && dto.code !== before.code && (await this.repo.codeExists(companyId, dto.code))) {
      throw codeTaken();
    }

    try {
      const row = await this.repo.update(companyId, id, dto);
      if (!row) throw notFound();
      return row;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw this.mapDbError(err, 'بروزرسانی شخص');
    }
  }

  /**
   * قاعده نام (ck_person_name): حقوقی ↔ legal_name، حقیقی ↔ نام یا نام خانوادگی.
   * با details.fields همان ساختار خطای اعتبارسنجی سراسری برمی‌گردد تا رابط
   * کاربری پیام را کنار همان فیلد نشان دهد.
   */
  private assertNameRule(person: NameParts): void {
    if (person.legal_type === 'legal' && !person.legal_name?.trim()) {
      throw new BadRequestException({
        code: 'missing_legal_name',
        message_fa: 'برای شخص حقوقی، نام حقوقی (legal_name) الزامی است.',
        details: { fields: { legal_name: ['نام حقوقی را وارد کنید.'] } },
      });
    }
    if (
      person.legal_type === 'natural' &&
      !person.first_name?.trim() &&
      !person.last_name?.trim()
    ) {
      throw new BadRequestException({
        code: 'missing_name',
        message_fa: 'برای شخص حقیقی، دست‌کم یکی از نام یا نام خانوادگی الزامی است.',
        details: { fields: { first_name: ['نام یا نام خانوادگی را وارد کنید.'] } },
      });
    }
  }

  private mapDbError(err: unknown, action: string): Error {
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr?.code === '23505' && pgErr.constraint === 'uq_person_code') return codeTaken();
    if (pgErr?.code === '23505' && pgErr.constraint === 'uq_person_national_id') {
      return new ConflictException({
        code: 'duplicate_national_id',
        message_fa: 'این شناسه ملی برای شخص دیگری در همین شرکت ثبت شده است.',
      });
    }
    if (pgErr?.code === '23505') {
      return new ConflictException({
        code: 'duplicate_person',
        message_fa: 'شخصی با همین مشخصات قبلاً ثبت شده است.',
        details: { constraint: pgErr.constraint },
      });
    }
    if (pgErr?.code === '23514') {
      return new BadRequestException({
        code: 'check_violation',
        message_fa: 'شرایط شخص معتبر نیست؛ نام و نوع شخص (حقیقی/حقوقی) را بررسی کنید.',
        details: { constraint: pgErr.constraint },
      });
    }
    if (pgErr?.code === '23502') {
      return new BadRequestException({
        code: 'missing_field',
        message_fa: 'یک فیلد الزامی شخص خالی است.',
        details: { constraint: pgErr.constraint },
      });
    }
    return new BadRequestException({
      code: `${action}_failed`,
      message_fa: 'خطای غیرمنتظره در ذخیره شخص.',
      details: { db_code: pgErr?.code },
    });
  }
}

const codeTaken = (): ConflictException =>
  new ConflictException({
    code: 'duplicate_code',
    message_fa: 'کد شخص برای این شرکت قبلاً ثبت شده است؛ کد دیگری انتخاب کنید.',
  });
