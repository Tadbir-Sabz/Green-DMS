import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProductRelationsTab, relationErrorMessage } from './product-relations';

const { get, post, patch, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ api: { GET: get, POST: post, PATCH: patch, DELETE: del } }));

const relation = {
  id: 'rel-1',
  product_id: 'p1',
  related_id: 'p2',
  kind: 'substitute',
  kind_label_fa: 'جایگزین',
  priority: 10,
  direction: 'outgoing',
  related: { id: 'p2', code: 'P-2', name: 'کالای دوم', status: 'blocked', status_label_fa: 'مسدود', warning_fa: 'کالای مرتبط در وضعیت «مسدود» است؛ رابطه حفظ می‌شود ولی استفادهٔ عملیاتی مجاز نیست.' },
  created_at: '2026-11-07T10:00:00.000Z',
  editable: true,
  removable: true,
};

const incoming = {
  ...relation,
  id: 'rel-2',
  product_id: 'p3',
  related_id: 'p1',
  kind: 'complement',
  kind_label_fa: 'مکمل',
  direction: 'incoming',
  related: { id: 'p3', code: 'P-3', name: 'کالای سوم', status: 'active', status_label_fa: 'فعال', warning_fa: null },
  editable: false,
  removable: false,
};

const baseView = {
  product_id: 'p1',
  product: { id: 'p1', code: 'P-1', name: 'کالای اول', status: 'active', status_label_fa: 'فعال' },
  scope: 'central',
  actor: { can_view: true, can_update: true, unavailable_reason_fa: null },
  kinds: [
    { kind: 'substitute', label_fa: 'جایگزین', meaning_fa: 'جایگزینی انسانی', operational_effect_fa: 'هیچ جایگزینی خودکار انجام نمی‌شود.', cycle_policy: 'rejected_by_existing_rule' },
    { kind: 'complement', label_fa: 'مکمل', meaning_fa: 'همراهی در عرضه', operational_effect_fa: 'هیچ گسترش بسته‌ای ساخته نمی‌شود.', cycle_policy: 'no_approved_rule' },
  ],
  items: [relation, incoming],
  counts: { outgoing: 1, incoming: 1, substitute: 1, complement: 1, truncated: false },
  downstream_notes_fa: [
    'رابطه اطلاعاتی است: انتخابِ کالا در سفارش/فاکتور/بارنامه هرگز به‌طور خودکار عوض نمی‌شود.',
    'قیمت‌گذاری، موجودی، COGS و بسته‌بندی از این جدول خوانده نمی‌شوند؛ هیچ محاسبه‌ای تغییر نمی‌کند.',
  ],
  owner_decisions_fa: [
    { id: 'C6-D1', title_fa: 'جایگزینی خودکار', status: 'BLOCKED', detail_fa: 'نیازمند تصویب مالک است.' },
    { id: 'C6-D3', title_fa: 'حلقه مکمل', status: 'UNRESOLVED', detail_fa: 'سند مصوبی وجود ندارد.' },
  ],
};

const historyResponse = {
  items: [
    {
      id: '77', action: 'UPDATE', event_label_fa: 'ویرایش رابطه', actor_user_id: 'u1',
      actor_label_fa: 'مدیر کالا', at: '2026-11-07T10:05:00.000Z', kind: 'substitute',
      priority: 10, before_kind: 'substitute', before_priority: 100, product_id: 'p1', related_id: 'p2',
    },
  ],
  has_more: false, limit: 20, source_fa: 'تاریخچهٔ تغییرناپذیر',
};

const graphResponse = {
  product_id: 'p1', scope: 'central', depth: 2,
  nodes: [
    { product_id: 'p1', code: 'P-1', name: 'کالای اول', status: 'active', kind: null, depth: 0, via_relation_id: null },
    { product_id: 'p2', code: 'P-2', name: 'کالای دوم', status: 'blocked', kind: 'substitute', depth: 1, via_relation_id: 'rel-1' },
  ],
  edges: [{ relation_id: 'rel-1', from: 'p1', to: 'p2', kind: 'substitute', priority: 10 }],
  truncated: false,
  technical_limits: { max_depth: 3, max_nodes: 100, requested_depth: 2 },
  semantics_fa: 'پیمایش فنی است و حکم متقارن بودن نمی‌دهد.',
};

const mockReads = (view: unknown = baseView) => {
  get.mockImplementation(async (path: string) => {
    if (path === '/products/{id}/relations') return { data: view };
    if (path === '/products/{id}/relations/history') return { data: historyResponse };
    if (path === '/products/{id}/relations/graph') return { data: graphResponse };
    if (path === '/products') return { data: { items: [
      { id: 'p1', code: 'P-1', name: 'کالای اول', status: 'active' },
      { id: 'p2', code: 'P-2', name: 'کالای دوم', status: 'active' },
    ] } };
    return { data: null };
  });
};

afterEach(cleanup);
beforeEach(() => {
  get.mockReset();
  post.mockReset();
  patch.mockReset();
  del.mockReset();
});

describe('C6 Persian RTL relation UI', () => {
  it('renders both approved kinds, directions, status warnings and open decisions', async () => {
    mockReads();
    render(<ProductRelationsTab productId="p1" />);

    await screen.findByText('روابط کالا');
    expect(await screen.findByText('P-2')).toBeTruthy();
    expect(screen.getByText('P-3')).toBeTruthy();
    // The unapproved semantics must be visible, not hidden behind a toggle.
    expect(screen.getByText('کالای مرتبط در وضعیت «مسدود» است؛ رابطه حفظ می‌شود ولی استفادهٔ عملیاتی مجاز نیست.')).toBeTruthy();
    expect(screen.getByText(/BLOCKED/)).toBeTruthy();
    expect(screen.getByText(/UNRESOLVED/)).toBeTruthy();
    expect(screen.getByText(/هرگز به‌طور خودکار عوض نمی‌شود/)).toBeTruthy();
    expect(screen.getByText('از کالای مقابل مدیریت می‌شود')).toBeTruthy();
    expect(screen.getByText('ویرایش رابطه')).toBeTruthy();
  });

  it('adds a relation only with explicit confirmation and the approved payload', async () => {
    mockReads();
    post.mockResolvedValue({ data: relation });
    render(<ProductRelationsTab productId="p1" />);
    await screen.findByText('روابط کالا');

    fireEvent.click(screen.getByRole('button', { name: 'جست‌وجو' }));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/products', expect.anything()));
    const select = await screen.findByLabelText('کالای مرتبط');
    await waitFor(() => expect(select.querySelectorAll('option').length).toBe(2));
    fireEvent.change(select, { target: { value: 'p2' } });

    // Without explicit confirmation nothing is sent.
    fireEvent.click(screen.getByRole('button', { name: 'ثبت رابطه' }));
    expect(await screen.findByText('برای ثبت رابطه، تأیید صریح را فعال کنید.')).toBeTruthy();
    expect(post).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('تأیید افزودن رابطه'));
    fireEvent.click(screen.getByRole('button', { name: 'ثبت رابطه' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][0]).toBe('/products/{id}/relations');
    expect(post.mock.calls[0][1]).toMatchObject({
      params: { path: { id: 'p1' } },
      body: { related_id: 'p2', kind: 'substitute', priority: 100, confirm_add: true },
    });
    expect(await screen.findByText('رابطه ثبت شد و در تاریخچهٔ کاتالوگ ممیزی شد.')).toBeTruthy();
  });

  it('surfaces stable server codes in Persian and never claims success on failure', async () => {
    mockReads();
    post.mockResolvedValue({ error: { code: 'relation_cycle' } });
    render(<ProductRelationsTab productId="p1" />);
    await screen.findByText('روابط کالا');

    fireEvent.click(screen.getByRole('button', { name: 'جست‌وجو' }));
    const select = await screen.findByLabelText('کالای مرتبط');
    await waitFor(() => expect(select.querySelectorAll('option').length).toBe(2));
    fireEvent.change(select, { target: { value: 'p2' } });
    fireEvent.click(screen.getByLabelText('تأیید افزودن رابطه'));
    fireEvent.click(screen.getByRole('button', { name: 'ثبت رابطه' }));

    expect(await screen.findByText('این رابطه حلقهٔ جایگزینی ایجاد می‌کند و مجاز نیست.')).toBeTruthy();
    expect(screen.queryByText('رابطه ثبت شد و در تاریخچهٔ کاتالوگ ممیزی شد.')).toBeNull();
  });

  it('edits priority for outgoing rows and deletes only removable rows', async () => {
    mockReads();
    patch.mockResolvedValue({ data: { ...relation, priority: 5 } });
    del.mockResolvedValue({ data: { deleted: true, relation_id: 'rel-1' } });
    render(<ProductRelationsTab productId="p1" />);
    await screen.findByText('روابط کالا');

    fireEvent.click(screen.getByRole('button', { name: 'ویرایش اولویت' }));
    const input = screen.getByLabelText('اولویت تازه');
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0][1]).toMatchObject({
      params: { path: { id: 'p1', relationId: 'rel-1' } },
      body: { priority: 5 },
    });

    // Only one row is deletable (the incoming row is read-only).
    expect(screen.getAllByRole('button', { name: 'حذف' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'حذف' }));
    await waitFor(() => expect(del).toHaveBeenCalledTimes(1));
    expect(del.mock.calls[0][1]).toMatchObject({ params: { path: { id: 'p1', relationId: 'rel-1' } } });
    expect(await screen.findByText('رابطه حذف شد و در تاریخچهٔ کاتالوگ ثبت شد.')).toBeTruthy();
  });

  it('is read-only without master.product.update', async () => {
    mockReads({
      ...baseView,
      actor: { can_view: true, can_update: false, unavailable_reason_fa: 'این نشست مجوز ویرایش کاتالوگ (master.product.update) ندارد؛ فقط مشاهده مجاز است.' },
    });
    render(<ProductRelationsTab productId="p1" />);
    await screen.findByText('روابط کالا');
    expect(screen.getByText(/master\.product\.update/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'ثبت رابطه' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'ویرایش اولویت' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'حذف' })).toBeNull();
  });

  it('shows an explicit error state when the read fails', async () => {
    get.mockImplementation(async (path: string) =>
      path === '/products/{id}/relations' ? { error: { code: 'product_not_found' } } : { data: null });
    render(<ProductRelationsTab productId="p1" />);
    expect(await screen.findByText('کالا یافت نشد یا در دسترس این شرکت نیست.')).toBeTruthy();
  });

  it('maps every C6 server code to an actionable Persian message', () => {
    expect(relationErrorMessage({ code: 'self_relation' })).toContain('خودش');
    expect(relationErrorMessage({ code: 'duplicate_relation' })).toContain('از قبل ثبت شده');
    expect(relationErrorMessage({ code: 'relation_cycle' })).toContain('حلقه');
    expect(relationErrorMessage({ code: 'relation_not_found' })).toContain('یافت نشد');
    expect(relationErrorMessage({ code: 'relation_unchanged' })).toContain('تغییری نکرده');
    expect(relationErrorMessage({ code: 'forbidden_client_field' })).toContain('رد شد');
    expect(relationErrorMessage({ code: 'unsupported_request_field' })).toContain('تعریف نشده');
    expect(relationErrorMessage({ code: 'invalid_id' })).toContain('معتبر نیست');
    expect(relationErrorMessage({ code: 'domain_context_not_supported' })).toContain('دامنه');
  });
});
