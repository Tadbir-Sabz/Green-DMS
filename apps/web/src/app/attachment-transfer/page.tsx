"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import AttachmentTransferCenter from "@/components/AttachmentTransferCenter";

/**
 * TASK-PM-02-C4 — مرکز انتقال ضمائم. محافظ صفحه فقط `attachment.view` موجود
 * را میخواهد؛ مجوزهای `attachment.upload` و `master.product.view` برای کنترلها
 * و انتخابهای مربوط، در همان جزء و دوباره در سرور بررسی میشوند.
 */
export default function AttachmentTransferPage() {
  return (
    <RoleGuard permission="attachment.view">
      <AttachmentTransferCenter />
    </RoleGuard>
  );
}
