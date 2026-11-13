/**
 * TASK-PM-02-C12 — تستِ شاخصِ سایه و موتورِ برخورد.
 *
 * همهٔ داده‌ها ساختگی‌اند. این تست هیچ چیزی را فعال نمی‌کند.
 */
import { describe, it, expect } from 'vitest';
import {
  buildShadowIndex,
  detectCollisions,
  collisionId,
  COLLISION_CATEGORIES,
  NORMALIZATION_CONTRACT_VERSION,
  FIELD_TO_PROFILE,
  type CollisionCategory,
} from '../src/modules/master-data/experimental/shadow-identity-index.candidate';
import {
  SMALL_FIXTURE,
  EMPTY_FIXTURE,
  SINGLE_FIXTURE,
  COMPANY_A,
  COMPANY_B,
} from './fixtures/c12-synthetic-identities';
import { toSourceRows } from '../src/modules/master-data/experimental/shadow-identity-migration.candidate';

const FIXED_NOW = () => new Date('2026-11-13T00:00:00.000Z');
const index = buildShadowIndex(toSourceRows(SMALL_FIXTURE), { now: FIXED_NOW });
const ledger = detectCollisions(index);

describe('C12 / 1 — shadow index construction', () => {
  it('produces one shadow entry per source row and never drops a row', () => {
    expect(index.entries.length).toBe(SMALL_FIXTURE.length);
    expect(index.stats.rows_in).toBe(SMALL_FIXTURE.length);
    expect(index.stats.entries).toBe(SMALL_FIXTURE.length);
  });

  it('carries the full provenance tuple required by the spec', () => {
    const e = index.entries[0];
    expect(e.entity_id).toBeTruthy();
    expect(e.company_id).toBeTruthy();
    expect(e.display_value).toBeTruthy();
    expect(e.stored_normalized).toBeTruthy();
    expect(e.profile).toBe(FIELD_TO_PROFILE[e.field]);
    expect(e.profile_version).toBe(NORMALIZATION_CONTRACT_VERSION);
    expect(e.source_ref).toBeTruthy();
    // proposed_key یا رشته است یا null (با دلیل)
    expect(e.proposed_key !== null || e.invalid_reason !== null).toBe(true);
  });

  it('maps every identity field to exactly one profile', () => {
    expect(FIELD_TO_PROFILE).toEqual({
      name: 'ProductName',
      name_latin: 'ProductNameLatin',
      alias: 'ProductAlias',
      code: 'ProductCode',
      barcode: 'Barcode',
    });
  });

  it('NEVER mutates the display value (核心 safety rule)', () => {
    for (const e of index.entries) {
      const src = SMALL_FIXTURE.find((r) => r.row_id === e.source_ref);
      expect(e.display_value).toBe(src?.display_value);
    }
  });

  it('reports invalid input explicitly instead of silently stripping it', () => {
    const bad = index.entries.find((e) => e.source_ref === 'A-p16-code');
    expect(bad).toBeDefined();
    expect(bad?.proposed_key).toBeNull();
    expect(bad?.invalid_reason).toBe('invalid_character');
    expect(index.stats.invalid).toBeGreaterThanOrEqual(1);
  });

  it('is deterministic: same input twice → identical entries', () => {
    const again = buildShadowIndex(toSourceRows(SMALL_FIXTURE), { now: FIXED_NOW });
    expect(JSON.stringify(again.entries)).toBe(JSON.stringify(index.entries));
    expect(again.built_at_iso).toBe(index.built_at_iso);
  });

  it('is order-independent for the collision ledger (stable identifiers)', () => {
    const reversed = buildShadowIndex(toSourceRows([...SMALL_FIXTURE].reverse()), { now: FIXED_NOW });
    const l2 = detectCollisions(reversed);
    const idsA = ledger.collisions.map((c) => c.collision_id).sort();
    const idsB = l2.collisions.map((c) => c.collision_id).sort();
    expect(idsA).toEqual(idsB);
  });
});

describe('C12 / 2 — collision coverage (all twelve categories)', () => {
  it('declares exactly twelve categories', () => {
    expect(COLLISION_CATEGORIES.length).toBe(12);
  });

  it('finds at least one representative collision for EVERY declared category', () => {
    // نکتهٔ مهم: این تست پیش‌تر فهرستِ «انتظاری» را دستی نگه می‌داشت و همین باعث شد
    // دستهٔ `alias_to_product_name` در اعلان وجود داشته باشد ولی هیچ fixture‌ای
    // آن را تمرین نکند (۱۱ از ۱۲). اکنون مستقیماً از خودِ قرارداد مشتق می‌شود.
    const cats = new Map<string, number>();
    for (const c of ledger.collisions) cats.set(c.category, (cats.get(c.category) ?? 0) + 1);
    const missing = COLLISION_CATEGORIES.filter((c) => !cats.has(c));
    expect(missing, `categories with no fixture evidence: ${missing.join(', ')}`).toEqual([]);
    expect(cats.size).toBe(12);
  });

  it('every collision category in the ledger is a declared category', () => {
    const declared = new Set<string>(COLLISION_CATEGORIES);
    for (const c of ledger.collisions) expect(declared.has(c.category)).toBe(true);
  });

  it('every collision is reproducible (identical re-run)', () => {
    const l2 = detectCollisions(index);
    expect(JSON.stringify(l2.collisions)).toBe(JSON.stringify(ledger.collisions));
  });

  it('every collision carries a stable, content-derived identifier', () => {
    for (const c of ledger.collisions) {
      expect(c.collision_id).toMatch(/^COL-[a-z_]+-[0-9a-f]{8}$/);
      expect(c.message_fa.length).toBeGreaterThan(0);
      expect(c.parties.length).toBeGreaterThan(0);
      expect(c.provenance.length).toBeGreaterThan(0);
    }
    // هیچ شناسهٔ تکراری‌ای بدونِ تفاوت در محتوا نباید باشد
    const ids = ledger.collisions.map((c) => c.collision_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('collisionId is stable regardless of party order', () => {
    const a = collisionId('alias_to_alias', COMPANY_A, 'x', [
      { entity_id: 'e1', field: 'alias' },
      { entity_id: 'e2', field: 'alias' },
    ]);
    const b = collisionId('alias_to_alias', COMPANY_A, 'x', [
      { entity_id: 'e2', field: 'alias' },
      { entity_id: 'e1', field: 'alias' },
    ]);
    expect(a).toBe(b);
    const c = collisionId('alias_to_alias', COMPANY_B, 'x', [
      { entity_id: 'e1', field: 'alias' },
      { entity_id: 'e2', field: 'alias' },
    ]);
    expect(c).not.toBe(a); // شرکتِ متفاوت ⇒ شناسهٔ متفاوت
  });

  it('classifies severe collisions as hard and informational ones as soft/review', () => {
    const byCat = new Map(ledger.collisions.map((c) => [c.category, c.severity]));
    expect(byCat.get('alias_to_barcode')).toBe('hard');
    expect(byCat.get('alias_to_product_code')).toBe('hard');
    expect(byCat.get('barcode_collision')).toBe('hard');
    expect(byCat.get('legacy_vs_proposed')).toBe('soft');
    expect(byCat.get('cross_company')).toBe('review');
  });

  it('flags collisions that current normalization would NOT see (newly exposed)', () => {
    // برخوردِ كوكا/کوکا امروز پنهان است چون normalizeText(فعلی) حروف را یکی نمی‌کند.
    const alias = ledger.collisions.find((c) => c.category === 'alias_to_alias');
    expect(alias).toBeDefined();
    expect(alias?.visible_under_current_normalization).toBe(false);
    expect(ledger.newly_exposed).toBeGreaterThan(0);
  });

  it('demonstrates the alias↔barcode collision that is missed today', () => {
    const ab = ledger.collisions.find((c) => c.category === 'alias_to_barcode');
    expect(ab).toBeDefined();
    expect(ab?.severity).toBe('hard');
    // طرفین باید alias و barcode باشند
    const fields = new Set(ab?.parties.map((p) => p.field));
    expect(fields.has('alias')).toBe(true);
    expect(fields.has('barcode')).toBe(true);
  });
});

describe('C12 / 3 — tenant isolation (never weaken RLS)', () => {
  it('no in-company collision ever mixes two company ids', () => {
    for (const c of ledger.collisions) {
      if (c.category === 'cross_company') continue;
      const companies = new Set(c.parties.map((p) => {
        const src = SMALL_FIXTURE.find((r) => r.row_id === p.source_ref);
        return src?.company_id;
      }));
      expect(companies.size).toBe(1);
      expect(c.company_id).toBe([...companies][0]);
    }
  });

  it('a collision in one company is NOT automatically a global conflict', () => {
    const cross = ledger.collisions.filter((c) => c.category === 'cross_company');
    expect(cross.length).toBeGreaterThan(0);
    // پیش‌فرض: شدتِ review، نه hard
    for (const c of cross) expect(c.severity).toBe('review');
    expect(ledger.options.crossCompanyIsConflict).toBe(false);
  });

  it('cross-company detection only escalates when an approved rule says so', () => {
    const strict = detectCollisions(index, { crossCompanyIsConflict: true });
    const crossStrict = strict.collisions.filter((c) => c.category === 'cross_company');
    // همین تعداد برخورد، ولی پیامِ متفاوت (تعارضِ مصوب)
    expect(crossStrict.length).toBe(ledger.collisions.filter((c) => c.category === 'cross_company').length);
    expect(crossStrict[0]?.message_fa).toContain('قاعدهٔ مصوب');
  });

  it('same alias in two companies is allowed (not hard)', () => {
    // كوكا در A و کوکا در B: در A برخوردِ درون‌شرکتی هست، ولی بین A و B فقط اطلاع
    const hard = ledger.collisions.filter(
      (c) => c.severity === 'hard' && new Set(c.parties.map((p) => p.source_ref)).size > 1 &&
        c.parties.some((p) => p.source_ref.startsWith('B-')),
    );
    expect(hard.length).toBe(0);
  });
});

describe('C12 / 4 — edge datasets', () => {
  it('empty dataset produces no collisions and no crash', () => {
    const idx = buildShadowIndex(toSourceRows(EMPTY_FIXTURE), { now: FIXED_NOW });
    const led = detectCollisions(idx);
    expect(idx.entries.length).toBe(0);
    expect(led.summary.total).toBe(0);
    expect(led.newly_exposed).toBe(0);
  });

  it('single-row dataset produces no collision', () => {
    const idx = buildShadowIndex(toSourceRows(SINGLE_FIXTURE), { now: FIXED_NOW });
    const led = detectCollisions(idx);
    expect(led.summary.total).toBe(0);
  });

  it('rejects an unknown identity field loudly instead of skipping it', () => {
    expect(() =>
      buildShadowIndex([
        { entity_id: 'x', company_id: 'c', field: 'bogus' as never, display_value: 'v', stored_normalized: 'v', source_ref: 'r' },
      ]),
    ).toThrow(/unknown identity field/);
  });
});

describe('C12 / 11 — isolation guard (experimental code must stay off production paths)', () => {
  it('the shadow index and migration simulator are imported only by their own tests', async () => {
    const { execSync } = await import('node:child_process');
    const cmd =
      "grep -rEl \"from '[^']*shadow-identity-(index|migration)\\.candidate'\" src test --include=*.ts || true";
    let out = '';
    try {
      out = execSync(cmd, { cwd: process.cwd(), encoding: 'utf8' });
    } catch {
      out = '';
    }
    const files = out
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean)
      .filter((f) => !/shadow-identity-(index|migration)\.candidate\.ts$/.test(f));
    // مجاز: تست‌های خودِ C12 و fixture مصنوعی (که فقط برای نوعِ IdentityRecord import می‌کند).
    const forbidden = files.filter((f) => !/^test\/(c12-.*\.test\.ts|fixtures\/c12-.*\.ts)$/.test(f));
    expect(forbidden, `unexpected import of experimental C12 code: ${forbidden.join(', ')}`).toEqual([]);
  });

  it('the C11 candidate normalizer is still imported only by its own test', async () => {
    const { execSync } = await import('node:child_process');
    let out = '';
    try {
      out = execSync(
        "grep -rl 'product-identity-normalization\\.candidate' src test --include=*.ts " +
          "| grep -v 'product-identity-normalization.candidate.ts' " +
          "| grep -v 'c11-normalization-contract.test.ts' " +
          "| grep -v 'shadow-\\(identity-index\\|identity-migration\\)\\.candidate.ts' " +
          "| grep -v 'c12-shadow-index.test.ts' | grep -v 'c12-migration-simulation.test.ts' || true",
        { cwd: process.cwd(), encoding: 'utf8' },
      );
    } catch {
      out = '';
    }
    expect(out.trim()).toBe('');
  });
});
