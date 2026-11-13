import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProductAliasesTab, aliasErrorMessage } from './product-aliases';

const { get, post, del } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), del: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { GET: get, POST: post, DELETE: del } }));

const baseView = {
  product: { id: 'p1', code: 'P-1', name: 'کالای اول', status: 'active' },
  scope: 'central',
  actor: { can_view: true, can_update: true, unavailable_reason_fa: null },
  kinds: [
    { kind: 'brand_slang', label_fa: 'نام عامیانه/برند', meaning_fa: 'نام رایج', used_in_scan: false, evidence: '0046' },
    { kind: 'latin', label_fa: 'نام لاتین', meaning_fa: 'نام لاتین', used_in_scan: false, evidence: '0046' },
    { kind: 'code', label_fa: 'کد جایگزین', meaning_fa: 'کد قدیمی', used_in_scan: true, evidence: '0046' },
  ],
  items: [
    {
      id: 'a1', product_id: 'p1', alias: 'کوکا', alias_norm: 'کوکا', kind: 'brand_slang',
      kind_label_fa: 'نام عامیانه/برند', used_in_scan: false, warning_fa: null, conflict: null,
      created_at: '2026-11-07T10:00:00.000Z',
    },
    {
      id: 'a2', product_id: 'p1', alias: 'K-OLD', alias_norm: 'k-old', kind: 'code',
      kind_label_fa: 'کد جایگزین', used_in_scan: true, warning_fa: 'این نام در اسکن استفاده می‌شود.',
      conflict: { product_id: null, code: 'P-9', name: 'کالای نهم' }, created_at: '2026-11-07T10:01:00.000Z',
    },
  ],
  aliases: [],
  counts: { total: 2, brand_slang: 1, latin: 0, code: 1, truncated: false },
  scan_resolution_fa: 'ترتیب قطعی اسکن: بارکد ← کد کالا ← نام جایگزین نوع «کد جایگزین».',
  downstream_notes_fa: ['هیچ سند تاریخی بازنویسی نمی‌شود.'],
  owner_decisions_fa: [{ id: 'C7-D1', title_fa: 'یکتایی شرکتی نام جایگزین', status: 'UNRESOLVED', detail_fa: 'نیازمند تصویب مالک.' }],
};

const mockReads = (view: unknown = baseView) => {
  get.mockImplementation(async (path: string) => {
    if (path === '/products/{id}/aliases') return { data: view };
    return { data: null };
  });
};

afterEach(cleanup);
beforeEach(() => {
  get.mockReset();
  post.mockReset();
  del.mockReset();
});

describe('C7 Persian RTL alias UI', () => {
  it('renders approved kinds, scan boundary, soft conflict and open decisions', async () => {
    mockReads();
    render(<ProductAliasesTab productId="p1" />);
    await screen.findByText('نام‌های جایگزین کالا');

    expect((await screen.findAllByText('کوکا')).length).toBeGreaterThan(0);
    expect(screen.getByText('K-OLD')).toBeTruthy();
    expect(screen.getByText(/ترتیب قطعی اسکن/)).toBeTruthy();
    expect(screen.getByText(/یکتایی شرکتی در پایگاه‌داده وجود ندارد/)).toBeTruthy();
    expect(screen.getByText(/هیچ سند تاریخی بازنویسی نمی‌شود/)).toBeTruthy();
    expect(screen.getByText(/UNRESOLVED/)).toBeTruthy();
    // نوع code در اسکن علامت‌گذاری می‌شود، نوع دیگر نه
    expect(screen.getAllByText('در اسکن')).toHaveLength(1);
  });

  it('adds an alias only with explicit confirmation and the approved payload', async () => {
    mockReads();
    post.mockResolvedValue({ data: { id: 'a3' } });
    render(<ProductAliasesTab productId="p1" />);
    await screen.findByText('نام‌های جایگزین کالا');

    fireEvent.change(screen.getByLabelText('نام جایگزین'), { target: { value: '  نوشابه  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'ثبت نام جایگزین' }));
    expect(await screen.findByText('برای ثبت، تأیید صریح را فعال کنید.')).toBeTruthy();
    expect(post).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('تأیید افزودن نام جایگزین'));
    fireEvent.click(screen.getByRole('button', { name: 'ثبت نام جایگزین' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][0]).toBe('/products/{id}/aliases');
    expect(post.mock.calls[0][1]).toMatchObject({
      params: { path: { id: 'p1' } },
      body: { alias: 'نوشابه', kind: 'brand_slang', confirm_add: true },
    });
    expect(await screen.findByText(/نام جایگزین ثبت شد/)).toBeTruthy();
  });

  it('surfaces stable server codes in Persian and never claims success', async () => {
    mockReads();
    post.mockResolvedValue({ error: { code: 'alias_collision' } });
    render(<ProductAliasesTab productId="p1" />);
    await screen.findByText('نام‌های جایگزین کالا');

    fireEvent.change(screen.getByLabelText('نام جایگزین'), { target: { value: 'تکراری' } });
    fireEvent.click(screen.getByLabelText('تأیید افزودن نام جایگزین'));
    fireEvent.click(screen.getByRole('button', { name: 'ثبت نام جایگزین' }));

    expect(await screen.findByText(/هم‌ارز است و ثبت نشد/)).toBeTruthy();
    expect(screen.queryByText(/نام جایگزین ثبت شد/)).toBeNull();
    expect(aliasErrorMessage({ code: 'duplicate_alias' })).toContain('قبلاً ثبت شده');
    expect(aliasErrorMessage({ code: 'domain_context_not_supported' })).toContain('x-domain-id');
  });

  it('deletes only after explicit confirmation', async () => {
    mockReads();
    del.mockResolvedValue({ data: { deleted: true, alias_id: 'a1' } });
    render(<ProductAliasesTab productId="p1" />);
    await screen.findByText('نام‌های جایگزین کالا');

    const deleteButtons = screen.getAllByRole('button', { name: 'حذف' });
    expect(deleteButtons).toHaveLength(2);
    fireEvent.click(deleteButtons[0]);
    expect(await screen.findByText('حذف قطعی؟')).toBeTruthy();
    expect(del).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'تأیید حذف' }));
    await waitFor(() => expect(del).toHaveBeenCalledTimes(1));
    expect(del.mock.calls[0][1]).toMatchObject({ params: { path: { id: 'p1', aliasId: 'a1' } } });
    expect(await screen.findByText(/نام جایگزین حذف شد/)).toBeTruthy();
  });

  it('is read-only without master.product.update and sends no writes', async () => {
    mockReads({ ...baseView, actor: { can_view: true, can_update: false, unavailable_reason_fa: 'این نشست مجوز ویرایش کاتالوگ (master.product.update) ندارد؛ فقط مشاهده مجاز است.' } });
    render(<ProductAliasesTab productId="p1" />);
    await screen.findByText('نام‌های جایگزین کالا');

    expect(screen.getByText(/master\.product\.update/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'حذف' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'ثبت نام جایگزین' })).toBeNull();
    expect(screen.getAllByText('فقط مشاهده')).toHaveLength(2);
  });

  it('shows loading then a Persian error with retry when the read fails', async () => {
    get.mockResolvedValue({ error: { code: 'identity_read_failed' } });
    render(<ProductAliasesTab productId="p1" />);
    expect(screen.getByText('در حال دریافت نام‌های جایگزین…')).toBeTruthy();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'تلاش دوباره' })).toBeTruthy();
  });

  it('sends the kind filter and limit to the server', async () => {
    mockReads();
    render(<ProductAliasesTab productId="p1" />);
    await screen.findByText('نام‌های جایگزین کالا');
    fireEvent.change(screen.getByLabelText('فیلتر نوع نام جایگزین'), { target: { value: 'code' } });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(get.mock.calls[1][1]).toMatchObject({ params: { path: { id: 'p1' }, query: { kind: 'code', limit: 200 } } });
  });
});
