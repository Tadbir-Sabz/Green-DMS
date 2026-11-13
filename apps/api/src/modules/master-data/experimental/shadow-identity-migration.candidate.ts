/**
 * TASK-PM-02-C12 — شبیه‌سازِ مهاجرت (migration simulation) — **کاملاً در حافظه**.
 *
 * ⚠️ آزمایشی و غیرفعال. هیچ دسترسی به پایگاه‌دادهٔ واقعی ندارد، هیچ فایلی نمی‌نویسد و
 * هیچ رکوردی را تغییر نمی‌دهد. تنها مصرف‌کننده: `test/c12-migration-simulation.test.ts`.
 *
 * هدف: اثباتِ اینکه می‌توان یک مهاجرتِ **قابلِ‌بازگشت، idempotent، دسته‌ای و
 * مقاوم به قطع** را روی دادهٔ ساختگی اجرا کرد، **بدونِ** تغییرِ مقدارِ اصلی.
 *
 * مدلِ داده:
 *   - `store` نقشِ جدولِ هویتی را دارد (فقط در حافظه).
 *   - `shadow` نقشِ شاخصِ سایه را دارد: کلیدِ نامزد در کنارِ مقدارِ اصلی.
 *   - `backup` نقشِ نسخهٔ پشتیبانِ ستون‌های هویتی را دارد (پیش‌شرطِ rollback).
 *   - `applied_ops` نقشِ لاگِ عملیات را دارد (برای idempotency و بازیابی).
 */

import {
  buildShadowIndex,
  detectCollisions,
  NORMALIZATION_CONTRACT_VERSION,
  type IdentitySourceRow,
  type ConflictLedger,
  type ShadowIndex,
} from './shadow-identity-index.candidate';

// ---------------------------------------------------------------------------
// مدلِ «جدول»
// ---------------------------------------------------------------------------

export interface IdentityRecord {
  readonly row_id: string;
  readonly entity_id: string;
  readonly company_id: string;
  readonly field: 'name' | 'name_latin' | 'alias' | 'code' | 'barcode';
  /** مقدارِ نمایشیِ اصلی — **هرگز تغییر نمی‌کند** */
  readonly display_value: string;
  /** مقدارِ نرمال‌شدهٔ ذخیره‌شده (alias_norm و مانندِ آن) — هدفِ بازمحاسبه */
  stored_normalized: string;
}

/** وضعیتِ یک ردیف در طولِ شبیه‌سازی */
export type RowPhase = 'original' | 'shadowed' | 'backed_up' | 'recalculated' | 'verified' | 'rolled_back';

export interface MigrationState {
  readonly records: ReadonlyMap<string, IdentityRecord>;
  readonly phases: ReadonlyMap<string, RowPhase>;
  readonly applied_ops: ReadonlySet<string>;
  readonly backup: ReadonlyMap<string, string>;
  readonly cursor: number;
  readonly aborted: boolean;
  readonly abort_reason: string | null;
}

export function initialState(records: readonly IdentityRecord[]): MigrationState {
  const m = new Map<string, IdentityRecord>();
  for (const r of records) {
    if (m.has(r.row_id)) throw new Error(`duplicate row_id: ${r.row_id}`);
    m.set(r.row_id, r);
  }
  return {
    records: m,
    phases: new Map([...m.keys()].map((k) => [k, 'original' as RowPhase])),
    applied_ops: new Set(),
    backup: new Map(),
    cursor: 0,
    aborted: false,
    abort_reason: null,
  };
}

/** تبدیلِ رکوردها به ورودیِ شاخصِ سایه */
export function toSourceRows(records: readonly IdentityRecord[]): IdentitySourceRow[] {
  return records.map((r) => ({
    entity_id: r.entity_id,
    company_id: r.company_id,
    field: r.field,
    display_value: r.display_value,
    stored_normalized: r.stored_normalized,
    source_ref: r.row_id,
  }));
}

// ---------------------------------------------------------------------------
// شبیه‌سازیِ کامل
// ---------------------------------------------------------------------------

export interface SimulationConfig {
  /** اندازهٔ دسته (batching) */
  readonly batch_size: number;
  /** شبیه‌سازیِ قطع پس از n عملیات (برای تستِ بازیابی) */
  readonly fail_after_ops?: number;
  /** حداکثر تعدادِ دسته (برای تست) */
  readonly max_batches?: number;
}

export interface SimulationResult {
  readonly contract_version: string;
  readonly config: SimulationConfig;
  readonly batches: number;
  readonly ops_applied: number;
  readonly rows_recalculated: number;
  readonly interrupted: boolean;
  readonly interrupt_reason: string | null;
  /** تعدادِ ردیف‌هایی که مقدارِ نمایشی‌شان دست‌نخورده ماند (باید = همه) */
  readonly display_values_preserved: number;
  readonly final_state: MigrationState;
  readonly ledger: ConflictLedger;
  readonly shadow: ShadowIndex;
}

/** کلیدِ عملیات — برای idempotency */
function opKey(rowId: string, kind: string): string {
  return `${kind}:${rowId}`;
}

/**
 * اجرای شبیه‌سازیِ مهاجرت.
 *
 * مراحل (هر مرحله دسته‌ای و قابلِ‌ازسرگیری):
 *   ۱. snapshot  — ثبتِ مقدارِ اصلی در backup (پیش‌شرطِ rollback)
 *   ۲. shadow    — محاسبهٔ کلیدِ نامزد (بدونِ تغییرِ داده)
 *   ۳. detect    — تشخیصِ برخورد (فقط خواندن)
 *   ۴. recalc    — نوشتنِ کلیدِ نامزد در `stored_normalized` **در حافظه**
 *   ۵. verify    — تأییدِ اینکه مقدارِ نمایشی تغییر نکرده
 *
 * اگر `fail_after_ops` برسد، شبیه‌سازی **متوقف** می‌شود ولی state معتبر می‌ماند
 * ⇒ اجرای دوباره از همان‌جا ادامه می‌دهد (idempotent).
 */
export function runSimulation(
  records: readonly IdentityRecord[],
  cfg: SimulationConfig,
): SimulationResult {
  if (cfg.batch_size <= 0) throw new Error('batch_size must be > 0');
  // ⚠️ کارایی: state در طولِ اجرا **in-place** تغییر می‌کند. کپیِ کاملِ Map در هر
  // عملیات، الگوریتم را O(n²) می‌کرد (۵۰۰۰ ردیف ≈ ۱۴ ثانیه). در پایان یک
  // snapshot تغییرناپذیر برمی‌گردانیم تا API همچنان immutable بماند.
  const state = initialState(records) as {
    records: Map<string, IdentityRecord>;
    phases: Map<string, RowPhase>;
    applied_ops: Set<string>;
    backup: Map<string, string>;
    cursor: number;
    aborted: boolean;
    abort_reason: string | null;
  };
  const ids = [...state.records.keys()].sort(); // ترتیبِ قطعی

  const shadow = buildShadowIndex(toSourceRows(records));
  const ledger = detectCollisions(shadow);

  // نگاشتِ row_id → کلیدِ نامزد
  const proposed = new Map<string, string | null>();
  for (const e of shadow.entries) proposed.set(e.source_ref, e.proposed_key);

  let ops = 0;
  let batches = 0;
  let interrupted = false;
  let interruptReason: string | null = null;

  const apply = (rowId: string, kind: string, fn: () => void): boolean => {
    if (cfg.fail_after_ops !== undefined && ops >= cfg.fail_after_ops) {
      interrupted = true;
      interruptReason = `simulated failure after ${ops} ops`;
      return false;
    }
    const k = opKey(rowId, kind);
    if (state.applied_ops.has(k)) return true; // idempotent: قبلاً انجام شده
    fn();
    ops += 1;
    state.applied_ops.add(k);
    return true;
  };

  // ---- مرحلهٔ ۱ و ۲: backup + phase ----
  for (let i = 0; i < ids.length; i += cfg.batch_size) {
    if (interrupted) break;
    if (cfg.max_batches !== undefined && batches >= cfg.max_batches) break;
    const slice = ids.slice(i, i + cfg.batch_size);
    for (const rowId of slice) {
      const rec = state.records.get(rowId) as IdentityRecord;
      const ok = apply(rowId, 'backup', () => {
        state.backup.set(rowId, rec.stored_normalized);
        state.phases.set(rowId, 'backed_up');
      });
      if (!ok) break;
    }
    batches += 1;
  }

  // ---- مرحلهٔ ۴: بازمحاسبه (فقط برای ردیف‌هایی که کلیدشان معتبر و متفاوت است) ----
  for (let i = 0; i < ids.length; i += cfg.batch_size) {
    if (interrupted) break;
    const slice = ids.slice(i, i + cfg.batch_size);
    for (const rowId of slice) {
      const newKey = proposed.get(rowId);
      if (newKey === null || newKey === undefined) continue;
      const ok = apply(rowId, 'recalc', () => {
        const rec = state.records.get(rowId) as IdentityRecord;
        // ⚠️ فقط stored_normalized عوض می‌شود؛ display_value هرگز.
        state.records.set(rowId, { ...rec, stored_normalized: newKey });
        state.phases.set(rowId, 'recalculated');
      });
      if (!ok) break;
    }
  }

  // ---- مرحلهٔ ۵: verify ----
  let displayPreserved = 0;
  const originalById = new Map<string, IdentityRecord>();
  for (const r of records) originalById.set(r.row_id, r);
  for (const rowId of ids) {
    const before = originalById.get(rowId) as IdentityRecord;
    const after = state.records.get(rowId) as IdentityRecord;
    if (before.display_value === after.display_value) displayPreserved += 1;
  }

  return {
    contract_version: NORMALIZATION_CONTRACT_VERSION,
    config: cfg,
    batches,
    ops_applied: ops,
    rows_recalculated: [...state.phases.values()].filter((p) => p === 'recalculated').length,
    interrupted,
    interrupt_reason: interruptReason,
    display_values_preserved: displayPreserved,
    final_state: snapshot(state),
    ledger,
    shadow,
  };
}

/** snapshot تغییرناپذیر از state داخلی */
function snapshot(s: {
  records: Map<string, IdentityRecord>;
  phases: Map<string, RowPhase>;
  applied_ops: Set<string>;
  backup: Map<string, string>;
  cursor: number;
  aborted: boolean;
  abort_reason: string | null;
}): MigrationState {
  return {
    records: new Map(s.records),
    phases: new Map(s.phases),
    applied_ops: new Set(s.applied_ops),
    backup: new Map(s.backup),
    cursor: s.cursor,
    aborted: s.aborted,
    abort_reason: s.abort_reason,
  };
}

/**
 * ادامهٔ شبیه‌سازی از یک state نیمه‌کاره (بازیابی پس از قطع).
 * idempotent: عملیاتِ انجام‌شده دوباره اجرا نمی‌شوند.
 */
export function resumeSimulation(
  state: MigrationState,
  cfg: SimulationConfig,
): SimulationResult {
  const records = [...state.records.values()];
  const ids = [...state.records.keys()].sort();
  const shadow = buildShadowIndex(toSourceRows(records));
  const ledger = detectCollisions(shadow);
  const proposed = new Map<string, string | null>();
  for (const e of shadow.entries) proposed.set(e.source_ref, e.proposed_key);

  // مانندِ runSimulation: in-place برای کارایی خطی، snapshot در خروجی
  const s = {
    records: new Map(state.records),
    phases: new Map(state.phases),
    applied_ops: new Set(state.applied_ops),
    backup: new Map(state.backup),
    cursor: state.cursor,
    aborted: false,
    abort_reason: null as string | null,
  };
  let ops = 0;
  let batches = 0;
  let interrupted = false;
  let interruptReason: string | null = null;

  const apply = (rowId: string, kind: string, fn: () => void): boolean => {
    if (cfg.fail_after_ops !== undefined && ops >= cfg.fail_after_ops) {
      interrupted = true;
      interruptReason = `simulated failure after ${ops} ops`;
      return false;
    }
    const k = opKey(rowId, kind);
    if (s.applied_ops.has(k)) return true;
    fn();
    ops += 1;
    s.applied_ops.add(k);
    return true;
  };

  // ادامهٔ backup برای ردیف‌های باقی‌مانده
  for (let i = 0; i < ids.length; i += cfg.batch_size) {
    if (interrupted) break;
    const slice = ids.slice(i, i + cfg.batch_size);
    for (const rowId of slice) {
      const rec = s.records.get(rowId) as IdentityRecord;
      const ok = apply(rowId, 'backup', () => {
        if (!s.backup.has(rowId)) s.backup.set(rowId, rec.stored_normalized);
        s.phases.set(rowId, 'backed_up');
      });
      if (!ok) break;
    }
    batches += 1;
  }

  // ادامهٔ بازمحاسبه
  for (let i = 0; i < ids.length; i += cfg.batch_size) {
    if (interrupted) break;
    const slice = ids.slice(i, i + cfg.batch_size);
    for (const rowId of slice) {
      const newKey = proposed.get(rowId);
      if (newKey === null || newKey === undefined) continue;
      const ok = apply(rowId, 'recalc', () => {
        const rec = s.records.get(rowId) as IdentityRecord;
        s.records.set(rowId, { ...rec, stored_normalized: newKey });
        s.phases.set(rowId, 'recalculated');
      });
      if (!ok) break;
    }
  }

  let displayPreserved = 0;
  for (const rowId of ids) {
    const after = s.records.get(rowId) as IdentityRecord;
    // نمایشی را از state اصلی (که خودش تغییر نکرده) می‌سنجیم
    if (after.display_value === state.records.get(rowId)?.display_value) displayPreserved += 1;
  }

  return {
    contract_version: NORMALIZATION_CONTRACT_VERSION,
    config: cfg,
    batches,
    ops_applied: ops,
    rows_recalculated: [...s.phases.values()].filter((p) => p === 'recalculated').length,
    interrupted,
    interrupt_reason: interruptReason,
    display_values_preserved: displayPreserved,
    final_state: snapshot(s),
    ledger,
    shadow,
  };
}

/**
 * بازگردانی (rollback) — مقدارِ ذخیره‌شده را از backup برمی‌گرداند.
 *
 * هیچ‌گاه مقدارِ نمایشی را لمس نمی‌کند. اگر backup برای ردیفی موجود نباشد،
 * ردیف را دست‌نخورده می‌گذارد و آن را در `unrecovered` گزارش می‌کند
 * (به‌جای حدس‌زدن).
 */
export function rollback(state: MigrationState): {
  readonly state: MigrationState;
  readonly restored: number;
  readonly unrecovered: readonly string[];
} {
  const unrecovered: string[] = [];
  let restored = 0;
  const records = new Map(state.records);
  const phases = new Map(state.phases);

  for (const [rowId, rec] of state.records) {
    const b = state.backup.get(rowId);
    if (b === undefined) {
      // ردیفی که بازمحاسبه شده ولی backup ندارد ⇒ **قابلِ بازگردانی نیست**.
      // باید صریح گزارش شود، نه اینکه بی‌صدا رد شود.
      if (state.phases.get(rowId) === 'recalculated') unrecovered.push(rowId);
      continue;
    }
    records.set(rowId, { ...rec, stored_normalized: b });
    phases.set(rowId, 'rolled_back');
    restored += 1;
  }

  return {
    state: { ...state, records, phases, aborted: false, abort_reason: null },
    restored,
    unrecovered,
  };
}

/** آیا حالتِ نهایی با یک اجرای یک‌باره‌ی بدونِ قطع یکسان است؟ (اثباتِ idempotency) */
export function equivalentStates(a: MigrationState, b: MigrationState): boolean {
  if (a.records.size !== b.records.size) return false;
  for (const [k, va] of a.records) {
    const vb = b.records.get(k);
    if (!vb) return false;
    if (va.stored_normalized !== vb.stored_normalized) return false;
    if (va.display_value !== vb.display_value) return false;
  }
  return true;
}
