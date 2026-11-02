"use client";

import { FinanceGuard } from "@/components/auth/guards";

export default function APPage() {
  return (
    <FinanceGuard>
      <div className="p-6">حساب‌های پرداختنی</div>
    </FinanceGuard>
  );
}
