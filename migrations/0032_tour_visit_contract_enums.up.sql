-- مهاجرت 0032 — هم‌ترازی enumهای تور/بازدید با قرارداد openapi
-- منبع: dms-design-report.md › ضمیمه G › G.۸ و openapi › schemas.Tour/Visit
-- فاز توسعه: ۳ | ماژول/بخش: تور و بازدید (ماژول ۵)
--
-- قرارداد (منبع حقیقت برای کلاینت‌ها) مقادیری دارد که DDL مهاجرت 0011 نداشت:
--   Tour.kind:   + distribution, telesales   (تور پخش و فروش تلفنی)
--   Tour.status: + active, closed            (معادل قراردادیِ in_progress/completed)
--   Visit.result:+ ordered, customer_absent  (معادل قراردادیِ order/closed)
-- تغییرها افزوده‌ای هستند (مقادیر پیشین دست‌نخورده می‌مانند) تا دادهٔ موجود نشکند.

alter table tour drop constraint if exists tour_kind_check;
alter table tour add constraint tour_kind_check
  check (kind in ('cold','warm','distribution','telesales'));

alter table tour drop constraint if exists tour_status_check;
alter table tour add constraint tour_status_check
  check (status in
    ('planned','approved','in_progress','completed','settled','cancelled','active','closed'));

alter table visit drop constraint if exists visit_result_check;
alter table visit add constraint visit_result_check
  check (result in
    ('order','no_order','closed','payment_only','return_only','ordered','customer_absent'));
