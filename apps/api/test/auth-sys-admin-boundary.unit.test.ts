import { describe, expect, it, vi } from 'vitest';
import { AuthRepository } from '../src/modules/identity-rbac/auth.repository';

describe('effective permissions for sys_admin', () => {
  it('removes direct and broad indirect sales.return.credit grants while retaining unrelated admin permissions', async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [
          { role_id: 'sys', role_code: 'sys_admin', permission_code: 'admin.*' },
          { role_id: 'sys', role_code: 'sys_admin', permission_code: 'sales.*' },
          { role_id: 'extra', role_code: 'extra_role', permission_code: 'sales.return.credit' },
        ] })
        .mockResolvedValueOnce({ rows: [
          { code: 'sales.return.request' },
          { code: 'sales.return.credit' },
          { code: 'sales.return.post' },
          { code: 'sales.order.create' },
        ] }),
    } as never;
    const summary = await new AuthRepository(pool).getRolesAndPermissions('user');
    expect(summary.roles.map((role) => role.code)).toEqual(['sys_admin', 'extra_role']);
    expect(summary.permissions).not.toContain('sales.return.credit');
    expect(summary.permissions).toContain('admin.*');
    expect(summary.permissions).toContain('sales.return.request');
    expect(summary.permissions).toContain('sales.return.post');
    expect(summary.permissions).toContain('sales.order.create');
  });
});
