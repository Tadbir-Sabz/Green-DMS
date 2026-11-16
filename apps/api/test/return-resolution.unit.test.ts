import { describe, expect, it } from 'vitest';
import {
  planReturnPostings,
  ResolutionPlanError,
  type BranchWarehouseRow,
  type ResolutionLineInput,
} from '../src/modules/sales/return-resolution';

/**
 * تست‌های واحدِ planReturnPostings — منطقِ خالصِ «هر قلمِ مرجوعی کجا پُست می‌شود».
 * بدونِ دیتابیس؛ در jobِ unit (بدون DATABASE_URL) اجرا می‌شود.
 */

const wh = (id: string, kind: string, is_active = true, code = id.toUpperCase()): BranchWarehouseRow => ({
  id,
  kind,
  is_active,
  code,
});

const WH_MAIN = '11111111-1111-4111-8111-111111111111';
const WH_MAIN2 = '22222222-2222-4222-8222-222222222222';
const WH_QUAR = '33333333-3333-4333-8333-333333333333';
const WH_DAMAGED = '44444444-4444-4444-8444-444444444444';
const WH_CONSIGN = '55555555-5555-4555-8555-555555555555';
const WH_OFF = '66666666-6666-4666-8666-666666666666';

const line = (disposition: ResolutionLineInput['disposition'], over: Partial<ResolutionLineInput> = {}): ResolutionLineInput => ({
  product_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  batch_id: null,
  qty: 1,
  disposition,
  ...over,
});

const bothWarehouses = [wh(WH_MAIN, 'main'), wh(WH_QUAR, 'quarantine')];

describe('planReturnPostings — restock', () => {
  it('مقصدِ پیش‌فرض = انبارِ main فعال شعبه', () => {
    const out = planReturnPostings({ lines: [line('restock', { qty: 3 })], branchWarehouses: bothWarehouses });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ txn_kind: 'sale_return_in', warehouse_id: WH_MAIN, qty: 3, disposition: 'restock' });
  });

  it('مقصدِ صریحِ فعال و مالِ شعبه اعمال می‌شود', () => {
    const out = planReturnPostings({
      lines: [line('restock')],
      explicitWarehouseId: WH_CONSIGN,
      branchWarehouses: [...bothWarehouses, wh(WH_CONSIGN, 'consignment')],
    });
    expect(out[0].warehouse_id).toBe(WH_CONSIGN);
  });

  it('مقصدِ صریحِ ناموجود/خارج از شعبه ⇒ warehouse_not_found (400)', () => {
    try {
      planReturnPostings({ lines: [line('restock')], explicitWarehouseId: WH_OFF, branchWarehouses: bothWarehouses });
      expect.unreachable('باید خطا پرتاب می‌شد');
    } catch (e) {
      expect(e).toBeInstanceOf(ResolutionPlanError);
      expect((e as ResolutionPlanError).code).toBe('warehouse_not_found');
      expect((e as ResolutionPlanError).httpStatus).toBe(400);
    }
  });

  it('مقصدِ صریحِ غیرفعال ⇒ warehouse_inactive (400)', () => {
    try {
      planReturnPostings({
        lines: [line('restock')],
        explicitWarehouseId: WH_OFF,
        branchWarehouses: [...bothWarehouses, wh(WH_OFF, 'main', false)],
      });
      expect.unreachable();
    } catch (e) {
      expect((e as ResolutionPlanError).code).toBe('warehouse_inactive');
      expect((e as ResolutionPlanError).httpStatus).toBe(400);
    }
  });

  it('نبودِ انبار main ⇒ restock_warehouse_missing (409)', () => {
    try {
      planReturnPostings({ lines: [line('restock')], branchWarehouses: [wh(WH_QUAR, 'quarantine')] });
      expect.unreachable();
    } catch (e) {
      expect((e as ResolutionPlanError).code).toBe('restock_warehouse_missing');
      expect((e as ResolutionPlanError).httpStatus).toBe(409);
    }
  });

  it('انبار main غیرفعال ⇒ به‌حساب نمی‌آید و همان کد 409 پرتاب می‌شود', () => {
    try {
      planReturnPostings({ lines: [line('restock')], branchWarehouses: [wh(WH_MAIN, 'main', false)] });
      expect.unreachable();
    } catch (e) {
      expect((e as ResolutionPlanError).code).toBe('restock_warehouse_missing');
    }
  });

  it('انتخابِ deterministic: بین چند main، کمترین code+id', () => {
    const out = planReturnPostings({
      lines: [line('restock')],
      branchWarehouses: [wh(WH_MAIN2, 'main', true, 'B'), wh(WH_MAIN, 'main', true, 'A')],
    });
    expect(out[0].warehouse_id).toBe(WH_MAIN);
  });
});

describe('planReturnPostings — damaged (قرنطینه، fail-closed)', () => {
  it('اول quarantine سپس damaged', () => {
    const outQ = planReturnPostings({ lines: [line('damaged')], branchWarehouses: bothWarehouses });
    expect(outQ[0].warehouse_id).toBe(WH_QUAR);

    const outD = planReturnPostings({
      lines: [line('damaged')],
      branchWarehouses: [wh(WH_MAIN, 'main'), wh(WH_DAMAGED, 'damaged')],
    });
    expect(outD[0].warehouse_id).toBe(WH_DAMAGED);
  });

  it('نبودِ قرنطینه ⇒ quarantine_warehouse_missing (409) — کالای معیوب به main نمی‌رود', () => {
    try {
      planReturnPostings({ lines: [line('damaged')], branchWarehouses: [wh(WH_MAIN, 'main')] });
      expect.unreachable();
    } catch (e) {
      expect((e as ResolutionPlanError).code).toBe('quarantine_warehouse_missing');
      expect((e as ResolutionPlanError).httpStatus).toBe(409);
    }
  });

  it('انبارِ صریح روی damaged اثر ندارد — همیشه قرنطینه', () => {
    const out = planReturnPostings({
      lines: [line('damaged')],
      explicitWarehouseId: WH_MAIN,
      branchWarehouses: bothWarehouses,
    });
    expect(out[0].warehouse_id).toBe(WH_QUAR);
  });

  it('قرنطینهٔ غیرفعال ⇒ به‌حساب نمی‌آید', () => {
    try {
      planReturnPostings({
        lines: [line('damaged')],
        branchWarehouses: [wh(WH_MAIN, 'main'), wh(WH_QUAR, 'quarantine', false)],
      });
      expect.unreachable();
    } catch (e) {
      expect((e as ResolutionPlanError).code).toBe('quarantine_warehouse_missing');
    }
  });
});

describe('planReturnPostings — scrap و return_to_supplier', () => {
  it.each(['scrap', 'return_to_supplier'] as const)('%s هیچ حرکتِ موجودی‌ای نمی‌سازد', (disposition) => {
    const out = planReturnPostings({ lines: [line(disposition)], branchWarehouses: bothWarehouses });
    expect(out).toEqual([]);
  });

  it('scrap حتی بدون هیچ انباری هم معتبر است', () => {
    expect(planReturnPostings({ lines: [line('scrap')], branchWarehouses: [] })).toEqual([]);
  });

  it('انبارِ صریحِ نامعتبر حتی با disposition بدونِ حرکت هم رد می‌شود (fail-closed سراسری)', () => {
    try {
      planReturnPostings({ lines: [line('scrap')], explicitWarehouseId: WH_OFF, branchWarehouses: bothWarehouses });
      expect.unreachable();
    } catch (e) {
      expect((e as ResolutionPlanError).code).toBe('warehouse_not_found');
    }
    try {
      planReturnPostings({
        lines: [line('scrap')],
        explicitWarehouseId: WH_OFF,
        branchWarehouses: [...bothWarehouses, wh(WH_OFF, 'main', false)],
      });
      expect.unreachable();
    } catch (e) {
      expect((e as ResolutionPlanError).code).toBe('warehouse_inactive');
    }
  });
});

describe('planReturnPostings — ترکیب قلم‌ها', () => {
  it('restock + damaged + scrap با هم: فقط دو posting، مقصدها درست', () => {
    const out = planReturnPostings({
      lines: [
        line('restock', { qty: 2, product_id: 'aaaaaaaa-0000-4000-8000-000000000001' }),
        line('damaged', { qty: 1, product_id: 'aaaaaaaa-0000-4000-8000-000000000002' }),
        line('scrap', { qty: 9, product_id: 'aaaaaaaa-0000-4000-8000-000000000003' }),
      ],
      branchWarehouses: bothWarehouses,
    });
    expect(out.map((p) => [p.disposition, p.warehouse_id, p.qty])).toEqual([
      ['restock', WH_MAIN, 2],
      ['damaged', WH_QUAR, 1],
    ]);
  });

  it('خطای یک قلم ⇒ کل عملیات بدون posting پرتاب می‌شود (هیچ نوشتنی رخ نداده)', () => {
    expect(() =>
      planReturnPostings({
        lines: [
          line('restock'),
          line('damaged', { product_id: 'aaaaaaaa-0000-4000-8000-000000000002' }),
        ],
        branchWarehouses: [wh(WH_MAIN, 'main')], // قرنطینه نیست
      }),
    ).toThrow(ResolutionPlanError);
  });

  it('batch_id حفظ می‌شود', () => {
    const out = planReturnPostings({
      lines: [line('restock', { batch_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })],
      branchWarehouses: bothWarehouses,
    });
    expect(out[0].batch_id).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  });
});

// ---------- assertReceiveEligibility (TASK-P4-R-HARDEN) ----------

import {
  assertReceiveEligibility,
  type StoredReceiveLine,
  type SubmittedReceiveLine,
} from '../src/modules/sales/return-resolution';

const STORED: StoredReceiveLine[] = [
  { product_id: 'p1', qty: 2, qty_approved: null },
  { product_id: 'p2', qty: 1, qty_approved: null },
];

const ok = (product_id: string, qty: number): SubmittedReceiveLine => ({ product_id, qty });

const eligibilityError = (stored: StoredReceiveLine[], submitted: SubmittedReceiveLine[]) => {
  try {
    assertReceiveEligibility(stored, submitted);
    throw new Error('expected ResolutionPlanError');
  } catch (e) {
    if (e instanceof ResolutionPlanError) return e;
    throw e;
  }
};

describe('assertReceiveEligibility', () => {
  it('ورودی خالی ⇒ lines_required (400)', () => {
    expect(eligibilityError(STORED, []).code).toBe('lines_required');
  });

  it('پوشش کاملِ همهٔ خطوط فعّال پذیرفته می‌شود', () => {
    expect(() =>
      assertReceiveEligibility(STORED, [ok('p1', 2), ok('p2', 1)]),
    ).not.toThrow();
  });

  it('پوشش نصفه ⇒ incomplete_lines با missing_product_ids', () => {
    const e = eligibilityError(STORED, [ok('p1', 2)]);
    expect(e.code).toBe('incomplete_lines');
    expect(e.httpStatus).toBe(400);
    expect(e.details).toEqual({ missing_product_ids: ['p2'] });
  });

  it('کالا در ورودی دو بار ⇒ duplicate_line با product_ids (400)', () => {
    const e = eligibilityError(STORED, [ok('p1', 1), ok('p2', 1), ok('p1', 1)]);
    expect(e.code).toBe('duplicate_line');
    expect(e.httpStatus).toBe(400);
    expect(e.details).toEqual({ product_ids: ['p1'] });
  });

  it('کالای خارج از خطوط ذخیره‌شده ⇒ line_not_found (400)', () => {
    const e = eligibilityError(STORED, [ok('p1', 1), ok('p2', 1), ok('p3', 1)]);
    expect(e.code).toBe('line_not_found');
    expect(e.httpStatus).toBe(400);
  });

  it('qty ≤ ۰ ⇒ invalid_qty (400)', () => {
    expect(eligibilityError(STORED, [ok('p1', 0), ok('p2', 1)]).code).toBe('invalid_qty');
    expect(eligibilityError(STORED, [ok('p1', -1), ok('p2', 1)]).code).toBe('invalid_qty');
    expect(eligibilityError(STORED, [ok('p1', Number.NaN), ok('p2', 1)]).code).toBe('invalid_qty');
  });

  it('qty بزرگ‌تر از مقدار ذخیره‌شده ⇒ qty_exceeds_requested با ارقام (400)', () => {
    const e = eligibilityError(STORED, [ok('p1', 3), ok('p2', 1)]);
    expect(e.code).toBe('qty_exceeds_requested');
    expect(e.httpStatus).toBe(400);
    expect(e.details).toMatchObject({ product_id: 'p1', requested: 2, submitted: 3 });
  });

  it('دریافت کمتر از مقدار ذخیره‌شده مجاز است', () => {
    expect(() =>
      assertReceiveEligibility(STORED, [ok('p1', 0.5), ok('p2', 1)]),
    ).not.toThrow();
  });

  it('خطِ قبلاً حل‌شده در ورودی ⇒ line_already_resolved (400)', () => {
    const resolved: StoredReceiveLine[] = [
      { product_id: 'p1', qty: 2, qty_approved: 2 },
      { product_id: 'p2', qty: 1, qty_approved: null },
    ];
    const e = eligibilityError(resolved, [ok('p1', 1), ok('p2', 1)]);
    expect(e.code).toBe('line_already_resolved');
    expect(e.httpStatus).toBe(400);
  });

  it('فقط خطوط حل‌نشده باید پوشش داده شوند — partially_approved با پوشش کاملِ باقی‌مانده پذیرفته می‌شود', () => {
    const resolved: StoredReceiveLine[] = [
      { product_id: 'p1', qty: 2, qty_approved: 1 },
      { product_id: 'p2', qty: 1, qty_approved: null },
    ];
    expect(() => assertReceiveEligibility(resolved, [ok('p2', 1)])).not.toThrow();
  });

  it('همهٔ خطوط قبلاً حل شده‌اند ⇒ nothing_to_receive (409)', () => {
    const resolved: StoredReceiveLine[] = [
      { product_id: 'p1', qty: 2, qty_approved: 2 },
      { product_id: 'p2', qty: 1, qty_approved: 1 },
    ];
    const e = eligibilityError(resolved, [ok('p1', 1)]);
    expect(e.code).toBe('nothing_to_receive');
    expect(e.httpStatus).toBe(409);
  });

  it('دادهٔ ذخیره‌شدهٔ تکراری ⇒ duplicate_stored_lines (409، fail-closed)', () => {
    const dupStored: StoredReceiveLine[] = [
      { product_id: 'p1', qty: 1, qty_approved: null },
      { product_id: 'p1', qty: 1, qty_approved: null },
      { product_id: 'p2', qty: 1, qty_approved: null },
    ];
    const e = eligibilityError(dupStored, [ok('p1', 1), ok('p2', 1)]);
    expect(e.code).toBe('duplicate_stored_lines');
    expect(e.httpStatus).toBe(409);
    expect(e.details).toEqual({ product_ids: ['p1'] });
  });

  it('دادهٔ ذخیره‌شدهٔ تکراری حتی اگر همه حل شده باشند fail-closed رد می‌شود', () => {
    const dupStored: StoredReceiveLine[] = [
      { product_id: 'p1', qty: 1, qty_approved: 1 },
      { product_id: 'p1', qty: 1, qty_approved: 1 },
    ];
    expect(eligibilityError(dupStored, [ok('p1', 1)]).code).toBe('duplicate_stored_lines');
  });
});

describe('planReturnPostings — تکراری (defensive)', () => {
  it('ورودیِ تکراری ⇒ duplicate_line و هرگز دو posting برای یک خط', () => {
    try {
      planReturnPostings({
        lines: [
          line('restock', { product_id: 'aaaaaaaa-0000-4000-8000-000000000001' }),
          line('restock', { product_id: 'aaaaaaaa-0000-4000-8000-000000000001', qty: 5 }),
        ],
        branchWarehouses: bothWarehouses,
      });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ResolutionPlanError);
      expect((e as ResolutionPlanError).code).toBe('duplicate_line');
    }
  });
});
