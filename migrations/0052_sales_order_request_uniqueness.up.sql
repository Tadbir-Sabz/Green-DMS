-- مهاجرت 0052 — TASK-24X · A-1: یکتاییِ «یک درخواست ⇒ یک سفارشِ فعال»
--
-- زمینه: یافتهٔ A-1 حسابرسیِ TASK-24W. مسیرِ `POST /requests/{id}/convert` قفلِ
-- advisory داشت، ولی `POST /orders` با `request_id` هیچ قفلی نمی‌گرفت و
-- `sales_order.request_id` هم unique نبود ⇒ دو سفارشِ فعال برای یک درخواست.
--
-- چرا «unique سراسری روی request_id» کافی/درست نیست:
--   ۱) `request_id` در `sales_order` nullable است؛ ایندکسِ یکتای معمولی روی یک
--      ستونِ nullable چندین NULL را مجاز می‌داند (که درست است)، ولی این ایندکس
--      باید **partial** باشد تا سفارش‌های مستقلِ بدونِ درخواست کاملاً خارج بمانند
--      و ایندکس کوچک و سریع بماند.
--   ۲) دامنهٔ تجاری «درخواست» است، نه «درخواست + شرکت»: `customer_request.id`
--      خودش یکتای جهانی است و به یک شعبه/شرکت تعلق دارد؛ افزودنِ `company_id`
--      به کلید هیچ سفارشِ اضافه‌ای را مجاز نمی‌کرد و فقط ایندکس را متورم می‌کرد.
--   ۳) یک سندِ **لغوشده/ردشده** نباید درخواست را برای همیشه قفل کند: پس
--      ایندکس با شرطِ `status not in ('cancelled','rejected')` ساخته می‌شود تا
--      لغوِ سند، امکانِ تبدیلِ دوباره (با تاریخچهٔ حفظ‌شده) را باز کند.
--
-- پیش‌نیاز/ایمنیِ داده: اگر از قبل رکوردهای تکراریِ فعال وجود داشته باشد، این
-- مهاجرت **عمداً شکست می‌خورد** با لیستِ کاملِ درخواست‌های درگیر. حذف یا ادغامِ
-- خودکارِ اسنادِ مالی در یک مهاجرت ممنوع است؛ تصمیم با مالکِ داده است.

begin;

do $$
declare
  dup_count int;
  dup_list text;
begin
  select count(*), string_agg(request_id::text, ', ' order by request_id)
    into dup_count, dup_list
    from (
      select request_id
        from sales_order
       where request_id is not null
         and status not in ('cancelled', 'rejected')
       group by request_id
      having count(*) > 1
    ) d;

  if dup_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = format(
        'TASK-24X/A-1: %s درخواست دارای بیش از یک سفارشِ فعال است؛ ایمن‌سازی بدونِ پاک‌سازیِ داده ممکن نیست. درخواست‌های درگیر: %s',
        dup_count, dup_list
      ),
      hint = 'این اسناد مالی هستند؛ حذف/ادغامِ خودکار مجاز نیست. پس از تصمیمِ مالکِ داده، مهاجرت را دوباره اجرا کنید.';
  end if;
end $$;

-- ایندکسِ یکتای جزئی: حداکثر یک سفارشِ فعال برای هر درخواست
create unique index uq_sales_order_request_active
  on sales_order (request_id)
  where request_id is not null
    and status not in ('cancelled', 'rejected');

comment on index uq_sales_order_request_active is
  'TASK-24X/A-1: یک درخواستِ مشتری حداکثر یک سفارشِ فعال دارد؛ اسنادِ لغو/ردشده مستثنا هستند تا تبدیلِ دوباره ممکن بماند.';

-- ایندکسِ کمکی برای نگهبانِ کد (جست‌وجوی سفارشِ فعال بر اساسِ درخواست)
create index if not exists ix_sales_order_request_id
  on sales_order (request_id)
  where request_id is not null;

commit;
