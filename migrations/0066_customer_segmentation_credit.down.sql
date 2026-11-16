-- مهاجرت 0066 (down) — حذفِ کاملِ افزودنی‌های P3
-- ترتیب معکوسِ up؛ هیچ داده‌ای از جدول‌های پیش از این مهاجرت لمس نمی‌شود جز ستون‌های تازهٔ همین مهاجرت.

begin;

-- §4 مجوزها
delete from role_permission where permission_code in (
  'master.customer_segment.manage', 'ar.credit.hold'
);
delete from permission where code in (
  'master.customer_segment.manage', 'ar.credit.hold'
);

-- §3 ستون‌های مسدودیِ اعتبار روی customer_credit
alter table customer_credit
  drop constraint if exists ck_customer_credit_hold_clear,
  drop constraint if exists ck_customer_credit_hold_meta,
  drop constraint if exists ck_customer_credit_hold_reason,
  drop column if exists credit_hold,
  drop column if exists hold_reason,
  drop column if exists hold_set_at,
  drop column if exists hold_set_by;

-- §2 ستون segment_id روی customer (ایندکس همراه ستون حذف می‌شود)
alter table customer drop column if exists segment_id;

-- §1 جدول بخش‌بندی (تریگر/سیاست/ایندکس‌ها همراه جدول حذف می‌شوند)
drop table if exists customer_segment cascade;

commit;
