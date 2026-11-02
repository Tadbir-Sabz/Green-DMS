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
  },
});
