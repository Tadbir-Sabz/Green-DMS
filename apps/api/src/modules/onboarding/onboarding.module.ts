import { Module } from '@nestjs/common';
import { IdentityRbacModule } from '../identity-rbac/identity-rbac.module';
import { OnboardingController } from './onboarding.controller';
import { OnboardingRepository } from './onboarding.repository';
import { OnboardingService } from './onboarding.service';
import { ONBOARDING_REPOSITORY, ONBOARDING_SERVICE } from './tokens';

/**
 * ماژول خودخدمت‌دهیِ استقرار. IdentityRbacModule برای AuthGuard/PermissionsGuard
 * (مسیر info) وارد می‌شود؛ hashPassword مستقیماً از password.ts استفاده می‌شود.
 */
@Module({
  imports: [IdentityRbacModule],
  controllers: [OnboardingController],
  providers: [
    OnboardingRepository,
    { provide: ONBOARDING_REPOSITORY, useExisting: OnboardingRepository },
    OnboardingService,
    { provide: ONBOARDING_SERVICE, useExisting: OnboardingService },
  ],
  exports: [ONBOARDING_SERVICE],
})
export class OnboardingModule {}
