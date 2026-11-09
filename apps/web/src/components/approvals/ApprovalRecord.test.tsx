import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApprovalRecord } from './ApprovalRecord';
const get = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ api: { GET: get }, errorMessage: () => 'دسترسی مجاز نیست' }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ApprovalRecord id="request-a" /></QueryClientProvider>);
const record = { id: 'request-a', entity_type: 'sales_order', entity_id: 'order-a', status: 'pending', current_step: 1, decisions: [], snapshot_steps: [] };

describe('immutable approval operator record', () => {
  it('shows loading without an actionable fabricated decision', () => {
    get.mockReturnValue(new Promise(() => {})); show();
    expect(screen.getByRole('status').textContent).toContain('بارگذاری');
    expect(screen.queryByRole('button', { name: 'ثبت تصمیم' })).toBeNull();
  });
  it('does not reconstruct provenance for historical requests', async () => {
    get.mockResolvedValue({ data: record }); show();
    expect(await screen.findByText(/منشأ ترکیب برای این سابقه ثبت نشده/)).toBeTruthy();
    expect(screen.getByText('هنوز تصمیمی ثبت نشده است.')).toBeTruthy();
    expect(get).toHaveBeenCalledWith('/rules-engine/approvals/{id}', { params: { path: { id: 'request-a' } } });
  });
  it('displays delegated identity, supersession and retained returned decision without reopening', async () => {
    get.mockResolvedValue({ data: { ...record, status: 'cancelled', binding: { superseded_at: '2026-01-01T00:00:00Z' }, decisions: [{ step_no: 1, decision: 'returned', decided_by: 'delegate-a', meta: { delegated_from: 'principal-a' }, comment: 'اصلاح مبلغ' }] } }); show();
    expect(await screen.findByText('جایگزین شده')).toBeTruthy();
    expect(screen.getByText('principal-a')).toBeTruthy();
    expect(screen.getByText('اصلاح مبلغ')).toBeTruthy();
    expect(screen.queryByText('بررسی امکان تصمیم در کارتابل من')).toBeNull();
    expect(screen.getByRole('link', { name: /مشاهده سند/ }).getAttribute('href')).toBe('/orders/order-a');
  });
  it('shows denied/error state rather than leaked record content', async () => {
    get.mockResolvedValue({ error: { code: 'forbidden' } }); show();
    expect((await screen.findByRole('alert')).textContent).toContain('دسترسی مجاز نیست');
    expect(screen.queryByText('request-a')).toBeNull();
  });
  it('renders persisted policy provenance and stages rather than current policy', async () => {
    get.mockResolvedValue({ data: { ...record, policy_snapshot: { version: 1, policies: [{ id: 'policy-original', scope: 'central', approval_chain_id: 'chain-original' }] }, snapshot_steps: [{ step_no: 1, approver_role_id: 'role-original', is_mandatory: true }] } }); show();
    expect(await screen.findByText('policy-original')).toBeTruthy();
    expect(screen.getByText('role-original')).toBeTruthy();
    expect(get).toHaveBeenCalledTimes(1);
  });
});
