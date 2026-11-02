import { Module } from '@nestjs/common';
import { IdentityRbacModule } from '../identity-rbac/identity-rbac.module';
import { SettingsController } from './settings.controller';
import { SettingsRepository } from './settings.repository';
import { SettingsService } from './settings.service';
import { SETTINGS_REPOSITORY, SETTINGS_SERVICE } from './tokens';

/**
 * ماژول ۱۱ — تنظیمات با سلسله‌مراتب override (global < company < branch < area < user)
 * روی جدول setting (مهاجرت 0002 + 0031) و تابع fn_setting.
 */
@Module({
  imports: [IdentityRbacModule],
  controllers: [SettingsController],
  providers: [
    SettingsRepository,
    { provide: SETTINGS_REPOSITORY, useExisting: SettingsRepository },
    SettingsService,
    { provide: SETTINGS_SERVICE, useExisting: SettingsService },
  ],
  exports: [SETTINGS_SERVICE],
})
export class SettingsModule {}
