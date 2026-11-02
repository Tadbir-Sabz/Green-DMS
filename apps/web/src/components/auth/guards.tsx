"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { ADMIN_ROLES, FINANCE_ROLES, SALES_ROLES, WAREHOUSE_ROLES } from "@/lib/rbac";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  return <RoleGuard allowed={ADMIN_ROLES}>{children}</RoleGuard>;
}

export function SalesGuard({ children }: { children: React.ReactNode }) {
  return <RoleGuard allowed={SALES_ROLES}>{children}</RoleGuard>;
}

export function FinanceGuard({ children }: { children: React.ReactNode }) {
  return <RoleGuard allowed={FINANCE_ROLES}>{children}</RoleGuard>;
}

export function WarehouseGuard({ children }: { children: React.ReactNode }) {
  return <RoleGuard allowed={WAREHOUSE_ROLES}>{children}</RoleGuard>;
}
