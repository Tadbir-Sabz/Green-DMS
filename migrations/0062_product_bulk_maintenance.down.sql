-- TASK-PM-01D-M4 — بازگردانی صریح دفتر عملیات، با محافظت از دادهٔ پرشده.
--
-- پیش از F این فایل بیقیدوشرط drop table میکرد؛ اگر دفتر دارای عملیاتِ ثبتشده،
-- نامشخص، ردشده یا برگشتخورده بود، شواهد تطبیق/بازیابی نابود میشد. اکنون down
-- روی پایگاهدادهٔ پرشده fail-closed میدهد و تراکنش مهاجرت rollback میشود.
-- هیچ مقصد بایگانی خارجی، پاکسازی خودکار یا تأیید ضمنی فرض نشده است.
--
-- اپراتور (تنها با تأیید صریح مالک و خارج از این مخزن):
--   ۱) بایگانی قابل بازیابی از product_bulk_operation و شواهد ۰۰۶۳ تهیه کند؛
--   ۲) ردیفهای قطعی/نامشخص را با مرور دوعامل بررسی و تصمیم را مستند کند؛
--   ۳) تنها پس از خالیشدن کامل دفتر، npm run db:rollback را اجرا کند.
-- چرخهٔ خالی (fresh up/down/up) بدون دخالت اپراتور مجاز است.

do $$
begin
  if to_regclass('public.product_bulk_operation') is not null then
    if exists (select 1 from product_bulk_operation) then
      raise exception
        'بازگردانی ۰۰۶۲ روی دفتر عملیات پرشده مجاز نیست؛ شامل عملیاتهای committed، unknown، rejected و rolled_back میشود. نخست با تأیید مالک بایگانی قابل بازیابی تهیه و تصمیم اپراتور مستند شود، سپس دفتر خالی گردد. هیچ مقصد بایگانی خارجی یا حذف خودکار در کد فرض نشده است.'
        using errcode = 'integrity_constraint_violation';
    end if;
  end if;
end $$;

drop policy if exists p_product_bulk_operation_tenant on product_bulk_operation;
drop table if exists product_bulk_operation;
