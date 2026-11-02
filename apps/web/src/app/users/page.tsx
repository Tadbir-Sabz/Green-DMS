"use client";

import AdminGuard from "@/components/auth/guards";
import UsersInner from "./inner";

export default function UsersPage() {
  return (
    <AdminGuard>
      <UsersInner />
    </AdminGuard>
  );
}
