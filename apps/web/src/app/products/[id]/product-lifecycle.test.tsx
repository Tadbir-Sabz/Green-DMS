import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProductLifecycleTab } from './product-lifecycle';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { GET: get, POST: post } }));

const view = {
  product_id: 'p1',
  scope: 'central',
  status: 'active',
  status_label_fa: 'فعال (مرکزی)',
  row_version: 3,
  policy: {
    source: 'existing_d4_contract',
    permissions_fa: 'مجوز ویرایش و وضعیت از پایگاهداده بررسی میشود.',
    confirmation_fa: 'تأیید صریح لازم است.',
    concurrency_fa: 'نسخهٔ کالا الزامی است.',
    two_person_approval: 'BLOCKED',
  },
  actor: {
    can_update: true,
    can_change_status: true,
    can_transition: true,
    unavailable_reason_fa: null,
  },
  available_actions: [
    {
      action_id: 'block',
      target_status: 'blocked',
      label_fa: 'مسدود کردن کالا',
      confirmation_required: true,
      method: 'POST',
      path: '/products/{id}/lifecycle/transitions',
      requires_row_version: true,
      decision_dependency_fa: null,
    },
  ],
  transitions: [
    {
      source_status: 'active', target_status: 'active', supported: false,
      action_id: 'unsupported', label_fa: 'گذار پشتیبانینشده',
      reason_fa: 'وضعیت مبدأ و مقصد یکی است.',
      validation_fa: 'رد صریح', authorization_fa: 'بدون مجوز تازه',
      side_effects_fa: [], dependent_modules_fa: [], audit_fa: 'بدون رویداد',
      evidence: [], test_coverage_fa: [], decision_dependency_fa: null,
      rejection_code: 'lifecycle_transition_unchanged',
    },
  ],
  downstream_notes_fa: ['قیمت و بارنامه رفتار موجود را حفظ میکنند.'],
  owner_decisions_fa: ['معنای توقف وابسته به تصویب مالک است.'],
  history: {
    items: [
      {
        id: '42', action: 'INSERT', event_label_fa: 'ایجاد',
        from_status: null, to_status: 'active', actor_user_id: 'actor-1',
        actor_label_fa: 'مدیر کالا', at: '2026-11-07T10:00:00.000Z',
      },
    ],
    has_more: false, next_cursor: null,
  },
};

afterEach(cleanup);
beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe('C5 Persian central lifecycle UI', () => {
  it('renders current state, actor/time history and performs a confirmed real transition', async () => {
    get.mockResolvedValue({ data: view });
    post.mockResolvedValue({ data: { message_fa: 'وضعیت مرکزی تغییر کرد.' } });
    const onChanged = vi.fn(async () => undefined);
    render(<ProductLifecycleTab productId="p1" onChanged={onChanged} />);

    await screen.findByText('فعال (مرکزی)');
    expect(get).toHaveBeenCalledWith('/products/{id}/lifecycle', {
      params: { path: { id: 'p1' }, query: { limit: 30 } },
    });
    expect(screen.getByText('مدیر کالا', { exact: false })).toBeTruthy();
    expect(screen.getByText(/۱۴۰۵/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'مسدود کردن کالا' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'تأیید و اجرای گذار' }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith('/products/{id}/lifecycle/transitions', {
      params: { path: { id: 'p1' } },
      body: { target_status: 'blocked', row_version: 3, confirm_sensitive: true },
    });
    await screen.findByText('وضعیت مرکزی تغییر کرد.');
    expect(onChanged).toHaveBeenCalled();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it('shows a clear unavailable reason without fake or blocked action controls', async () => {
    get.mockResolvedValue({
      data: {
        ...view,
        actor: { ...view.actor, can_transition: false, unavailable_reason_fa: 'این نشست مجوز ممتاز تغییر وضعیت ندارد.' },
        available_actions: [],
      },
    });
    render(<ProductLifecycleTab productId="p1" onChanged={() => undefined} />);
    await screen.findByText('این نشست مجوز ممتاز تغییر وضعیت ندارد.');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'مسدود کردن کالا' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'تأیید و اجرای گذار' })).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it('never renders a discontinued action or control and states the owner-gated BLOCKED policy', async () => {
    get.mockResolvedValue({
      data: {
        ...view,
        status: 'discontinued',
        status_label_fa: 'متوقف (مرکزی)',
        available_actions: [
          {
            ...view.available_actions[0],
            action_id: 'discontinue',
            target_status: 'discontinued',
            label_fa: 'توقف عرضه مرکزی',
          },
        ],
      },
    });
    render(<ProductLifecycleTab productId="p1" onChanged={() => undefined} />);
    await screen.findByText('متوقف (مرکزی)');
    expect(screen.getByText(/BLOCKED \/ NOT AUTHORIZED/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'توقف عرضه مرکزی' })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'تأیید و اجرای گذار' })).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it('maps a blocked discontinued API failure to explicit Persian feedback', async () => {
    get.mockResolvedValue({ data: view });
    post.mockResolvedValue({ error: { code: 'lifecycle_transition_blocked', message_fa: 'گذار مسدود است.' } });
    render(<ProductLifecycleTab productId="p1" onChanged={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'مسدود کردن کالا' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'تأیید و اجرای گذار' }));
    await screen.findByText(/BLOCKED \/ NOT AUTHORIZED/);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('surfaces a read error and retries the same endpoint', async () => {
    get.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: view });
    render(<ProductLifecycleTab productId="p1" onChanged={() => undefined} />);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }));
    await screen.findByText('فعال (مرکزی)');
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('maps a stale-version API failure to Persian feedback and reloads server state', async () => {
    get.mockResolvedValue({ data: view });
    post.mockResolvedValue({ error: { code: 'version_conflict', message_fa: 'تعارض نسخه' } });
    render(<ProductLifecycleTab productId="p1" onChanged={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'مسدود کردن کالا' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'تأیید و اجرای گذار' }));
    await screen.findByText('کالا همزمان تغییر کرده است؛ اطلاعات تازه شد. پس از بررسی دوباره تلاش کنید.');
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });
});
