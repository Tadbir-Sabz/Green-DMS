"use client";

import { EntityAttachments, type EntityAttachmentOwnerType } from "./EntityAttachments";

/**
 * نگهدارندهٔ سازگاری (TASK-PM-02-C3).
 *
 * پیشتر این فایل خودش فهرست/آپلود/دانلود را با `POST /attachments` عمومی
 * پیاده میکرد. اکنون **تنها** یک پیادهسازی UI ضمائم وجود دارد:
 * `EntityAttachments` (مسیر مالکمحور، مالک مشتقشده از مسیر، ممیزی تراکنشی،
 * پیشرفت واقعی آپلود، پیوند تازه، حالتهای خطا/تلاش مجدد). امضای قدیمی
 * `ownerType/ownerId/title/canUpload` بدون تغییر حفظ شده تا صفحهٔ جزئیات
 * سفارش و هر مصرفکنندهٔ دیگر نشکند. اگر `canUpload` ارسال نشود، مجوز
 * `attachment.upload` از نشست گرفته میشود (نه `true` پیشفرض) تا کنترل
 * غیرقابلاستفادهای برای کاربر فقطخواندنی نمایش داده نشود.
 *
 * API عمومی تاریخی `/attachments` و تابع `uploadAttachment` در `@/lib/api`
 * همچنان پابرجا و بدون تغییراند (سازگاری قرارداد)؛ فقط UI از لایهٔ مشترک
 * استفاده میکند. انواع مالک پذیرفتنی همان هفت نوع مصوب C3اند؛ `product`
 * توسط نمای محصولمحور C1 اداره میشود و `other` عمداً راستیآزماییناپذیر است.
 */
export function Attachments({
  ownerType,
  ownerId,
  title = "ضمائم",
  canUpload,
}: {
  ownerType: EntityAttachmentOwnerType;
  ownerId: string;
  title?: string;
  canUpload?: boolean;
}) {
  return (
    <EntityAttachments
      ownerType={ownerType}
      ownerId={ownerId}
      title={title}
      canUpload={canUpload}
      showNavigation={false}
    />
  );
}
