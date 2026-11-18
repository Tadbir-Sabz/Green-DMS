-- بازگشت مهاجرت 0067 — برعکسِ up
drop view if exists v_invoice_return_summary;

-- حذفِ نگاشت‌های ایجادشده در up (مجوز تازه بود؛ seed 0022 نمی‌توانست آن را داشته باشد).
delete from role_permission
 where permission_code = 'sales.return.credit'
   and role_id in (select id from role where code in ('accountant', 'sales_manager', 'ceo'));
delete from permission where code = 'sales.return.credit';

alter table return_request
  drop column valuation_status;

drop index if exists ix_credit_note_invoice_posted;
drop index if exists ix_credit_note_line_invoice_line;
drop index if exists ix_return_request_line_invoice_line;

alter table return_request_line
  drop column invoice_line_id;
