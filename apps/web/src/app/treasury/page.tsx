"use client";

import { FinanceGuard } from "@/components/auth/guards";
import TreasuryInner from "./inner";

export default function TreasuryPage() {
  return (
    <FinanceGuard>
      <TreasuryInner />
    </FinanceGuard>
  );
}
