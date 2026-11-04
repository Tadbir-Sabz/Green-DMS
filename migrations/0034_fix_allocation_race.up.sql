-- مهاجرت 0034 — رفع شرایط رقابتی (TOCTOU) در fn_check_allocation
-- تریگر trg_receipt_allocation_check (مهاجرت 0014) مبلغ هر تخصیص را با مجموع
-- تخصیص‌های رسید/فاکتور می‌سنجد، اما سطر payment_receipt و invoice را قفل نمی‌کرد.
-- در نتیجه دو رسیدِ هم‌زمان روی یک فاکتور، هرکدام در READ COMMITTED فقط تخصیص‌های
-- commit‌شده را می‌دیدند و هر دو از تریگر می‌گذشتند → تخصیص بیش از ماندهٔ فاکتور
-- (paid_amount > grand_total؛ چون روی invoice هیچ CHECK برای این سقف نیست).
-- بازتولید عملی روی PostgreSQL 16: ۷ از ۸ اجرای هم‌زمان، فاکتور ۱۰۰ واحدی را به ۱۲۰ رساند.
-- اصلاح: خواندن سطر رسید و فاکتور با «for update» تا تخصیص‌های هم‌زمان روی همان
-- رسید/فاکتور سریال شوند؛ تراکنش دوم پس از commit اولی مجموعِ به‌روز را می‌بیند و
-- در صورت تجاوز، درست رد می‌شود. (پس از اصلاح: ۰ از ۸؛ تخصیص‌های معتبرِ متوالی دست‌نخورده.)
create or replace function fn_check_allocation() returns trigger
language plpgsql as $$
declare v_receipt numeric(19,2); v_allocated numeric(19,2);
        v_invoice numeric(19,2); v_inv_alloc numeric(19,2);
begin
  select amount into v_receipt from payment_receipt where id = new.receipt_id for update;
  select coalesce(sum(amount),0) into v_allocated
    from receipt_allocation where receipt_id = new.receipt_id and id <> coalesce(new.id, gen_random_uuid());
  if v_allocated + new.amount > v_receipt then
    raise exception 'جمع تخصیص‌ها از مبلغ رسید بیشتر می‌شود.';
  end if;

  select grand_total into v_invoice from invoice where id = new.invoice_id for update;
  select coalesce(sum(amount),0) + coalesce((select sum(amount) from credit_note where invoice_id = new.invoice_id and status='posted'),0)
    into v_inv_alloc
    from receipt_allocation where invoice_id = new.invoice_id and id <> coalesce(new.id, gen_random_uuid());
  if v_inv_alloc + new.amount > v_invoice then
    raise exception 'مبلغ تخصیص از مانده فاکتور بیشتر است.';
  end if;
  return new;
end $$;
