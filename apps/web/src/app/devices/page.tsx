"use client";

import { AppShell } from '@/components/AppShell';

export default function DevicesPage() {
  return (
    <AppShell>
      <div className="space-y-4">
        <h1 className="text-xl font-bold">مدیریت دستگاه‌ها</h1>
        <div className="bg-white border rounded-lg p-6 text-gray-500">لیست دستگاه‌های میدانی</div>
      </div>
    </AppShell>
  );
}
