"use client";

import { FinanceGuard } from "@/components/auth/guards";
import APInner from "./inner";

export default function APPage() {
  return (
    <FinanceGuard>
      <APInner />
    </FinanceGuard>
  );
}
