"use client";

import { FinanceGuard } from "@/components/auth/guards";
import GLInner from "./inner";

/** دفتر کل (ماژول ۹) — کدینگ حساب‌ها، اسناد، دوره‌های مالی و تراز آزمایشی */
export default function GLPage() {
  return (
    <FinanceGuard>
      <GLInner />
    </FinanceGuard>
  );
}
