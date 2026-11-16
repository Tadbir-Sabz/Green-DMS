import {
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { AUDIT_SERVICE, type AuditService } from '../../common/audit.service';
import type { CustomerCreditRepository } from './customer-credit.repository';
import type { CreditExposureDetail } from './customer-credit.repository';
import { CUSTOMER_CREDIT_REPOSITORY } from './tokens';

export type CustomerCreditView = CreditExposureDetail;

const notFound = (): NotFoundException =>
  new NotFoundException({ code: 'not_found', message_fa: 'مشتری یافت نشد.' });

/**
 * خواندنِ مالیِ اعتبار و گردشِ مسدودی — همهٔ تغییرات با «قبل/بعد» در audit_log ثبت می‌شوند.
 * ارزیابیِ دروازه در `credit-policy.ts` است (منبعِ واحد).
 */
@Injectable()
export class CustomerCreditService {
  constructor(
    @Inject(CUSTOMER_CREDIT_REPOSITORY) private readonly repo: CustomerCreditRepository,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
  ) {}

  private assertId(id: string): void {
    if (!isUUID(id, '4')) {
      throw notFound();
    }
  }

  async detail(companyId: string, id: string): Promise<CustomerCreditView> {
    this.assertId(id);
    const row = await this.repo.exposureDetail(companyId, id);
    if (!row) throw notFound();
    return row;
  }

  /** مسدودیِ دستیِ اعتبار — reason الزامی؛ تکرارِ مسدودیِ فعال «already» است، نه خطا */
  async setHold(
    companyId: string,
    id: string,
    reason: string,
    actorUserId: string,
  ): Promise<CustomerCreditView> {
    this.assertId(id);
    const trimmed = reason.trim();
    const result = await this.repo.withTx(async (client) =>
      this.repo.setHold(client, companyId, id, { reason: trimmed, setBy: actorUserId }),
    );
    if (result === 'not_found') throw notFound();
    if (result === 'set') {
      await this.audit.record({
        companyId,
        actorUserId,
        action: 'update',
        entityType: 'customer_credit',
        entityId: id,
        before: { credit_hold: false },
        after: { credit_hold: true, hold_reason: trimmed },
      });
    }
    return this.detail(companyId, id);
  }

  /** رفعِ مسدودیِ دستی؛ اگر مسدودی فعالی نباشد همان وضعیت برگردانده می‌شود */
  async releaseHold(
    companyId: string,
    id: string,
    note: string | null,
    actorUserId: string,
  ): Promise<CustomerCreditView> {
    this.assertId(id);
    const result = await this.repo.withTx(async (client) =>
      this.repo.setHold(client, companyId, id, { reason: null, setBy: actorUserId }),
    );
    if (result === 'not_found') throw notFound();
    if (result === 'set') {
      await this.audit.record({
        companyId,
        actorUserId,
        action: 'update',
        entityType: 'customer_credit',
        entityId: id,
        before: { credit_hold: true },
        after: { credit_hold: false, note: note?.trim() || null },
      });
    }
    return this.detail(companyId, id);
  }
}
