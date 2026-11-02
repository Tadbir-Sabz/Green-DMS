"use client";

import { FinanceGuard } from "@/components/auth/guards";

export default function TreasuryPage() {
  return (
    <FinanceGuard>
      <div className="p-6">خزانه‌داری</div>
    </FinanceGuard>
  );
}
