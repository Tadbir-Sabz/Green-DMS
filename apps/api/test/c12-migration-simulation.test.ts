/**
 * TASK-PM-02-C12 — تستِ شبیه‌سازیِ مهاجرت، idempotency، قطع/بازیابی، rollback و کارایی.
 *
 * همهٔ داده‌ها ساختگی و در حافظه‌اند. هیچ پایگاه‌داده، فایل یا رفتارِ تولیدی درگیر نیست.
 */
import { describe, it, expect } from 'vitest';
import {
  runSimulation,
  resumeSimulation,
  rollback,
  equivalentStates,
  initialState,
  toSourceRows,
  type MigrationConfigAlias,
} from '../src/modules/master-data/experimental/shadow-identity-migration.candidate';
import {
  SMALL_FIXTURE,
  EMPTY_FIXTURE,
  makeLargeFixture,
  COMPANY_A,
} from './fixtures/c12-synthetic-identities';

const CFG = { batch_size: 4 };

describe('C12 / 5 — migration simulation, idempotency & no mutation', () => {
  it('runs a full simulation and recalculates keys', () => {
    const r = runSimulation(SMALL_FIXTURE, CFG);
    expect(r.interrupted).toBe(false);
    expect(r.rows_recalculated).toBeGreaterThan(0);
    expect(r.contract_version).toBeTruthy();
  });

  it('NEVER changes a display value', () => {
    const r = runSimulation(SMALL_FIXTURE, CFG);
    expect(r.display_values_preserved).toBe(SMALL_FIXTURE.length);
    for (const rec of SMALL_FIXTURE) {
      const after = r.final_state.records.get(rec.row_id);
      expect(after?.display_value).toBe(rec.display_value);
    }
  });

  it('only recalculates rows whose proposed key differs from the stored one', () => {
    const r = runSimulation(SMALL_FIXTURE, CFG);
    // ردیفِ invalid (AB/99) باید دست‌نخورده بماند
    const invalid = r.final_state.records.get('A-p16-code');
    expect(invalid?.stored_normalized).toBe('AB/99');
  });

  it('is idempotent: running twice yields the same final state', () => {
    const once = runSimulation(SMALL_FIXTURE, CFG);
    // اجرای دوم روی همان ورودیِ اصلی — نه روی state
    const twice = runSimulation(SMALL_FIXTURE, CFG);
    expect(equivalentStates(once.final_state, twice.final_state)).toBe(true);
  });

  it('is idempotent at the operation level (re-applying does not double count)', () => {
    const first = runSimulation(SMALL_FIXTURE, CFG);
    // ادامه‌دادنِ حالتِ کامل باید صفر عملیاتِ تازه انجام دهد
    const again = resumeSimulation(first.final_state, CFG);
    expect(again.ops_applied).toBe(0);
    expect(equivalentStates(first.final_state, again.final_state)).toBe(true);
  });

  it('batch size does not change the outcome', () => {
    const b1 = runSimulation(SMALL_FIXTURE, { batch_size: 1 });
    const b16 = runSimulation(SMALL_FIXTURE, { batch_size: 16 });
    expect(equivalentStates(b1.final_state, b16.final_state)).toBe(true);
    expect(b16.batches).toBeLessThan(b1.batches);
  });

  it('rejects an invalid batch size loudly', () => {
    expect(() => runSimulation(SMALL_FIXTURE, { batch_size: 0 })).toThrow(/batch_size/);
  });
});

describe('C12 / 6 — interruption and recovery', () => {
  it('stops mid-way when a failure is injected', () => {
    const r = runSimulation(SMALL_FIXTURE, { batch_size: 4, fail_after_ops: 5 });
    expect(r.interrupted).toBe(true);
    expect(r.ops_applied).toBe(5);
    expect(r.rows_recalculated).toBeLessThan(SMALL_FIXTURE.length);
  });

  it('recovers from an interrupted run and reaches the same final state', () => {
    const full = runSimulation(SMALL_FIXTURE, CFG);
    const interrupted = runSimulation(SMALL_FIXTURE, { batch_size: 4, fail_after_ops: 5 });
    expect(interrupted.interrupted).toBe(true);

    const resumed = resumeSimulation(interrupted.final_state, CFG);
    expect(resumed.interrupted).toBe(false);
    expect(equivalentStates(resumed.final_state, full.final_state)).toBe(true);
  });

  it('survives repeated interruptions until completion', () => {
    const full = runSimulation(SMALL_FIXTURE, CFG);
    let state = runSimulation(SMALL_FIXTURE, { batch_size: 2, fail_after_ops: 3 }).final_state;
    let guard = 0;
    // تا رسیدن به پایان ادامه می‌دهیم (هر بار ۳ عملیات)
    while (guard < 50) {
      const r = resumeSimulation(state, { batch_size: 2, fail_after_ops: 3 });
      state = r.final_state;
      if (!r.interrupted) break;
      guard += 1;
    }
    expect(equivalentStates(state, full.final_state)).toBe(true);
  });

  it('interrupted state never leaves a row half-written (display intact)', () => {
    const r = runSimulation(SMALL_FIXTURE, { batch_size: 4, fail_after_ops: 3 });
    expect(r.display_values_preserved).toBe(SMALL_FIXTURE.length);
  });
});

describe('C12 / 7 — rollback', () => {
  it('restores every backed-up value exactly', () => {
    const r = runSimulation(SMALL_FIXTURE, CFG);
    const rb = rollback(r.final_state);
    expect(rb.unrecovered).toEqual([]);
    for (const rec of SMALL_FIXTURE) {
      expect(rb.state.records.get(rec.row_id)?.stored_normalized).toBe(rec.stored_normalized);
    }
  });

  it('rollback is exact after an interrupted migration', () => {
    const original = initialState(SMALL_FIXTURE);
    const r = runSimulation(SMALL_FIXTURE, { batch_size: 4, fail_after_ops: 7 });
    const rb = rollback(r.final_state);
    for (const rec of SMALL_FIXTURE) {
      expect(rb.state.records.get(rec.row_id)?.stored_normalized).toBe(original.records.get(rec.row_id)?.stored_normalized);
    }
  });

  it('rollback never touches display values', () => {
    const r = runSimulation(SMALL_FIXTURE, CFG);
    const rb = rollback(r.final_state);
    for (const rec of SMALL_FIXTURE) {
      expect(rb.state.records.get(rec.row_id)?.display_value).toBe(rec.display_value);
    }
  });

  it('reports unrecoverable rows honestly instead of guessing', () => {
    // حالتی را می‌سازیم که backup برای یک ردیف وجود ندارد
    const r = runSimulation(SMALL_FIXTURE, CFG);
    const broken = {
      ...r.final_state,
      backup: new Map([...r.final_state.backup].filter(([k]) => k !== 'A-p1-alias')),
    };
    const rb = rollback(broken);
    expect(rb.unrecovered.length).toBeGreaterThan(0);
  });

  it('a migratе→rollback cycle returns the store to its original identity keys', () => {
    const before = initialState(SMALL_FIXTURE);
    const r = runSimulation(SMALL_FIXTURE, CFG);
    const rb = rollback(r.final_state);
    expect(equivalentStates(before, rb.state)).toBe(true);
  });
});

describe('C12 / 8 — multi-company isolation in the simulation', () => {
  it('keeps company_id untouched for every row', () => {
    const r = runSimulation(SMALL_FIXTURE, CFG);
    for (const rec of SMALL_FIXTURE) {
      expect(r.final_state.records.get(rec.row_id)?.company_id).toBe(rec.company_id);
    }
  });

  it('does not leak a company-A key into company-B rows', () => {
    const r = runSimulation(SMALL_FIXTURE, CFG);
    // کدِ AB-12 در هر دو شرکت وجود دارد و باید در هر شرکت مستقل بماند
    const a = r.final_state.records.get('A-p4-code');
    const b = r.final_state.records.get('B-p2-code');
    expect(a?.company_id).toBe(COMPANY_A);
    expect(b?.company_id).not.toBe(COMPANY_A);
    expect(a?.stored_normalized).toBe('ab-12');
    expect(b?.stored_normalized).toBe('ab-12');
  });

  it('the ledger contains no hard collision spanning two companies', () => {
    const r = runSimulation(SMALL_FIXTURE, CFG);
    for (const c of r.ledger.collisions) {
      if (c.severity !== 'hard') continue;
      const companies = new Set(
        c.parties.map((p) => SMALL_FIXTURE.find((x) => x.row_id === p.source_ref)?.company_id),
      );
      expect(companies.size).toBe(1);
    }
  });
});

describe('C12 / 9 — edge datasets in the simulation', () => {
  it('handles an empty dataset', () => {
    const r = runSimulation(EMPTY_FIXTURE, CFG);
    expect(r.rows_recalculated).toBe(0);
    expect(r.ledger.summary.total).toBe(0);
    expect(r.display_values_preserved).toBe(0);
  });

  it('handles a dataset where every row is invalid gracefully', () => {
    const rows = [
      { row_id: 'x1', entity_id: 'x', company_id: COMPANY_A, field: 'code' as const, display_value: 'A/B', stored_normalized: 'A/B' },
      { row_id: 'x2', entity_id: 'y', company_id: COMPANY_A, field: 'code' as const, display_value: 'C#D', stored_normalized: 'C#D' },
    ];
    const r = runSimulation(rows, CFG);
    expect(r.rows_recalculated).toBe(0);
    expect(r.display_values_preserved).toBe(2);
  });
});

describe('C12 / 10 — performance at multiple dataset sizes', () => {
  it('measures build+detect+simulate at 100, 1k and 5k rows', () => {
    const sizes = [100, 1000, 5000];
    const results: Array<{ n: number; ms: number; collisions: number; hard: number }> = [];
    for (const n of sizes) {
      const data = makeLargeFixture(n);
      const t0 = performance.now();
      const r = runSimulation(data, { batch_size: 250 });
      const ms = performance.now() - t0;
      results.push({ n, ms: Math.round(ms), collisions: r.ledger.summary.total, hard: r.ledger.summary.hard });
      // اطمینان از اینکه هیچ مقدارِ نمایشی عوض نشده
      expect(r.display_values_preserved).toBe(n);
      expect(r.interrupted).toBe(false);
    }
    console.log(`C12-PERF|${JSON.stringify(results)}`);
    // خطی‌بودنِ تقریبی: ۵۰ برابر داده نباید بیش از ۲۰۰ برابر زمان ببرد
    expect(results[2].ms).toBeLessThan(Math.max(2000, results[0].ms * 200));
  });

  it('memory stays bounded (no per-row retention beyond the index itself)', () => {
    const n = 2000;
    const data = makeLargeFixture(n);
    const before = process.memoryUsage().heapUsed;
    const r = runSimulation(data, { batch_size: 500 });
    const after = process.memoryUsage().heapUsed;
    const growthMb = (after - before) / (1024 * 1024);
    console.log(`C12-MEM|rows=${n}|heapGrowthMb=${growthMb.toFixed(1)}`);
    expect(r.ledger.summary.rows_considered).toBeGreaterThan(0);
    // سقفِ سخاوتمندانه: ۲۰۰۰ ردیف نباید بیش از ۲۰۰ مگابایت heap بگیرد
    expect(growthMb).toBeLessThan(200);
  });
});
