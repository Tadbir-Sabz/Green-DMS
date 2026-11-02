"use client";

import { WarehouseGuard } from "@/components/auth/guards";

export default function IssuesPage() {
  return (
    <WarehouseGuard>
      <div className="p-6">حواله فروش</div>
    </WarehouseGuard>
  );
}
