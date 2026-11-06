import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BILLING_REPOSITORY } from './tokens';
import type { BillingRepository, BillingInvoice } from './billing.repository';

/**
 * سرویسِ صورتحسابِ اشتراک — فقط خواندن (فهرست و جزئیات)، اسکوپ‌شده به company_idِ
 * نشست. صدور/پرداختِ اشتراک طبقِ دامنهٔ مصوب فعلاً پیاده نشده است.
 */
@Injectable()
export class BillingService {
  constructor(@Inject(BILLING_REPOSITORY) private readonly repo: BillingRepository) {}

  list(companyId: string): Promise<BillingInvoice[]> {
    return this.repo.list(companyId);
  }

  async get(companyId: string, id: string): Promise<BillingInvoice> {
    const row = await this.repo.get(companyId, id);
    if (!row) {
      throw new NotFoundException({
        code: 'billing_invoice_not_found',
        message_fa: 'صورتحسابِ اشتراک یافت نشد.',
      });
    }
    return row;
  }
}
