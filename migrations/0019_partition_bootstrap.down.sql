-- معکوس 0019 — پارتیشن‌ها زیرمجموعه جدول والد‌اند و با حذف مهاجرت‌های ۲/۸/۱۲ پاک می‌شوند
drop function if exists fn_ensure_partitions(integer) cascade;
