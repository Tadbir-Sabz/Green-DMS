"use client";

import { FinanceGuard } from "@/components/auth/guards";

export default function GLPage() {
  return (
    <FinanceGuard>
      <div className="p-6">دفتر کل</div>
    </FinanceGuard>
  );
}
