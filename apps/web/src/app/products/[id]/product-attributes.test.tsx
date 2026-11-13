import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProductAttributesTab, attributeErrorMessage, toLatinNumber } from './product-attributes';

const { get, put } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { GET: get, PUT: put } }));

const textEntry = {
  def_id: 'd-text', code: 'COLOR', title: 'رنگ', kind: 'text', kind_label_fa: 'متنی',
  is_variant_axis: false, is_required: true, sort_order: 1, enum_values: [],
  value: { id: 'v1', value_text: 'قرمز', value_num: null, value_enum: null },
  filled: true, warning_fa: 'این صفت الزامی شرکت است.',
};

const numEntry = {
  def_id: 'd-num', code: 'WEIGHT', title: 'وزن', kind: 'number', kind_label_fa: 'عددی',
  is_variant_axis: true, is_required: false, sort_order: 2, enum_values: [],
  value: { id: null, value_text: null, value_num: null, value_enum: null },
  filled: false, warning_fa: null,
};

const enumEntry = {
  def_id: 'd-enum', code: 'PACK', title: 'بسته‌بندی', kind: 'enum', kind_label_fa: 'انتخابی',
  is_variant_axis: false, is_required: false, sort_order: 3,
  enum_values: [{ id: 'e1', value: 'قوطی' }, { id: 'e2', value: 'بطری' }],
  value: { id: null, value_text: null, value_num: null, value_enum: null },
  filled: false, warning_fa: null,
};

const baseView = {
  product: { id: 'p1', code: 'P-1', name: 'کالای اول', status: 'active' },
  scope: 'central',
  actor: { can_view: true, can_update: true, unavailable_reason_fa: null },
  variant_signature: null,
  signature_locked: false,
  signature_rule_fa: 'امضا فقط از صفاتِ محور variant ساخته می‌شود.',
  required_policy_fa: 'صفاتِ الزامی در سطح کل شرکت الزامی‌اند.',
  kinds: [
    { kind: 'text', label_fa: 'متنی', meaning_fa: 'متن آزاد', evidence: '0046' },
    { kind: 'number', label_fa: 'عددی', meaning_fa: 'numeric(19,4)', evidence: '0046' },
    { kind: 'enum', label_fa: 'انتخابی', meaning_fa: 'فهرست مجاز', evidence: '0046' },
  ],
  attributes: [textEntry, numEntry, enumEntry],
  values: [{ id: 'v1', product_id: 'p1', def_id: 'd-text', value_text: 'قرمز', value_num: null, value_enum: null }],
  counts: { total: 3, filled: 1, required: 1, required_missing: 0, variant_axes: 1 },
  downstream_notes_fa: ['هیچ تاکسونومیِ سراسری ساخته نمی‌شود.'],
  owner_decisions_fa: [{ id: 'C7-D4', title_fa: 'دامنهٔ الزام', status: 'BLOCKED', detail_fa: 'نیازمند تصویب مالک.' }],
};

const historyResponse = {
  items: [
    { id: '9', action: 'UPDATE', event_label_fa: 'ویرایش', entity_type: 'product_attribute_value', entity_id: 'p1', actor_user_id: 'u1', actor_label_fa: 'مدیر کالا', at: '2026-11-07T10:05:00.000Z', def_code: 'COLOR', def_title: 'رنگ' },
  ],
  limit: 20,
  source_fa: 'تاریخچهٔ تغییرناپذیر کاتالوگ',
};

const mockReads = (view: unknown = baseView) => {
  get.mockImplementation(async (path: string) => {
    if (path === '/products/{id}/attributes') return { data: view };
    if (path === '/products/{id}/identity/history') return { data: historyResponse };
    return { data: null };
  });
};

afterEach(cleanup);
beforeEach(() => {
  get.mockReset();
  put.mockReset();
});

describe('C7 Persian RTL attribute UI', () => {
  it('renders catalog definitions with kind, required/axis badges, values and open decisions', async () => {
    mockReads();
    render(<ProductAttributesTab productId="p1" />);
    await screen.findByText('صفات کالا');

    expect(await screen.findByText('رنگ')).toBeTruthy();
    expect(screen.getByText('قرمز')).toBeTruthy();
    expect(screen.getByText('الزامی شرکت')).toBeTruthy();
    expect(screen.getAllByText('محور variant').length).toBeGreaterThan(0);
    expect(screen.getByText(/این صفحه تعریف جدید نمی‌سازد/)).toBeTruthy();
    expect(screen.getByText(/هیچ تاکسونومیِ سراسری/)).toBeTruthy();
    expect(screen.getByText(/BLOCKED/)).toBeTruthy();
    expect(screen.getByText('— (هیچ محور variant مقداری ندارد)')).toBeTruthy();
    // تاریخچه از سطح API خوانده می‌شود
    expect(await screen.findByText('مدیر کالا')).toBeTruthy();
  });

  it('clears a value through the approved clear payload', async () => {
    mockReads();
    put.mockResolvedValue({ data: { values: [], variant_signature: null, cleared: ['d-text'] } });
    render(<ProductAttributesTab productId="p1" />);
    await screen.findByText('صفات کالا');

    fireEvent.click(screen.getByRole('button', { name: 'پاک کردن' }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put.mock.calls[0][0]).toBe('/products/{id}/attributes');
    expect(put.mock.calls[0][1]).toMatchObject({
      params: { path: { id: 'p1' } },
      body: { values: [{ def_id: 'd-text', clear: true }] },
    });
    expect(await screen.findByText('مقدار صفت ثبت شد.')).toBeTruthy();
  });

  it('writes numeric and enum values with the exact approved payload', async () => {
    mockReads();
    put.mockResolvedValue({ data: { values: [], variant_signature: 'x', cleared: [] } });
    render(<ProductAttributesTab productId="p1" />);
    await screen.findByText('صفات کالا');

    // عددی با ارقام فارسی
    fireEvent.click(screen.getAllByRole('button', { name: 'ثبت مقدار' })[0]);
    fireEvent.change(screen.getByLabelText('مقدار عددی وزن'), { target: { value: '۱۲٫۵' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put.mock.calls[0][1].body).toEqual({ values: [{ def_id: 'd-num', value_num: 12.5 }] });

    // انتخابی فقط از فهرست مجاز — ردیفِ عددی همچنان در حال ویرایش است، پس
    // دکمهٔ «ثبت مقدار» بعدی متعلق به ردیف enum است.
    const addButtons = screen.getAllByRole('button', { name: 'ثبت مقدار' });
    fireEvent.click(addButtons[addButtons.length - 1]);
    const select = screen.getByLabelText('مقدار بسته‌بندی') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['', 'قوطی', 'بطری']);
    fireEvent.change(select, { target: { value: 'بطری' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    expect(put.mock.calls[1][1].body).toEqual({ values: [{ def_id: 'd-enum', value_enum: 'بطری' }] });
  });

  it('surfaces validation/immutability codes in Persian and never claims success', async () => {
    mockReads();
    put.mockResolvedValue({ error: { code: 'variant_signature_immutable' } });
    render(<ProductAttributesTab productId="p1" />);
    await screen.findByText('صفات کالا');

    fireEvent.click(screen.getAllByRole('button', { name: 'ویرایش' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }));
    expect(await screen.findByText(/محورهای variant تغییرناپذیرند/)).toBeTruthy();
    expect(screen.queryByText('مقدار صفت ثبت شد.')).toBeNull();

    expect(attributeErrorMessage({ code: 'required_attribute_missing' })).toContain('الزامی');
    expect(attributeErrorMessage({ code: 'invalid_attribute' })).toContain('کاتالوگ');
    expect(attributeErrorMessage({ code: 'duplicate_variant_signature' })).toContain('SKU دیگری');
  });

  it('locks variant axes when the product has operational references', async () => {
    mockReads({ ...baseView, signature_locked: true, variant_signature: 'a'.repeat(64) });
    render(<ProductAttributesTab productId="p1" />);
    await screen.findByText('صفات کالا');
    expect(screen.getByText(/این کالا ارجاع عملیاتی دارد/)).toBeTruthy();
    // دکمهٔ ثبت مقدار برای محور variant غیرفعال است
    const buttons = screen.getAllByRole('button', { name: 'ثبت مقدار' }) as HTMLButtonElement[];
    expect(buttons[0].disabled).toBe(true);
  });

  it('is read-only without master.product.update', async () => {
    mockReads({ ...baseView, actor: { can_view: true, can_update: false, unavailable_reason_fa: 'این نشست مجوز ویرایش کاتالوگ (master.product.update) ندارد؛ فقط مشاهده مجاز است.' } });
    render(<ProductAttributesTab productId="p1" />);
    await screen.findByText('صفات کالا');
    expect(screen.getByText(/master\.product\.update/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'ثبت مقدار' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'پاک کردن' })).toBeNull();
  });

  it('shows loading, then a Persian read error with retry', async () => {
    get.mockResolvedValue({ error: { code: 'not_found' } });
    render(<ProductAttributesTab productId="p1" />);
    expect(screen.getByText('در حال دریافت صفات…')).toBeTruthy();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'تلاش دوباره' })).toBeTruthy();
  });

  it('normalises Persian/Arabic digits for numeric input', () => {
    expect(toLatinNumber('۱۲٫۵')).toBe(12.5);
    expect(toLatinNumber('١٢.٥')).toBe(12.5);
    expect(toLatinNumber('1٫000')).toBe(1);
    expect(toLatinNumber('1,000')).toBe(1000);
    expect(Number.isFinite(toLatinNumber('abc'))).toBe(false);
  });
});
