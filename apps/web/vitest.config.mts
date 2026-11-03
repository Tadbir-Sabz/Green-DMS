import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * تست‌های وب‌اپ — همان vitest سراسری monorepo با محیط jsdom؛
 * alias «@» از tsconfig پروژه (src/*) می‌آید تا importهای صفحات بدون تغییر کار کنند.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(root, 'src') },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    testTimeout: 15_000,
    pool: 'forks',
    // هر فایل تست وب یک محیط jsdom کامل با React 19 + Next بار می‌زند؛ اجرای
    // هم‌زمان چند worker در CI از سقف حافظه می‌گذرد و vitest بی‌آنکه گزارش تستی
    // بدهد crash می‌کند (بدون annotation). ترتیبی‌کردن، پایداری در CI را تضمین می‌کند.
    fileParallelism: false,
  },
});
