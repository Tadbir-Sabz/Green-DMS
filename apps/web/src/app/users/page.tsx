"use client";

import AdminGuard from "@/components/auth/guards";

export default function UsersPage() {
  return (
    <AdminGuard>
      <div className="p-6">مدیریت کاربران و نقش‌ها</div>
    </AdminGuard>
  );
}
