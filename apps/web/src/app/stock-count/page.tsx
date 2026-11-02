"use client";

import { WarehouseGuard } from "@/components/auth/guards";

export default function StockCountPage() {
  return (
    <WarehouseGuard>
      <div className="p-6">انبارگردانی</div>
    </WarehouseGuard>
  );
}
