import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  INTEGRATION_KEYS,
  IntegrationsStatusRepository,
  type IntegrationKey,
  type IntegrationStatusRow,
} from './integrations-status.repository';
import { INTEGRATIONS_STATUS_REPOSITORY } from './integrations-status.tokens';

const isKey = (v: string): v is IntegrationKey =>
  (INTEGRATION_KEYS as readonly string[]).includes(v);

/**
 * سرویس وضعیت یکپارچه‌سازی‌ها (ماژول — ضمیمه D).
 * سلامت هر سرویس از اعتبارنامهٔ پیکربندی‌شده (فعال و منقضی‌نشده) و آخرین
 * فعالیت در صف‌های مؤدیان/پرداخت derives می‌شود.
 *
 * نکتهٔ صداقت: آزمون اتصال (test) در این پیاده‌سازی یک بررسی پیکربندی است
 * (حضور اعتبارنامهٔ فعال و رمزنگاری‌شده و انقضای آن)، نه handshake شبکه‌ای واقعی؛
 * چون کلید/endpoint واقعی سرویس‌های بیرونی در این محیط در دسترس نیست. به‌محض
 * پیکربندی credential واقعی، می‌توان یک فراخوانی شبکه در `probe` افزود.
 */
@Injectable()
export class IntegrationsStatusService {
  constructor(
    @Inject(INTEGRATIONS_STATUS_REPOSITORY)
    private readonly repo: IntegrationsStatusRepository,
  ) {}

  /** GET /integrations — وضعیت همهٔ سرویس‌های بیرونی شرکت */
  async list(companyId: string): Promise<{ items: IntegrationStatusRow[] }> {
    const creds = await this.repo.credentials(companyId);
    const moadian = await this.repo.moadianActivity(companyId);
    const psp = await this.repo.pspActivity(companyId);

    const items: IntegrationStatusRow[] = INTEGRATION_KEYS.map((key) => {
      const cred = creds.get(IntegrationsStatusRepository.providerForKey(key));
      const healthy = isCredentialHealthy(cred);
      // مؤدیان از صف مؤدیان؛ pos/gateway از تراکنش پرداخت؛ sms هنوز لاگ رویداد ندارد
      const activity =
        key === 'moadian' ? moadian : key === 'pos' || key === 'gateway' ? psp : { last_success_at: null, last_error: null };
      return {
        key,
        title: IntegrationsStatusRepository.titleForKey(key),
        healthy,
        last_success_at: activity.last_success_at,
        last_error: healthy ? activity.last_error : (cred ? lastErrorFor(cred) ?? activity.last_error : 'اعتبارنامهٔ سرویس پیکربندی نشده است'),
      };
    });
    return { items };
  }

  /**
   * POST /integrations/{key}/test — آزمون اتصال یک سرویس (فقط ادمین).
   * بررسی می‌کند اعتبارنامهٔ فعال و منقضی‌نشده حضور دارد و رمزنگاری‌شده است.
   */
  async test(companyId: string, key: string): Promise<IntegrationStatusRow> {
    if (!isKey(key)) {
      throw new BadRequestException({
        code: 'unknown_integration',
        message_fa: 'کلید یکپارچه‌سازی ناشناخته است.',
      });
    }
    const creds = await this.repo.credentials(companyId);
    const cred = creds.get(IntegrationsStatusRepository.providerForKey(key));
    const healthy = isCredentialHealthy(cred);

    let last_success_at: string | null = null;
    let last_error: string | null = null;
    if (key === 'moadian') {
      const a = await this.repo.moadianActivity(companyId);
      last_success_at = a.last_success_at;
      last_error = a.last_error;
    } else if (key === 'pos' || key === 'gateway') {
      const a = await this.repo.pspActivity(companyId);
      last_success_at = a.last_success_at;
      last_error = a.last_error;
    }

    return {
      key,
      title: IntegrationsStatusRepository.titleForKey(key),
      healthy,
      last_success_at,
      last_error: healthy ? last_error : (cred ? lastErrorFor(cred) ?? last_error : 'اعتبارنامهٔ سرویس پیکربندی نشده است'),
    };
  }
}

interface CredLike {
  is_active: boolean;
  valid_until: string | null;
  has_secret: boolean;
}

const isCredentialHealthy = (cred?: CredLike | null): boolean => {
  if (!cred) return false;
  if (!cred.is_active) return false;
  if (!cred.has_secret) return false;
  if (cred.valid_until && new Date(cred.valid_until).getTime() <= Date.now()) return false;
  return true;
};

const lastErrorFor = (cred: CredLike): string | null => {
  if (!cred.is_active) return 'اعتبارنامه غیرفعال است';
  if (!cred.has_secret) return 'کلید/رمز سرویس ثبت نشده است';
  if (cred.valid_until && new Date(cred.valid_until).getTime() <= Date.now()) return 'اعتبارنامه منقضی شده است';
  return null;
};
