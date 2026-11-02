import { Controller, Get, Module } from '@nestjs/common';
import type { ModuleInfo } from '../../common/module-info';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { DevicesController } from './devices.controller';
import { DevicesRepository } from './devices.repository';
import { DevicesService } from './devices.service';
import { RolesController } from './roles.controller';
import { RolesRepository } from './roles.repository';
import { RolesService } from './roles.service';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { createSmsSender } from './sms-sender';
import {
  AUTH_REPOSITORY,
  AUTH_SERVICE,
  DEVICES_REPOSITORY,
  DEVICES_SERVICE,
  ROLES_REPOSITORY,
  ROLES_SERVICE,
  SMS_SENDER,
  USERS_REPOSITORY,
  USERS_SERVICE,
} from './tokens';

/** Identity & RBAC — احراز هویت JWT و کنترل دسترسی نقش/مجوز (§۱.۴، ضمیمه H) */
@Controller('identity-rbac')
export class IdentityRbacController {
  @Get()
  info(): ModuleInfo {
    return {
      module: 'identity-rbac',
      title: 'احراز هویت و دسترسی',
      resources: [
        'auth',
        'users',
        'staff',
        'roles',
        'permissions',
        'user-scopes',
        'sessions',
        'audit-log',
      ],
      status: 'scaffold',
    };
  }
}

/**
 * ماژول ۱ سازمانی (Identity & RBAC):
 * - پیاده‌شده: /auth/login، /auth/refresh، /auth/logout، /auth/me،
 *   /auth/otp/request و /auth/otp/verify (OTP پیامکی با درگاه قابل‌تعویض)،
 *   /devices (دستگاه‌های مجاز + ابطال از راه دور)، /users CRUD و /roles CRUD
 *   + AuthGuard + PermissionsGuard
 * - در انتظار (طبق openapi): /persons در ماژول master-data پیاده شده است؛
 *   سایر ماژول‌ها (customers, inventory, …) در ماژول‌های خودشان
 * AuthRepository/AuthService خروجی داده‌اند تا گاردها در ماژول‌های دیگر هم قابل استفاده باشند.
 */
@Module({
  controllers: [
    IdentityRbacController,
    AuthController,
    UsersController,
    RolesController,
    DevicesController,
  ],
  providers: [
    AuthRepository,
    { provide: AUTH_REPOSITORY, useExisting: AuthRepository },
    AuthService,
    { provide: AUTH_SERVICE, useExisting: AuthService },
    UsersRepository,
    { provide: USERS_REPOSITORY, useExisting: UsersRepository },
    UsersService,
    { provide: USERS_SERVICE, useExisting: UsersService },
    RolesRepository,
    { provide: ROLES_REPOSITORY, useExisting: RolesRepository },
    RolesService,
    { provide: ROLES_SERVICE, useExisting: RolesService },
    DevicesRepository,
    { provide: DEVICES_REPOSITORY, useExisting: DevicesRepository },
    DevicesService,
    { provide: DEVICES_SERVICE, useExisting: DevicesService },
    // درگاه پیامک: LogSmsSender پیش‌فرض؛ SMS_PROVIDER=http → HttpSmsSender؛ تست‌ها override می‌کنند
    { provide: SMS_SENDER, useFactory: createSmsSender },
  ],
  exports: [AUTH_REPOSITORY, AUTH_SERVICE, DEVICES_SERVICE],
})
export class IdentityRbacModule {}
