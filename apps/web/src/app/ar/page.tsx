"use client";

import { FinanceGuard } from "@/components/auth/guards";
import ARInner from "./inner";

export default function ARPage() {
  return (
    <FinanceGuard>
      <ARInner />
    </FinanceGuard>
  );
}
