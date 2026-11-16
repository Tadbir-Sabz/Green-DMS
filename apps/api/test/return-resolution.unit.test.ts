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
        line('restock', { qty: 2 }),
        line('damaged', { qty: 1 }),
        line('scrap', { qty: 9 }),
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
        lines: [line('restock'), line('damaged')],
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
