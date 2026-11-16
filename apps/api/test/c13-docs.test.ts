/**
 * C13-DOCS-01 — تستِ سازگاریِ اسنادِ C13 (سبک‌وزن؛ هیچ زیرساختِ جدیدی اضافه نمی‌کند).
 * فقط توکن‌هایِ ساختاری را می‌سنجد، نه نثر را.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), '../..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

const DASHBOARD = 'docs/product-inventory/C13-STATUS-DASHBOARD.md';
const REGISTER = 'docs/product-inventory/OWNER-DECISION-REGISTER.md';
const SEQUENCE = 'docs/product-inventory/IMPLEMENTATION_SEQUENCE.md';
const DEPMAP = 'docs/product-inventory/DEPENDENCY_MAP.md';
const SAMPLE = 'docs/product-inventory/evidence/task-pm-02/EVIDENCE-C13B-SYNTHETIC-SAMPLE.json';

describe('C13-DOCS / ۱ — وجودِ اسنادِ کانونی', () => {
  for (const rel of [DASHBOARD, REGISTER, SEQUENCE, DEPMAP, SAMPLE]) {
    it(`فایلِ ${rel} وجود دارد`, () => {
      expect(existsSync(join(ROOT, rel))).toBe(true);
    });
  }
});

describe('C13-DOCS / ۲ — داشبورد سه حالتِ متمایز را جدا نگه می‌دارد', () => {
  const md = read(DASHBOARD);

  it('PASS / BLOCKED / UNVERIFIED هر سه صریح‌اند', () => {
    expect(md).toContain('PASS');
    expect(md).toContain('BLOCKED');
    expect(md).toContain('UNVERIFIED');
  });

  it('هر ۱۰ محورِ الزام‌شده حاضر است', () => {
    for (const n of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']) {
      expect(md).toMatch(new RegExp(`\\|\\s*${n}\\s*\\|`));
    }
  });

  it('ادعای صریحِ «۱۱۵ یافتهٔ synthetic = یافتهٔ تولید نیست» وجود دارد', () => {
    expect(md).toContain('115');
    expect(md).toMatch(/تنها synthetic|فقط synthetic|یافتهٔ تولید نیست/);
  });

  it('وضعیتِ بازبینیِ مستقل و CI صريحاً UNVERIFIED/BLOCKED‌اند', () => {
    expect(md).toMatch(/بازبینیِ مستقل[\s\S]{0,40}UNVERIFIED/);
    expect(md).toMatch(/\*\*CI\*\*[\s\S]{0,30}BLOCKED/);
  });

  it('هیچ‌کجا C13 «عملیاتی/فعال» اعلام نمی‌شود', () => {
    expect(md).not.toMatch(/C13\s*(کامل فعال|فعال شد|production-ready|عملیاتی است)/i);
  });
});

describe('C13-DOCS / ۳ — رجیسترِ تصمیماتِ مالک کامل و صادق است', () => {
  const md = read(REGISTER);

  it('هر ۸ شناسهٔ درخواستی ثبت شده‌اند', () => {
    for (const id of ['D-C11-3', 'D-C12-3', 'D-C13-1', 'D-C13-2', 'D-C13-3', 'D-C13X-1', 'D-C13X-2', 'D-C13X-3']) {
      expect(md).toContain(id);
    }
  });

  it('D-C13-2 و D-C13-3 صريحاً UNKNOWN/نامشخص‌اند و نه جعل‌شده', () => {
    expect(md).toMatch(/D-C13-2[\s\S]*?UNKNOWN/);
    expect(md).toMatch(/D-C13-3[\s\S]*?UNKNOWN/);
  });

  it('صفر تصویب صريح است', () => {
    expect(md).toMatch(/صفر تصمیم تصویب|هیچ‌کدام[^\n]*تصویب/);
  });

  it('هر تصمیم فیلدهای «شاهد» و «تصمیم‌گیر» و «پیامدِ باز گذاشتن» دارد', () => {
    for (const id of ['D-C11-3', 'D-C12-3', 'D-C13-1', 'D-C13X-1', 'D-C13X-2', 'D-C13X-3']) {
      const section = md.split(`## ${id}`)[1]?.split('\n## ')[0] ?? '';
      expect(section, `${id} شاهد`).toMatch(/شاهدِ موردنیاز/);
      expect(section, `${id} تصمیم‌گیر`).toMatch(/تصمیم‌گیرِ مجاز/);
      expect(section, `${id} پیامد`).toMatch(/پیامدِ باز گذاشتن/);
    }
  });
});

describe('C13-DOCS / ۴ — نقشهٔ راه و وابستگی، C13 را قابل‌کشف و مسدود نشان می‌دهند', () => {
  it('IMPLEMENTATION_SEQUENCE به Track A/B و وابستگی‌ها اشاره می‌کند', () => {
    const md = read(SEQUENCE);
    expect(md).toContain('C13-B');
    expect(md).toContain('c13xt.1');
    expect(md).toContain('c13b.1');
    expect(md).toContain('D-C13X-1');
    expect(md).toContain('OWNER-DECISION-REGISTER');
    expect(md).toMatch(/BLOCKED/);
  });

  it('DEPENDENCY_MAP لایهٔ C11→C12→C13→C13XT→C13-B را با وضعیتِ صریح نشان می‌دهد', () => {
    const md = read(DEPMAP);
    for (const token of ['C11', 'C12', 'C13', 'C13XT', 'C13-B', 'c13b.1', 'D-C13X-1']) {
      expect(md).toContain(token);
    }
    expect(md).toMatch(/BLOCKED/);
    expect(md).toMatch(/replica/i);
  });

  it('هیچ‌کدام از این اسناد C13-B را «تکمیل‌شده/اجراشده» اعلام نمی‌کنند', () => {
    for (const rel of [SEQUENCE, DEPMAP]) {
      const md = read(rel);
      expect(md).not.toMatch(/C13-B[^\n]*(اجرا شد|تکمیل شد|done)/i);
    }
  });
});

describe('C13-DOCS / ۵ — نمونهٔ synthetic همچنان synthetic است', () => {
  it('برچسب‌ها و مرزها دست‌نخورده‌اند', () => {
    const rep = JSON.parse(read(SAMPLE));
    expect(rep.data_classification).toBe('SYNTHETIC');
    expect(rep.contains_organizational_data).toBe(false);
    expect(rep.authorization).toBeNull();
    expect(rep.verdict.real_data_status).toBe('UNVERIFIED — SYNTHETIC ONLY');
  });
});
