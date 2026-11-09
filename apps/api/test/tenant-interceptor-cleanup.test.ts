import { describe, expect, it, vi } from 'vitest';
import { lastValueFrom, of } from 'rxjs';
import type { ExecutionContext } from '@nestjs/common';
import { TenantInterceptor } from '../src/common/tenant.interceptor';
import { tenantStorage } from '../src/database/tenant-context';

const context = (req: unknown) => ({ getType: () => 'http', switchToHttp: () => ({ getRequest: () => req }) }) as ExecutionContext;

describe('authenticated portal tenant scope and cleanup', () => {
  it('portal does not impersonate a staff user and cleanup failures discard the connection', async () => {
    const failure = new Error('injected cleanup failure');
    const release = vi.fn();
    const query = vi.fn().mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(failure);
    const interceptor = new TenantInterceptor({ connect: async () => ({ query, release }) } as never);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const observable = await interceptor.intercept(context({ portal: { companyId: 'company-A', portalUserId: 'portal-A' } }), {
        handle: () => {
          expect(tenantStorage.getStore()?.tenant).toEqual({ companyId: 'company-A', userId: '' });
          return of('ok');
        },
      });
      expect(await lastValueFrom(observable)).toBe('ok');
      await vi.waitFor(() => expect(release).toHaveBeenCalledWith(failure));
      expect(query.mock.calls[0][1]).toEqual(['company-A', '']);
    } finally { errors.mockRestore(); }
  });

  it('failed scope setup destroys the connection and never invokes business handler', async () => {
    const failure = new Error('injected apply failure');
    const release = vi.fn();
    const query = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce({ rows: [] });
    const handler = { handle: vi.fn(() => of('must not execute')) };
    const interceptor = new TenantInterceptor({ connect: async () => ({ query, release }) } as never);
    await expect(interceptor.intercept(context({ auth: { companyId: 'A', userId: 'U' } }), handler)).rejects.toThrow(failure);
    expect(release).toHaveBeenCalledWith(failure);
    expect(handler.handle).not.toHaveBeenCalled();
  });
});
