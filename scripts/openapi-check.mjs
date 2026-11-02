#!/usr/bin/env node
/**
 * اعتبارسنجی سند OpenAPI تثبیت‌شده — packages/contracts/openapi.yaml
 * ابزار: @readme/openapi-parser (پشتیبانی کامل OpenAPI 3.1)
 * خروجی غیرصفر یعنی قرارداد مشترک وب و اپ‌ها شکسته است.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, validate } from '@readme/openapi-parser';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = path.join(ROOT, 'packages', 'contracts', 'openapi.yaml');

const { valid, warnings } = await validate(SPEC, {
  dereference: { circular: false },
});

const api = await parse(SPEC);

if (warnings?.length) {
  console.log('هشدارها:');
  for (const w of warnings) console.log(`  ⚠ ${w.message}`);
}

if (!valid) {
  console.error('سند OpenAPI نامعتبر است؛ خروجی اعتبارسنج را ببینید.');
  process.exit(1);
}

const paths = Object.keys(api.paths ?? {});
const ops = paths.reduce(
  (n, p) =>
    n +
    ['get', 'post', 'put', 'patch', 'delete'].filter((m) => api.paths[p]?.[m]).length,
  0,
);
const schemas = Object.keys(api.components?.schemas ?? {}).length;
const webhooks = Object.keys(api.webhooks ?? {}).length;

console.log('✓ سند OpenAPI معتبر است');
console.log(
  `  مسیرها: ${paths.length} | عملیات‌ها: ${ops} | اسکیماها: ${schemas} | وب‌هوک‌ها: ${webhooks}`,
);
