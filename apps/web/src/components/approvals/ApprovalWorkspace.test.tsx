import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ApprovalsPage from '@/app/approvals/page';
const get = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ api: { GET: get }, errorMessage: () => 'دسترسی مجاز نیست' }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ApprovalsPage /></QueryClientProvider>);
describe('approval register filters and accessible labels', () => {
  it('filters by binding supersession without rewriting the approved request status', async () => {
    get.mockResolvedValue({ data: [
      { id: 'old-record', entity_type: 'sales_order', status: 'approved', current_step: 1, binding: { superseded_at: '2026-01-01' } },
      { id: 'live-record', entity_type: 'sales_order', status: 'pending', current_step: 1 },
    ] });
    show(); await screen.findByText('old-record');
    fireEvent.change(screen.getByLabelText('وضعیت', { exact: true }), { target: { value: 'superseded' } });
    expect(screen.getByText('old-record')).toBeTruthy(); expect(screen.queryByText('live-record')).toBeNull();
    expect(screen.getByLabelText('نمایش', { exact: true })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('وضعیت', { exact: true }), { target: { value: 'approved' } });
    expect(screen.queryByText('old-record')).toBeNull();
    expect(screen.getByText('درخواستی با این فیلتر وجود ندارد.')).toBeTruthy();
  });
  it('does not show empty success state after a failed request', async () => {
    get.mockResolvedValue({ error: { code: 'forbidden' } }); show();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('درخواستی با این فیلتر وجود ندارد.')).toBeNull();
  });
});
