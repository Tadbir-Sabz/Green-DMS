/**
 * SWC لازم است چون esbuild پیش‌فرض vitest از emitDecoratorMetadata پشتیبانی نمی‌کند؛
 * بدون آن ValidationPipe متاکلاس DTO را نمی‌بیند و اعتبارسنجی بی‌صدا رد می‌شود.
 */
declare const _default: UserConfig;
export default _default;
