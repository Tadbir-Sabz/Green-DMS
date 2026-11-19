-- 0068 (برگشت) — حذف سخت‌سازیِ دفترِ موجودی و بازگردانی گرانت‌های 0041
-- داده‌ها و سطرهای ممیزی دست‌نخورده می‌مانند.

drop function if exists fn_inventory_txn_maintenance_begin(text, uuid);

-- تریگرهای جمله‌ای صریحِ پارتیشن‌ها (در مهاجرت بالا ساخته شد) — پیش از حذف تابع
do $$
declare
  r record;
begin
  for r in
    select inhrelid::regclass as part
      from pg_inherits
     where inhparent = 'public.inventory_txn'::regclass
  loop
    execute format('drop trigger if exists trg_inventory_txn_no_truncate on %s', r.part);
  end loop;
end $$;

drop trigger if exists trg_inventory_txn_no_truncate on inventory_txn;
drop trigger if exists trg_inventory_txn_append_only on inventory_txn;
drop function if exists fn_inventory_txn_guard();

-- بازگردانی دقیقِ گرانت‌های 0041 (select/insert/update/delete؛ truncate هرگز گرانت نشده بود)
do $$
declare
  r record;
begin
  if exists (select 1 from pg_roles where rolname = 'dms_app') then
    grant update, delete on inventory_txn to dms_app;
    for r in
      select inhrelid::regclass as part
        from pg_inherits
       where inhparent = 'public.inventory_txn'::regclass
    loop
      execute format('grant update, delete on %s to dms_app', r.part);
    end loop;
  end if;
end $$;
