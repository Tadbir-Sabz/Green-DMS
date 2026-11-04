import { describe, expect, it } from 'vitest';
import { classifyAbc } from '../src/modules/bi/bi.service';

/**
 * تستِ تابعِ خالصِ طبقه‌بندی ABC (بدون DB). SQLِ BI در CI روی materialized viewهای
 * واقعی سنجیده می‌شود؛ اینجا منطقِ پارتو (مرزهای A/B/C بر اساسِ مجموعِ تجمعیِ *پیش از*
 * هر قلم)، گردکردنِ درصدها و نگهداریِ qty پوشش داده می‌شود.
 */

describe('classifyAbc — طبقه‌بندی پارتو', () => {
  it('A تا ۸۰٪، B تا ۹۵٪، C بقیه (بر پایهٔ مجموعِ تجمعیِ پیش از هر قلم)', () => {
    const rows = [
      { id: '1', code: 'C1', name: 'یک', revenue: 70 },
      { id: '2', code: 'C2', name: 'دو', revenue: 20 },
      { id: '3', code: 'C3', name: 'سه', revenue: 5 },
      { id: '4', code: 'C4', name: 'چهار', revenue: 5 },
    ];
    const { items, totalRevenue } = classifyAbc(rows);
    expect(totalRevenue).toBe(100);
    expect(items.map((i) => i.class)).toEqual(['A', 'A', 'B', 'C']);
    expect(items.map((i) => i.share_pct)).toEqual([70, 20, 5, 5]);
    expect(items.map((i) => i.cumulative_pct)).toEqual([70, 90, 95, 100]);
    expect(items[0].revenue).toBe('70.00');
  });

  it('یک قلمِ مسلط (۹۰٪) A می‌شود، نه B', () => {
    const { items } = classifyAbc([
      { id: '1', code: 'X', name: 'x', revenue: 90 },
      { id: '2', code: 'Y', name: 'y', revenue: 10 },
    ]);
    expect(items.map((i) => i.class)).toEqual(['A', 'B']);
  });

  it('آستانه‌های سفارشی رعایت می‌شوند', () => {
    const { items } = classifyAbc(
      [
        { id: '1', code: 'X', name: 'x', revenue: 50 },
        { id: '2', code: 'Y', name: 'y', revenue: 50 },
      ],
      40,
      70,
    );
    expect(items.map((i) => i.class)).toEqual(['A', 'B']);
  });

  it('درصدِ سهم به دو رقم گرد می‌شود', () => {
    const { items } = classifyAbc([
      { id: '1', code: 'X', name: 'x', revenue: 1 },
      { id: '2', code: 'Y', name: 'y', revenue: 2 },
    ]);
    // سهم‌ها: 33.33 و 66.67
    expect(items[0].share_pct).toBe(33.33);
    expect(items[1].share_pct).toBe(66.67);
  });

  it('ورودیِ خالی → خروجیِ خالی و مجموعِ صفر', () => {
    const { items, totalRevenue } = classifyAbc([]);
    expect(items).toEqual([]);
    expect(totalRevenue).toBe(0);
  });

  it('qty (برای کالاها) به‌صورت decimal string نگه داشته می‌شود', () => {
    const { items } = classifyAbc([{ id: '1', code: 'P', name: 'p', revenue: 100, qty: 25.5 }]);
    expect(items[0].qty).toBe('25.50');
  });
});
