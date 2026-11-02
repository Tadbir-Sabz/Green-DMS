/** توکن‌های DI ماژول identity-rbac — با @Inject صریح (سازگار با esbuild بدون emitDecoratorMetadata) */
export const AUTH_REPOSITORY = 'AUTH_REPOSITORY';
export const AUTH_SERVICE = 'AUTH_SERVICE';
export const USERS_REPOSITORY = 'USERS_REPOSITORY';
export const USERS_SERVICE = 'USERS_SERVICE';
export const ROLES_REPOSITORY = 'ROLES_REPOSITORY';
export const ROLES_SERVICE = 'ROLES_SERVICE';
export const DEVICES_REPOSITORY = 'DEVICES_REPOSITORY';
export const DEVICES_SERVICE = 'DEVICES_SERVICE';
/** درگاه ارسال پیامک (قابل‌تعویض: LogSmsSender پیش‌فرض، HttpSmsSender با SMS_PROVIDER=http) */
export const SMS_SENDER = 'SMS_SENDER';
