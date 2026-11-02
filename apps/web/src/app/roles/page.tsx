"use client";

import AdminGuard from "@/components/auth/guards";

export default function RolesPage() {
  return (
    <AdminGuard>
      <div className="p-6">نقش‌ها و دسترسی‌ها</div>
    </AdminGuard>
  );
}
