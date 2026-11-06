import { Module } from '@nestjs/common';
import { IdentityRbacModule } from '../identity-rbac/identity-rbac.module';
import { PortalController } from './portal.controller';
import { PortalRepository } from './portal.repository';
import { PortalService } from './portal.service';
import { PortalAuthGuard } from './portal-auth.guard';
import { PORTAL_REPOSITORY, PORTAL_SERVICE } from './tokens';

/**
 * ماژول پورتال B2B مشتریان — هویتِ جداگانه (portal_user/portal_session) و JWT با
 * audience مجزا. IdentityRbacModule برای AuthGuard/PermissionsGuard/@CurrentUser
 * (مسیرهای پروکسی‌دادنِ کارکنان) و نیز auth.config/password وارد می‌شود.
 */
@Module({
  imports: [IdentityRbacModule],
  controllers: [PortalController],
  providers: [
    PortalRepository,
    { provide: PORTAL_REPOSITORY, useExisting: PortalRepository },
    PortalService,
    { provide: PORTAL_SERVICE, useExisting: PortalService },
    PortalAuthGuard,
  ],
  exports: [PORTAL_SERVICE],
})
export class PortalModule {}
