"use client";

import { WarehouseGuard } from "@/components/auth/guards";
import Inner from "./inner";

export default function WarehousesPage() {
  return (
    <WarehouseGuard>
      <Inner />
    </WarehouseGuard>
  );
}
