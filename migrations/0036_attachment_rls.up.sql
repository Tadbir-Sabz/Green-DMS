-- مهاجرت 0036 — امنیت سطح سطر (RLS) روی attachment (دفاع در عمق)
-- ستون company_id در مهاجرت 0035 افزوده شد. حالا مانند سایر جداولِ اجاره‌محور
-- (مهاجرت 0021) سیاستِ سطح‌سطر اضافه می‌شود تا حتی اگر کوئریِ برنامه فراموش کند
-- company_id را فیلتر کند، خودِ دیتابیس از نشتِ دادهٔ ضمیمه بین اجاره‌ها جلوگیری کند.
-- TenantInterceptor برای هر درخواستِ احراز‌شده app.company_id را با set_config مقداردهی
-- می‌کند، پس GUC در زمانِ اجرای این سیاست تعریف شده است (هم‌راستا با 0021).
--
-- نکته: سیاست فقط USING دارد؛ در پستگرس برای INSERT همان عبارت به‌عنوان WITH CHECK
-- هم به‌کار می‌رود، یعنی ثبتِ ضمیمه تنها با company_idِ برابرِ نشستِ جاری مجاز است
-- (دقیقاً همان کاری که سرویس آپلود انجام می‌دهد).

alter table attachment enable row level security;

create policy p_attachment_tenant on attachment
  using (company_id = current_setting('app.company_id')::uuid);
