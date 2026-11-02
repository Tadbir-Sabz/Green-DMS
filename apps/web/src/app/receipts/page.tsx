"use client";

import { WarehouseGuard } from "@/components/auth/guards";

export default function ReceiptsPage() {
  return (
    <WarehouseGuard>
      <div className="p-6">رسید خرید</div>
    </WarehouseGuard>
  );
}
