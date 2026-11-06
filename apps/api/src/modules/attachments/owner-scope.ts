/**
 * نگاشتِ «نوعِ مالکِ ضمیمه» به مسیرِ راستی‌آزمایی‌شدهٔ مالکیتِ اجاره.
 *
 * چرا این فایل لازم است: جدولِ attachment فقط company_id دارد و owner_id یک UUIDِ آزاد است؛
 * بنابراین فیلترِ company_id به‌تنهایی ثابت نمی‌کند که موجودیتِ مالک واقعاً به همان شرکت تعلق
 * دارد (یک کاربر می‌تواند owner_idِ متعلقِ شرکتِ دیگر را حدس بزند و ضمیمه را به آن گره بزند یا
 * از راهِ فهرستِ owner، وجودش را کاوش کند). این ماژول مالکیت را از راهِ «زنجیرهٔ والد» در خودِ
 * پایگاه‌داده اثبات می‌کند.
 *
 * مقادیرِ مجازِ owner_type دقیقاً همان enumِ قراردادِ openapi است:
 *   pod | invoice | journal_entry | receipt | return_request | sales_order | product | stock_count | other
 *
 * نگاشت، مستند به شواهدِ واقعیِ اسکیمان (نه حدس):
 *   invoice        → invoice.branch_id        (NOT NULL) → branch.company_id
 *   sales_order    → sales_order.branch_id    (NOT NULL) → branch.company_id
 *   return_request → return_request.branch_id (NOT NULL) → branch.company_id
 *   stock_count    → stock_count.branch_id    (NOT NULL) → branch.company_id
 *   product        → product.company_id       (NOT NULL)
 *   journal_entry  → journal_entry.company_id (NOT NULL؛ branch_id در این جدول nullable است)
 *   pod            → pod.delivery_id          (NOT NULL UNIQUE) → delivery.branch_id → branch.company_id
 *   receipt        → payment_receipt.branch_id(NOT NULL) → branch.company_id
 *   other          → هیچ موجودیتِ کسب‌وکاری وجود ندارد ⇒ راستی‌آزمایی‌ناپذیر ⇒ fail-closed
 *
 * رفعِ ابهامِ «receipt» با شاهدِ پایگاه‌داده: تنها کلیدِ خارجیِ ورودی که نامِ receipt دارد
 * `receipt_allocation.receipt_id references payment_receipt(id)` است؛ goods_receipt یک سندِ
 * رسیدِ انبارِ خرید (GRN) است، client_sync_receipt تأییدیهٔ همگام‌سازیِ آفلاین است و
 * receipt_allocation خودِ «رسید» نیست بلکه سطرِ تخصیصِ آن است. پس receipt = payment_receipt.
 *
 * نکتهٔ امنیتی: هیچ‌کدام از کوئری‌ها ورودیِ کاربر را در رشتهٔ SQL درج نمی‌کنند؛ owner_type فقط
 * برایِ انتخابِ یکی از عبارت‌هایِ ثابتِ همین allowlist به‌کار می‌رود و owner_id همیشه $1 بایند است.
 */

/** عبارتِ SQLِ ثابتِ هر نوعِ مالک؛ company_idِ اجارهٔ مالک را برمی‌گرداند (یا هیچ سطری). */
const OWNER_TENANT_SQL: Readonly<Record<string, string>> = {
  invoice: `select b.company_id
              from invoice i
              join branch b on b.id = i.branch_id
             where i.id = $1::uuid`,
  sales_order: `select b.company_id
                  from sales_order o
                  join branch b on b.id = o.branch_id
                 where o.id = $1::uuid`,
  return_request: `select b.company_id
                     from return_request r
                     join branch b on b.id = r.branch_id
                    where r.id = $1::uuid`,
  stock_count: `select b.company_id
                  from stock_count s
                  join branch b on b.id = s.branch_id
                 where s.id = $1::uuid`,
  product: `select p.company_id from product p where p.id = $1::uuid`,
  journal_entry: `select j.company_id from journal_entry j where j.id = $1::uuid`,
  pod: `select b.company_id
          from pod p
          join delivery d on d.id = p.delivery_id
          join branch b on b.id = d.branch_id
         where p.id = $1::uuid`,
  receipt: `select b.company_id
              from payment_receipt r
              join branch b on b.id = r.branch_id
             where r.id = $1::uuid`,
};

/** همهٔ انواعِ مالکِ شناخته‌شده در قرارداد (برایِ تست و مستندسازی). */
export const KNOWN_OWNER_TYPES: readonly string[] = Object.freeze([
  ...Object.keys(OWNER_TENANT_SQL),
  'other',
]);

/** انواعی که مسیرِ مالکیتِ راستی‌آزمایی‌شده دارند. */
export const VERIFIABLE_OWNER_TYPES: readonly string[] = Object.freeze(
  Object.keys(OWNER_TENANT_SQL),
);

/**
 * آیا این owner_type مسیرِ مالکیتِ راستی‌آزمایی‌شده دارد؟
 * `other` عمداً false است: هیچ موجودیتِ کسب‌وکاری پشتِ آن نیست.
 */
export function hasVerifiableOwner(ownerType: string): boolean {
  return Object.prototype.hasOwnProperty.call(OWNER_TENANT_SQL, ownerType);
}

/** عبارتِ SQLِ مسیرِ مالکیت، یا null اگر راستی‌آزمایی‌ناپذیر باشد. */
export function ownerTenantSql(ownerType: string): string | null {
  return OWNER_TENANT_SQL[ownerType] ?? null;
}

/**
 * آیا ضمیمه‌هایِ «بدونِ مالکِ راستی‌آزمایی‌پذیر» پذیرفته شوند؟
 * پیش‌فرض false = fail-closed. اپراتور می‌تواند با env آن را باز کند (مثلاً برایِ
 * مهاجرتِ داده‌هایِ تاریخی) بدونِ اینکه رفتارِ پیش‌فرضِ امن سامانه عوض شود.
 */
export function allowUnverifiedOwner(): boolean {
  return process.env.ATTACHMENT_ALLOW_UNVERIFIED_OWNER === 'true';
}
