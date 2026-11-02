"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SMS_SENDER = exports.DEVICES_SERVICE = exports.DEVICES_REPOSITORY = exports.ROLES_SERVICE = exports.ROLES_REPOSITORY = exports.USERS_SERVICE = exports.USERS_REPOSITORY = exports.AUTH_SERVICE = exports.AUTH_REPOSITORY = void 0;
/** توکن‌های DI ماژول identity-rbac — با @Inject صریح (سازگار با esbuild بدون emitDecoratorMetadata) */
exports.AUTH_REPOSITORY = 'AUTH_REPOSITORY';
exports.AUTH_SERVICE = 'AUTH_SERVICE';
exports.USERS_REPOSITORY = 'USERS_REPOSITORY';
exports.USERS_SERVICE = 'USERS_SERVICE';
exports.ROLES_REPOSITORY = 'ROLES_REPOSITORY';
exports.ROLES_SERVICE = 'ROLES_SERVICE';
exports.DEVICES_REPOSITORY = 'DEVICES_REPOSITORY';
exports.DEVICES_SERVICE = 'DEVICES_SERVICE';
/** درگاه ارسال پیامک (قابل‌تعویض: LogSmsSender پیش‌فرض، HttpSmsSender با SMS_PROVIDER=http) */
exports.SMS_SENDER = 'SMS_SENDER';
