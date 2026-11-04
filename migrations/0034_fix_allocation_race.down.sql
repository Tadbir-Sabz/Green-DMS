-- معکوس 0034 — بازگردانی fn_check_allocation به نسخهٔ بدون قفلِ مهاجرت 0014
create or replace function fn_check_allocation() returns trigger
language plpgsql as $$
declare v_receipt numeric(19,2); v_allocated numeric(19,2);
        v_invoice numeric(19,2); v_inv_alloc numeric(19,2);
begin
  select amount into v_receipt from payment_receipt where id = new.receipt_id;
  select coalesce(sum(amount),0) into v_allocated
    from receipt_allocation where receipt_id = new.receipt_id and id <> coalesce(new.id, gen_random_uuid());
  if v_allocated + new.amount > v_receipt then
    raise exception 'جمع تخصیص‌ها از مبلغ رسید بیشتر می‌شود.';
  end if;

  select grand_total into v_invoice from invoice where id = new.invoice_id;
  select coalesce(sum(amount),0) + coalesce((select sum(amount) from credit_note where invoice_id = new.invoice_id and status='posted'),0)
    into v_inv_alloc
    from receipt_allocation where invoice_id = new.invoice_id and id <> coalesce(new.id, gen_random_uuid());
  if v_inv_alloc + new.amount > v_invoice then
    raise exception 'مبلغ تخصیص از مانده فاکتور بیشتر است.';
  end if;
  return new;
end $$;
