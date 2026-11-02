-- بازگشت 0026 — حذف نگاشت‌ها و مجوزها، سپس جدول انتساب حوزه کار
-- نگاشت‌ها پیش از permission حذف می‌شوند (permission_code کلید خارجی permission است)

delete from role_permission
 where permission_code in ('master.staff.view', 'master.staff.create', 'master.staff.update');

delete from permission
 where code in ('master.staff.view', 'master.staff.create', 'master.staff.update');

drop table if exists staff_area;
