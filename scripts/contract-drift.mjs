#!/usr/bin/env node
/**
 * ممیزی تطبیق قرارداد با کد — packages/contracts/openapi.yaml در برابر routeهای
 * واقعی Nest (همه فایل‌های *.controller.ts زیر apps/api/src).
 *
 * دو دسته اختلاف گزارش می‌شود (همان دو معیارِ contract.api.test.ts):
 *   ۱) کد بدون سند   → endpoint زنده‌ای که در قرارداد مستند نشده (کلاینت تایپ‌شده
 *                       وب/اندروید آن را نمی‌بیند).
 *   ۲) سند بدون کد   → عملیاتی که قرارداد وعده داده ولی پیاده‌سازی نشده.
 *
 * مسیر /api/health عمداً خارج از قرارداد است (پروب زیرساخت) و prefix سراسری
 * /api/v1 در main.ts اضافه می‌شود، پس اینجا مقایسه روی مسیرِ بی‌prefix انجام می‌شود.
 *
 * استفاده:  node scripts/contract-drift.mjs [--json] [--allow-drift]
 *   --allow-drift  فقط گزارش می‌دهد و همیشه با کد 0 خارج می‌شود (برای فاز گذار)
 *
 * توجه: این اسکن ایستا روی decoratorهاست؛ اگر الگوی @Controller/@Get عوض شد
 * (مثلاً route پویا یا نسخه‌بندی با @Version) باید اینجا هم به‌روز شود.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC_FILE = path.join(ROOT, 'packages', 'contracts', 'openapi.yaml');
const SRC_DIR = path.join(ROOT, 'apps', 'api', 'src');

/** مسیرهای زیرساختی که عمداً در قرارداد نیستند (هم‌راستا با contract.api.test.ts) */
const OUT_OF_CONTRACT = new Set(['/api/health', '/health', '/health/live', '/health/ready']);

/**
 * روت‌های اسکلت — همان فهرست contract.api.test.ts ولی بدون پیشوند /api/v1
 * (اینجا مقایسه روی مسیرِ بی‌prefix انجام می‌شود). این‌ها endpointهای info-only
 * یا stub با دادهٔ ساختگی‌اند که جزو قرارداد نیستند و با پیاده‌سازی واقعی حذف می‌شوند.
 */
const SCAFFOLD_ROUTES = new Set([
  '/identity-rbac',
  '/master-data',
  '/inventory',
  '/rules-engine',
  '/sales',
  '/tracking',
  '/finance',
  '/bi',
  '/portal',
  '/onboarding',
  '/billing',
  '/routing',
]);

const args = new Set(process.argv.slice(2));
const asJson = args.has('--json');
const allowDrift = args.has('--allow-drift');

// yaml در devDependency apps/api است؛ از همان‌جا resolve می‌شود تا اسکریپت ریشه
// بدون نصب اضافی کار کند (npm workspace آن را به node_modules ریشه hoist می‌کند).
const require_ = createRequire(path.join(ROOT, 'apps', 'api', 'package.json'));
const YAML = require_('yaml');

/** «GET /a/{}» — شکل نرمال‌شده برای مقایسه:
 *  سند OpenAPI پارامتر مسیر را {id} می‌نویسد و Nest آن را :id؛ نام پارامتر
 *  در دو طرف ممکن است فرق کند، پس هر دو به {} یکسان می‌شوند. */
const normalize = (p) =>
  (p.replace(/\{[^}]+\}/g, '{}').replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '{}').replace(/\/+$/, '') || '/');

/** عملیات‌های سند */
function specOperations() {
  const spec = YAML.parse(readFileSync(SPEC_FILE, 'utf8'));
  const ops = new Map();
  for (const [p, item] of Object.entries(spec.paths ?? {})) {
    for (const m of ['get', 'post', 'put', 'patch', 'delete']) {
      if (item?.[m]) ops.set(`${m.toUpperCase()} ${normalize(p)}`, `${m.toUpperCase()} ${p}`);
    }
  }
  return ops;
}

const controllerFiles = (() => {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (entry !== 'node_modules') walk(full);
      } else if (entry.endsWith('.controller.ts') || entry.endsWith('.module.ts')) {
        // برخی کنترلرهای info/stub داخل *.module.ts تعریف می‌شوند (bi/portal/routing/…)؛
        // بدون اسکن این فایل‌ها، drift آن‌ها را نمی‌دید ولی contract.api.test.ts
        // (که روت‌های زندهٔ express را می‌شمارد) می‌دید → ناهم‌ترازی دو ابزار.
        out.push(full);
      }
    }
  };
  walk(SRC_DIR);
  return out.sort();
})();

/** عملیات‌های کد — از روی decoratorهای @Controller و @Get/@Post/… */
function codeOperations() {
  const ops = new Map();
  const details = [];
  for (const file of controllerFiles) {
    const src = readFileSync(file, 'utf8');
    const controllers = [];
    const cRx = /@Controller\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)/g;
    let m;
    while ((m = cRx.exec(src))) controllers.push({ pos: m.index, base: m[1] ?? m[2] ?? '' });
    const mRx = /@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)/g;
    while ((m = mRx.exec(src))) {
      let base = '';
      for (const c of controllers) if (c.pos < m.index) base = c.base;
      const sub = m[2] ?? m[3] ?? '';
      const full =
        '/' +
        [base, sub]
          .filter(Boolean)
          .map((s) => s.replace(/^\/+/, '').replace(/\/+$/, ''))
          .join('/');
      const route = normalize(full);
      if (OUT_OF_CONTRACT.has(route) || OUT_OF_CONTRACT.has(full)) continue;
      if (SCAFFOLD_ROUTES.has(route) || SCAFFOLD_ROUTES.has(full)) continue;
      const key = `${m[1].toUpperCase()} ${route}`;
      ops.set(key, `${m[1].toUpperCase()} ${full}`);
      details.push({
        key,
        file: path.relative(ROOT, file),
      });
    }
  }
  return { ops, details };
}

const spec = specOperations();
const { ops: code, details } = codeOperations();

const codeOnly = [...code.keys()].filter((k) => !spec.has(k)).sort();
const specOnly = [...spec.keys()].filter((k) => !code.has(k)).sort();

// =====================================================================
// TASK-24F · MEDIUM-3 — تطبیقِ «شکل» نه فقط «مسیر»:
//   ۱) enumهای حیاتی باید با آرایه‌های منبعِ حقیقت در کد یکی باشند
//   ۲) فیلدهای requiredِ قرارداد باید با DTOهای واقعی (@IsDefined) یکی باشند
// بدونِ این بخش، drift=0 فقط می‌گفت مسیرها هم‌خوان‌اند (مثلِ requested_list/explicit_list
// که مدت‌ها بی‌صدا مانده بود).
// =====================================================================
const SPEC_OBJ = YAML.parse(readFileSync(SPEC_FILE, 'utf8'));
const ENGINE_FILE = path.join(SRC_DIR, 'modules', 'pricing', 'pricing-engine.ts');

const getAt = (obj, pathArr) => pathArr.reduce((acc, k) => (acc == null ? acc : acc[k]), obj);

/** آرایهٔ رشته‌ایِ `export const NAME = ['a', 'b'] as const;` از سورس تایپ‌اسکریپت */
function tsArrayConst(file, name) {
  const src = readFileSync(file, 'utf8');
  const rx = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`, 'm');
  const m = src.match(rx);
  if (!m) return null;
  return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
}

const ENUM_CONTRACTS = [
  {
    label: 'QuoteLineResult.pricing.scope',
    tsConst: 'PRICE_SCOPES',
    schemaPath: ['components', 'schemas', 'QuoteLineResult', 'properties', 'pricing', 'properties', 'scope', 'enum'],
  },
  {
    label: 'QuoteLineResult.margin.status',
    tsConst: 'MARGIN_STATUSES',
    schemaPath: ['components', 'schemas', 'QuoteLineResult', 'properties', 'margin', 'properties', 'status', 'enum'],
  },
  {
    label: 'QuoteResult.skipped_promotions[].reason',
    tsConst: 'SKIP_REASONS',
    schemaPath: [
      'components', 'schemas', 'QuoteResult', 'properties', 'skipped_promotions',
      'items', 'properties', 'reason', 'enum',
    ],
  },
  {
    label: 'QuoteResult.margin_violations[].code',
    tsConst: 'MARGIN_VIOLATION_CODES',
    schemaPath: [
      'components', 'schemas', 'QuoteResult', 'properties', 'margin_violations',
      'items', 'properties', 'code', 'enum',
    ],
  },
];

const enumDrift = [];
for (const c of ENUM_CONTRACTS) {
  const specEnum = getAt(SPEC_OBJ, c.schemaPath);
  const codeEnum = tsArrayConst(ENGINE_FILE, c.tsConst);
  if (!Array.isArray(specEnum) || !Array.isArray(codeEnum)) {
    enumDrift.push({
      label: c.label,
      problem: 'enum یا آرایهٔ منبع در کد یافت نشد',
      spec: specEnum ?? null,
      code: codeEnum ?? null,
    });
    continue;
  }
  const a = [...specEnum].sort();
  const b = [...codeEnum].sort();
  if (a.join('|') !== b.join('|')) {
    enumDrift.push({ label: c.label, problem: 'مقادیر هم‌خوان نیستند', spec: a, code: b });
  }
}

/** فیلدهای requiredِ یک DTO از روی @IsDefined() */
function dtoRequiredFields(file, className) {
  const src = readFileSync(file, 'utf8');
  const start = src.indexOf(`export class ${className} `);
  if (start < 0) return null;
  const rest = src.slice(start + 1);
  const nextClass = rest.search(/export class /);
  const body = nextClass < 0 ? rest : rest.slice(0, nextClass);
  const lines = body.split('\n');
  const required = [];
  let pending = false;
  for (const line of lines) {
    if (line.includes('@IsDefined()')) pending = true;
    const field = line.match(/^\s{2}([A-Za-z0-9_]+)\??\s*:/);
    if (field) {
      if (pending) required.push(field[1]);
      pending = false;
    }
  }
  return required.sort();
}

const REQUIRED_CONTRACTS = [
  {
    label: 'POST /pricing/quote (PriceQuoteRequest ↔ QuoteRequestDto)',
    dtoFile: path.join(SRC_DIR, 'modules', 'pricing', 'pricing.dto.ts'),
    className: 'QuoteRequestDto',
    schema: 'PriceQuoteRequest',
  },
  {
    label: 'POST /orders (SalesOrder ↔ CreateOrderDto)',
    dtoFile: path.join(SRC_DIR, 'modules', 'sales', 'order.dto.ts'),
    className: 'CreateOrderDto',
    schema: 'SalesOrder',
  },
];

const requiredDrift = [];
for (const c of REQUIRED_CONTRACTS) {
  const specRequired = (getAt(SPEC_OBJ, ['components', 'schemas', c.schema, 'required']) ?? []).slice().sort();
  const dtoRequired = dtoRequiredFields(c.dtoFile, c.className);
  if (!dtoRequired) {
    requiredDrift.push({ label: c.label, problem: 'DTO یافت نشد', spec: specRequired, dto: null });
    continue;
  }
  if (specRequired.join('|') !== dtoRequired.join('|')) {
    requiredDrift.push({
      label: c.label,
      problem: 'فیلدهای required هم‌خوان نیستند',
      spec: specRequired,
      dto: dtoRequired,
    });
  }
}


if (asJson) {
  console.log(
    JSON.stringify(
      {
        spec_operations: spec.size,
        code_operations: code.size,
        code_without_spec: codeOnly.map((k) => code.get(k)),
        spec_without_code: specOnly.map((k) => spec.get(k)),
        enum_drift: enumDrift,
        required_drift: requiredDrift,
      },
      null,
      2,
    ),
  );
} else {
  console.log(
    `قرارداد: ${spec.size} عملیات | کد: ${code.size} عملیات | ` +
      `اشتراک: ${spec.size - specOnly.length}`,
  );
  console.log(`\n▸ کد بدون سند (${codeOnly.length}) — باید مستند یا حذف شود:`);
  for (const k of codeOnly) {
    const d = details.find((x) => x.key === k);
    console.log(`   ${code.get(k).padEnd(42)} ${d?.file ?? ''}`);
  }
  console.log(`\n▸ سند بدون کد (${specOnly.length}) — باید پیاده‌سازی یا از سند حذف شود:`);
  for (const k of specOnly) console.log(`   ${spec.get(k)}`);
  console.log(`\n▸ واگراییِ enum (${enumDrift.length}) — enum قرارداد باید با آرایهٔ منبعِ کد یکی باشد:`);
  for (const d of enumDrift) {
    console.log(`   ${d.label}: ${d.problem}`);
    if (d.spec) console.log(`      قرارداد: ${JSON.stringify(d.spec)}`);
    if (d.code) console.log(`      کد      : ${JSON.stringify(d.code)}`);
  }
  console.log(`\n▸ واگراییِ required (${requiredDrift.length}) — @IsDefined در DTO باید با requiredِ سند یکی باشد:`);
  for (const d of requiredDrift) {
    console.log(`   ${d.label}: ${d.problem}`);
    if (d.spec) console.log(`      قرارداد: ${JSON.stringify(d.spec)}`);
    if (d.dto) console.log(`      DTO     : ${JSON.stringify(d.dto)}`);
  }
}

const drift = codeOnly.length + specOnly.length + enumDrift.length + requiredDrift.length;
if (drift > 0 && !allowDrift) {
  console.error(`\n✗ ${drift} اختلاف قرارداد/کد — CI باید شکست بخورد.`);
  process.exit(1);
}
if (drift === 0) console.log('\n✓ قرارداد و کد کاملاً هم‌تراز هستند.');
process.exit(0);
