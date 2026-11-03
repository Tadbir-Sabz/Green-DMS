import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * SWC لازم است چون esbuild پیش‌فرض vitest از emitDecoratorMetadata پشتیبانی نمی‌کند؛
 * بدون آن ValidationPipe متاکلاس DTO را نمی‌بیند و اعتبارسنجی بی‌صدا رد می‌شود.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // guard رویداد 'error' کلاینت بی‌کار pg در teardown (57P01) تا یک uncaught
    // exception کل اجرا را حتی با پاس‌شدن همهٔ تست‌ها نشکند (نگاه به setup-pg-guard).
    setupFiles: ['./test/setup-pg-guard.ts'],
    environment: 'node',
    pool: 'forks',
    // هر فایل تست دیتابیس موقت خودش را می‌سازد و ۲۵ مهاجرت را در تراکنش واحد اجرا می‌کند؛
    // اجرای هم‌زمانِ چند فایل از سقف max_locks_per_transaction می‌گذرد و psql با
    // «out of shared memory» می‌شکند. ترتیبی‌کردن، پاس‌شدن کل مجموعه را تضمین می‌کند.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2022',
      },
      module: { type: 'es6' },
    }),
  ],
});
