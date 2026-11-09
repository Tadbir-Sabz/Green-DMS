import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import BulkMaintenancePage from './page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  canWrite: true,
}));

vi.mock('@/lib/api', () => ({
  api: { GET: mocks.get, POST: mocks.post },
  getToken: () => 'token',
}));
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    isLoading: false,
    hasPermission: (permission: string) =>
      permission === 'master.product.update' ? mocks.canWrite : false,
  }),
}));

const p1 = {
  id: '00000000-0000-4000-8000-000000000001',
  code: 'P-BULK-1',
  name: 'کالای نخست',
  status: 'active',
  distribution_kind: 'cold',
  min_order_qty: 1,
};
const p2 = {
  id: '00000000-0000-4000-8000-000000000002',
  code: 'P-BULK-2',
  name: 'کالای دوم',
  status: 'active',
  distribution_kind: 'warm',
  min_order_qty: 2,
};
const nameField = {
  key: 'name',
  label_fa: 'نام کالا',
  kind: 'text',
  nullable: false,
  max_length: 255,
};
const productPage = { items: [p1, p2], has_more: false, next_cursor: null };
const previewToken = 'a'.repeat(64);
const operationId = '00000000-0000-4000-8000-000000000010';
const preview = {
  operation_id: operationId,
  preview_token: previewToken,
  expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  status: 'preview_created',
  eligible_count: 2,
  rejected_count: 0,
  supported_fields: [nameField],
  items: [
    {
      product_id: p1.id,
      code: p1.code,
      name: p1.name,
      row_version: 1,
      status: 'eligible',
      reason_code: null,
      message_fa: null,
      changes: [
        {
          field: 'name',
          label_fa: 'نام کالا',
          before: p1.name,
          after: 'نام تازه',
          before_label: p1.name,
          after_label: 'نام تازه',
          changed: true,
        },
      ],
    },
    {
      product_id: p2.id,
      code: p2.code,
      name: p2.name,
      row_version: 1,
      status: 'eligible',
      reason_code: null,
      message_fa: null,
      changes: [
        {
          field: 'name',
          label_fa: 'نام کالا',
          before: p2.name,
          after: 'نام تازه',
          before_label: p2.name,
          after_label: 'نام تازه',
          changed: true,
        },
      ],
    },
  ],
};
const committedResult = {
  operation_id: operationId,
  status: 'committed',
  outcome: 'committed',
  lifecycle: [
    { state: 'preview_created', at: '2026-11-07T10:00:00Z' },
    { state: 'accepted', at: '2026-11-07T10:01:00Z' },
    { state: 'committed', at: '2026-11-07T10:02:00Z' },
  ],
  eligible_count: 2,
  updated_count: 2,
  rejected_count: 0,
  failure_category: 'none',
  reason_code: null,
  message_fa: null,
  accepted_at: '2026-11-07T10:01:00Z',
  committed_at: '2026-11-07T10:02:00Z',
  expires_at: preview.expires_at,
  idempotent_replay: false,
  reconciled: false,
  retryable: false,
  reconciliation_hint_fa: null,
  items: [
    {
      product_id: p1.id,
      code: p1.code,
      name: p1.name,
      status: 'updated',
      row_version_before: 1,
      row_version_after: 2,
      message_fa: 'ثبت شد',
      product_url: `/products/${p1.id}?tab=history`,
    },
    {
      product_id: p2.id,
      code: p2.code,
      name: p2.name,
      status: 'updated',
      row_version_before: 1,
      row_version_after: 2,
      message_fa: 'ثبت شد',
      product_url: `/products/${p2.id}?tab=history`,
    },
  ],
};

const defaultGet = (path: string) => {
  if (path === '/products/bulk-maintenance/fields') {
    return Promise.resolve({ data: { supported_fields: [nameField] } });
  }
  if (path === '/products') return Promise.resolve({ data: productPage });
  return Promise.resolve({ data: null });
};

const reachResult = async (executeResult: unknown): Promise<void> => {
  render(<BulkMaintenancePage />);
  await screen.findByLabelText(`انتخاب کالا ${p1.code}`);
  fireEvent.click(screen.getByLabelText(`انتخاب کالا ${p1.code}`));
  fireEvent.click(screen.getByLabelText(`انتخاب کالا ${p2.code}`));
  expect(screen.getAllByRole('status')[0].textContent).toContain('کالا انتخاب شده است');
  fireEvent.click(screen.getByLabelText('انتخاب فیلد نام کالا'));
  fireEvent.change(screen.getByLabelText('مقدار نام کالا'), {
    target: { value: 'نام تازه' },
  });
  const previewButton = screen.getByRole('button', {
    name: 'ساخت پیشنمایش سروری',
  }) as HTMLButtonElement;
  await waitFor(() => expect(previewButton.disabled).toBe(false));
  fireEvent.click(previewButton);
  await waitFor(() =>
    expect(mocks.post).toHaveBeenCalledWith('/products/bulk-maintenance/preview', {
      body: {
        product_ids: [p1.id, p2.id],
        changes: { name: 'نام تازه' },
      },
    }),
  );
  expect((await screen.findAllByText('نام تازه')).length).toBeGreaterThan(0);
  const executeButton = screen.getByRole('button', {
    name: 'اجرای تأییدشده',
  }) as HTMLButtonElement;
  expect(executeButton.disabled).toBe(true);
  fireEvent.click(screen.getByLabelText('تأیید نهایی اجرای نگهداشت گروهی'));
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'اجرای تأییدشده' }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole('button', { name: 'اجرای تأییدشده' }));
  await waitFor(() =>
    expect(mocks.post).toHaveBeenCalledWith('/products/bulk-maintenance/execute', {
      body: { operation_id: operationId, preview_token: previewToken, confirm: true },
    }),
  );
  expect(executeResult).toBeTruthy();
};

afterEach(cleanup);
beforeEach(() => {
  mocks.get.mockReset();
  mocks.post.mockReset();
  mocks.canWrite = true;
  mocks.get.mockImplementation(defaultGet);
  mocks.post.mockImplementation((path: string) => {
    if (path === '/products/bulk-maintenance/preview') {
      return Promise.resolve({ data: preview });
    }
    if (path === '/products/bulk-maintenance/execute') {
      return Promise.resolve({ data: committedResult });
    }
    return Promise.resolve({ data: null });
  });
});

describe('M4 Persian RTL bulk maintenance page', () => {
  it('requires the approved write permission, not view or export', async () => {
    mocks.canWrite = false;
    render(<BulkMaintenancePage />);
    expect(await screen.findByText(/مجوز/)).toBeTruthy();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('selects products, creates a read-only server preview, requires confirmation and shows history links', async () => {
    await reachResult(committedResult);
    expect(await screen.findByText('همه تغییرات ثبت شدند')).toBeTruthy();
    const links = screen.getAllByRole('link', { name: 'تاریخچه کالا' });
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute('href')).toBe(`/products/${p1.id}?tab=history`);
    expect(screen.getByText(/اجرای مجدد با همان شناسه انجام نمیشود/)).toBeTruthy();
  });

  it('shows a fail-closed unknown outcome and reconciles only via the status endpoint', async () => {
    const unknownResult = {
      ...committedResult,
      status: 'unknown',
      outcome: 'unknown',
      updated_count: 0,
      failure_category: 'unknown',
      reason_code: 'commit_outcome_unknown',
      message_fa: 'نتیجه نامشخص و شواهد ناکافی است.',
      reconciliation_hint_fa: 'بدون تطبیق قطعی اجرای مجدد انجام ندهید.',
      items: [],
    };
    const reconciledResult = {
      ...unknownResult,
      status: 'rejected',
      outcome: 'rolled_back',
      failure_category: 'infrastructure',
      reason_code: 'transaction_rolled_back',
      message_fa: 'هیچ تغییری ثبت نشد.',
      reconciled: true,
      reconciliation_hint_fa: null,
    };
    mocks.post.mockImplementation((path: string) => {
      if (path === '/products/bulk-maintenance/preview') {
        return Promise.resolve({ data: preview });
      }
      if (path === '/products/bulk-maintenance/execute') {
        return Promise.resolve({ data: unknownResult });
      }
      return Promise.resolve({ data: null });
    });
    mocks.get.mockImplementation((path: string) => {
      if (path === '/products/bulk-maintenance/operations/{operationId}') {
        return Promise.resolve({ data: reconciledResult });
      }
      return defaultGet(path);
    });
    await reachResult(unknownResult);
    expect(await screen.findByText('نتیجه نامشخص — بررسی لازم است')).toBeTruthy();
    expect(screen.getByText('بدون تطبیق قطعی اجرای مجدد انجام ندهید.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'بازخوانی وضعیت' }));
    await waitFor(() =>
      expect(mocks.get).toHaveBeenCalledWith(
        '/products/bulk-maintenance/operations/{operationId}',
        { params: { path: { operationId } } },
      ),
    );
    expect(await screen.findByText('عملیات رد شد')).toBeTruthy();
    expect(screen.getByText('وضعیت با شواهد ممیزی و تاریخچهای تطبیق داده شد.')).toBeTruthy();
  });
});
