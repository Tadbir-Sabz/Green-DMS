import { describe, expect, it } from 'vitest';
import { moduleLabel, permissionLabel } from './permissions';

/**
 * برچسب‌های فارسی مجوز — هیچ کد خام انگلیسی نباید به رابط کاربری برسد
 * (قاعدهٔ طراحی: «بدون کد انگلیسی»).
 */
describe('moduleLabel — گروه مجوز', () => {
  it('ماژول شناخته‌شده برچسب فارسی می‌گیرد', () => {
    expect(moduleLabel('sales.order.create')).toBe('فروش');
    expect(moduleLabel('inventory.stock.view')).toBe('انبار');
    expect(moduleLabel('rules.view')).toBe('قواعد و تأییدات');
  });

  it('ماژول ناشناخته به «سایر» می‌افتد نه کد خام', () => {
    expect(moduleLabel('unknown_module.x.y')).toBe('سایر');
    expect(moduleLabel('')).toBe('سایر');
  });
});

describe('permissionLabel — برچسب کامل مجوز', () => {
  it('کد سه‌بخشی: «موجودیت — عمل»', () => {
    expect(permissionLabel('sales.order.create')).toBe('سفارش — ایجاد');
    expect(permissionLabel('master.product.view')).toBe('کالا — مشاهده');
    expect(permissionLabel('inventory.stock.update')).toBe('موجودی انبار — ویرایش');
  });

  it('کد دوبخشی فقط «عمل» را نشان می‌دهد', () => {
    expect(permissionLabel('rules.view')).toBe('مشاهده');
    expect(permissionLabel('rules.manage')).toBe('مدیریت');
  });

  it('توکن‌های ناشناخته به برچسب عمومی فارسی می‌افتند — هرگز کد خام', () => {
    const label = permissionLabel('sales.frobnicate.whatever');
    expect(label).toBe('مورد — عملیات');
    expect(label).not.toContain('frobnicate');
    expect(label).not.toContain('sales');
  });

  it('کد خالی برچسب بدون عنوان می‌گیرد', () => {
    expect(permissionLabel('')).toBe('مجوز بدون عنوان');
  });

  it('برچسب‌ها همیشه غیرلاتین/فارسی‌اند (شامل کد انگلیسی نمی‌شوند)', () => {
    const samples = [
      'sales.waybill.issue',
      'tracking.geofence.update',
      'rules.approval.decide',
      'ar.collection.perform',
      'completely_unknown.code.here',
    ];
    for (const code of samples) {
      const label = permissionLabel(code);
      // کد خام نباید در برچسب برگردد
      expect(label).not.toContain('waybill');
      expect(label).not.toContain('geofence');
      expect(label).not.toContain('unknown');
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
