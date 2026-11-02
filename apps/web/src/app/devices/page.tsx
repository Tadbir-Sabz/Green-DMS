"use client";

import AdminGuard from "@/components/auth/guards";
import DevicesInner from "./inner";

export default function DevicesPage() {
  return (
    <AdminGuard>
      <DevicesInner />
    </AdminGuard>
  );
}
