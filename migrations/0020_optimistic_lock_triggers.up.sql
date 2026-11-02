-- مهاجرت 0020 — تریگر قفل خوش‌بینانه (row_version) و ممیزی زمان (updated_at)
-- منبع: dms-design-report.md › ضمیمه G › G.۲ (ستون‌های ممیزی) و G.۲.۱ (fn_touch)
-- فاز توسعه: ۱ | بدون این تریگرها row_version هرگز تغییر نمی‌کند و قفل خوش‌بینانه
-- وب (و حل تعارض همگام‌سازی آفلاین) بی‌اثر می‌شود؛ به همین دلیل در مهاجرت گنجانده شده است.

create trigger trg_touch before update on company
  for each row execute function fn_touch();

create trigger trg_touch before update on branch
  for each row execute function fn_touch();

create trigger trg_touch before update on sales_area
  for each row execute function fn_touch();

create trigger trg_touch before update on person
  for each row execute function fn_touch();

create trigger trg_touch before update on staff
  for each row execute function fn_touch();

create trigger trg_touch before update on app_user
  for each row execute function fn_touch();

create trigger trg_touch before update on product
  for each row execute function fn_touch();

create trigger trg_touch before update on customer
  for each row execute function fn_touch();

create trigger trg_touch before update on warehouse
  for each row execute function fn_touch();

create trigger trg_touch before update on stock_count
  for each row execute function fn_touch();

create trigger trg_touch before update on stock_adjustment
  for each row execute function fn_touch();

create trigger trg_touch before update on rule
  for each row execute function fn_touch();

create trigger trg_touch before update on customer_request
  for each row execute function fn_touch();

create trigger trg_touch before update on sales_order
  for each row execute function fn_touch();

create trigger trg_touch before update on invoice
  for each row execute function fn_touch();

create trigger trg_touch before update on tour
  for each row execute function fn_touch();

create trigger trg_touch before update on cheque
  for each row execute function fn_touch();

create trigger trg_touch before update on payment_receipt
  for each row execute function fn_touch();

create trigger trg_touch before update on gl_account
  for each row execute function fn_touch();

create trigger trg_touch before update on journal_entry
  for each row execute function fn_touch();
