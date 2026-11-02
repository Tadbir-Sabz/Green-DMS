-- بازگشت مهاجرت 0032 — بازگرداندن enumهای تور/بازدید به تعریف مهاجرت 0011
-- ردیف‌هایی با مقادیر قراردادیِ تازه پیش از بازگرداندن قید به مقادیر پیشین نگاشت می‌شوند.

update tour set status = 'in_progress' where status = 'active';
update tour set status = 'completed'   where status = 'closed';
update tour set kind   = 'warm'        where kind in ('distribution','telesales');
update visit set result = 'order'      where result = 'ordered';
update visit set result = 'closed'     where result = 'customer_absent';

alter table tour drop constraint if exists tour_kind_check;
alter table tour add constraint tour_kind_check check (kind in ('cold','warm'));

alter table tour drop constraint if exists tour_status_check;
alter table tour add constraint tour_status_check
  check (status in ('planned','approved','in_progress','completed','settled','cancelled'));

alter table visit drop constraint if exists visit_result_check;
alter table visit add constraint visit_result_check
  check (result in ('order','no_order','closed','payment_only','return_only'));
