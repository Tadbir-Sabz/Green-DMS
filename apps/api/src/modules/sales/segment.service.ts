import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { AUDIT_SERVICE, type AuditService } from '../../common/audit.service';
import type {
  CreateCustomerSegmentDto,
  ListCustomerSegmentsQueryDto,
  UpdateCustomerSegmentDto,
} from './segment.dto';
import type { CustomerSegmentRepository, CustomerSegmentRow } from './segment.repository';
import { CUSTOMER_SEGMENT_REPOSITORY } from './tokens';

const notFound = (): NotFoundException =>
  new NotFoundException({ code: 'not_found', message_fa: 'بخش تجاری یافت نشد.' });

const badRequest = (code: string, message_fa: string): BadRequestException =>
  new BadRequestException({ code, message_fa });

/**
 * بخش‌بندی تجاری مشتری — ساخت/ویرایش با ممیزی و کدِ یکتا در هر شرکت.
 * «حذف» وجود ندارد؛ غیرفعال‌سازی (is_active=false) چرخهٔ حیات است تا تاریخچه
 * و انتساب‌های قبلی مشتری‌ها از بین نرود.
 */
@Injectable()
export class CustomerSegmentService {
  constructor(
    @Inject(CUSTOMER_SEGMENT_REPOSITORY) private readonly repo: CustomerSegmentRepository,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
  ) {}

  private assertId(id: string): void {
    if (!isUUID(id, '4')) throw notFound();
  }

  list(companyId: string, query: ListCustomerSegmentsQueryDto): Promise<CustomerSegmentRow[]> {
    return this.repo.list(companyId, query);
  }

  async get(companyId: string, id: string): Promise<CustomerSegmentRow> {
    this.assertId(id);
    const row = await this.repo.findById(companyId, id);
    if (!row) throw notFound();
    return row;
  }

  async create(
    companyId: string,
    dto: CreateCustomerSegmentDto,
    actorUserId: string | null,
  ): Promise<CustomerSegmentRow> {
    const code = dto.code.trim();
    if (await this.repo.codeExists(companyId, code)) {
      throw new ConflictException({
        code: 'duplicate_code',
        message_fa: 'بخش دیگری با این کد در شرکت ثبت شده است.',
        details: { code },
      });
    }
    let id: string;
    try {
      id = await this.repo.insert(companyId, { ...dto, code });
    } catch (err) {
      const pgErr = err as { code?: string; constraint?: string };
      if (pgErr?.code === '23505') {
        throw new ConflictException({
          code: 'duplicate_code',
          message_fa: 'بخش دیگری با این کد در شرکت ثبت شده است.',
          details: { code },
        });
      }
      if (pgErr?.code === '23514') {
        throw badRequest('invalid_segment', 'مقادیر ارسالی برای بخش تجاری معتبر نیست.');
      }
      throw err;
    }
    const row = await this.repo.findById(companyId, id);
    await this.audit.record({
      companyId,
      actorUserId,
      action: 'create',
      entityType: 'customer_segment',
      entityId: id,
      before: null,
      after: row,
    });
    return row!;
  }

  async update(
    companyId: string,
    id: string,
    dto: UpdateCustomerSegmentDto,
    actorUserId: string | null,
  ): Promise<CustomerSegmentRow> {
    this.assertId(id);
    const before = await this.repo.findById(companyId, id);
    if (!before) throw notFound();
    if (dto.is_active === false && before.is_active === true) {
      // غیرفعال‌سازی — مشتریانِ متصل‌شده دست‌نخورده می‌مانند؛ فقط انتسابِ جدید بسته می‌شود.
    }
    const updated = await this.repo.update(companyId, id, dto);
    if (!updated) throw notFound();
    await this.audit.record({
      companyId,
      actorUserId,
      action: 'update',
      entityType: 'customer_segment',
      entityId: id,
      before,
      after: updated,
    });
    return updated;
  }
}
