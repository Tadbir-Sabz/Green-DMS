"use client";

import AdminGuard from "@/components/auth/guards";
import RolesInner from "./inner";

export default function RolesPage() {
  return (
    <AdminGuard>
      <RolesInner />
    </AdminGuard>
  );
}
