"use client";

import { WarehouseGuard } from "@/components/auth/guards";

export default function TransfersPage() {
  return (
    <WarehouseGuard>
      <div className="p-6">انتقال بین انباری</div>
    </WarehouseGuard>
  );
}
