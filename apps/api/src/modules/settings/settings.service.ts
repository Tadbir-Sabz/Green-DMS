import { Inject, Injectable } from '@nestjs/common';
import type { AuditService } from '../../common/audit.service';
import { AUDIT_SERVICE } from '../../common/audit.service';
import type { RequestMeta } from '../../common/request-meta';
import type { SettingRow, SettingsRepository } from './settings.repository';
import { SETTINGS_REPOSITORY } from './tokens';
import type { ListSettingsQueryDto, SettingEntryDto, UpdateSettingsDto } from './settings.dto';

/**
 * سرویس تنظیمات (ماژول ۱۱) — خواندن مؤثر با سلسله‌مراتب override و نوشتن
 * دسته‌ای. هر تغییر در audit_log ثبت می‌شود (مهاجرت 0002) تا «چه کسی، چه چیزی،
 * کی» قابل پیگیری باشد.
 */
@Injectable()
export class SettingsService {
  constructor(
    @Inject(SETTINGS_REPOSITORY) private readonly repo: SettingsRepository,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
  ) {}

  async list(
    companyId: string,
    query: ListSettingsQueryDto,
  ): Promise<{ items: SettingRow[] }> {
    const items = await this.repo.list(companyId, query);
    return { items };
  }

  async update(
    companyId: string,
    actorUserId: string,
    dto: UpdateSettingsDto,
    meta: RequestMeta,
  ): Promise<{ items: SettingRow[] }> {
    // وضعیت پیشین برای before_data ممیزی
    const before = await this.repo.list(companyId, {});
    for (const entry of dto.items ?? []) {
      await this.repo.upsert(companyId, actorUserId, entry as SettingEntryDto);
    }
    const after = await this.repo.list(companyId, {});

    await this.audit.record({
      companyId,
      actorUserId,
      action: 'update',
      entityType: 'setting',
      before: before.map((s) => ({ key: s.key, scope_type: s.scope_type, value: s.value })),
      after: after.map((s) => ({ key: s.key, scope_type: s.scope_type, value: s.value })),
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return { items: after };
  }

  /** مقدار مؤثر یک کلید برای نشست جاری (سلسله‌مراتب fn_setting) */
  async effective(
    companyId: string,
    key: string,
    scope: { branchId?: string | null; areaId?: string | null; userId?: string | null },
  ): Promise<string | null> {
    return this.repo.effective(companyId, key, scope);
  }
}
