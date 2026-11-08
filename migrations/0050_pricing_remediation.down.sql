-- مهاجرت 0050 (down) — بازگرداندنِ وضعیتِ پس از 0049
--
-- توجه: با حذفِ این مهاجرت، «تغییرناپذیریِ دفترِ مصرف» و «سیاستِ پایدارِ قیمت‌گذاری»
-- برداشته می‌شود و گرانتِ UPDATE/DELETE دفترِ مصرف بازمی‌گردد (وضعیتِ دقیقِ 0049).

begin;

-- §3 مجوزها (وابستگی‌های نقش هم پاک می‌شوند)
delete from role_permission where permission_code in (
  'pricing.settings.view', 'pricing.settings.update',
  'pricing.backdate.apply', 'pricing.price_list.cross_domain'
);
delete from permission where code in (
  'pricing.settings.view', 'pricing.settings.update',
  'pricing.backdate.apply', 'pricing.price_list.cross_domain'
);

-- §2 سیاست
drop table if exists pricing_settings;

-- §1 تغییرناپذیری
drop trigger if exists trg_promotion_redemption_immutable on promotion_redemption;
drop function if exists fn_promotion_redemption_immutable();
grant select, insert, update, delete on promotion_redemption to dms_app;

commit;
