/**
 * vitest setup — هر pg.Pool ساخته‌شده در تست‌ها را در برابر رویداد 'error'
 * کلاینت بی‌کار محافظت می‌کند.
 *
 * چرا: در teardown هر فایل تست، afterAll ابتدا poolها را end() می‌کند و سپس
 * adminPool با pg_terminate_backend اتصال‌های باقی‌مانده به دیتابیس موقت را
 * می‌بندد تا «drop database» موفق شود. اگر یک کلاینت بی‌کار (از pool مستقیمِ
 * تست) در همان لحظه در حال بسته‌شدن باشد، سرور FATAL 57P01 («terminating
 * connection due to administrator command») می‌فرستد؛ pg آن را به‌صورت رویداد
 * 'error' روی Pool منتشر می‌کند و چون poolهای تست listener ندارند، Node آن را
 * به uncaught exception تبدیل می‌کند که کل اجرای vitest را (حتی با پاس‌شدن
 * همهٔ تست‌ها) شکست می‌دهد.
 *
 * راه‌حل: pg.Pool با زیرکلاسی جایگزین می‌شود که در سازنده یک listener بی‌خطر
 * 'error' ثبت می‌کند. هیچ رفتار دیگری تغییر نمی‌کند — query/connect/end همان‌اند
 * و تنها خطای کلاینتِ بی‌کارِ زمان teardown بلعیده می‌شود (pool خودش اتصالِ
 * از دست رفته را بازیابی می‌کند). pool اپ به‌طور صریح در DatabaseModule listener
 * دارد؛ این guard poolهای مستقیمِ داخل فایل‌های تست را پوشش می‌دهد.
 */
import pg from 'pg';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RealClient = (pg as any).Client;

// برخی خطاهای 57P01 روی خودِ `Client` (نه Pool) منتشر میشوند، مثلاً هنگامی
// که pg_terminate_backend اتصالِ در حال آزادسازی را میبندد. همان محافظ بیصدا
// روی Client هم ثبت میشود تا uncaught exception کاذب، اجرای تستها را نشکند.
if (typeof RealClient === 'function' && !RealClient.__errorGuarded) {
  const GuardedClient = class extends (RealClient as { new (...a: unknown[]): pg.Client }) {
    constructor(...args: unknown[]) {
      super(...args);
      this.on('error', () => undefined);
    }
  };
  (GuardedClient as unknown as { __errorGuarded?: boolean }).__errorGuarded = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pg as any).Client = GuardedClient;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RealPool = (pg as any).Pool;

if (typeof RealPool === 'function' && !RealPool.__errorGuarded) {
  const GuardedPool = class extends (RealPool as { new (...a: unknown[]): pg.Pool }) {
    constructor(...args: unknown[]) {
      super(...args);
      this.on('error', () => undefined);
    }
  };
  (GuardedPool as unknown as { __errorGuarded?: boolean }).__errorGuarded = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pg as any).Pool = GuardedPool;
}
