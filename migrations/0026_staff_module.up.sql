-- مهاجرت 0026 — ماژول پرسنل (/staff): انتساب حوزه کار + مجوزهای مخصوص پرسنل
-- منبع: dms-design-report.md › §۱.۴ («پرسنل: انتساب به شعبه/حوزه») و
--        openapi › schemas.Staff.area_ids + /staff (گاردهای master.staff.*)
-- فاز توسعه: ۱ | ماژول/بخش: اطلاعات پایه ← پرسنل

-- حوزه‌های مجاز کار هر پرسنل — قرارداد area_ids را به جدول واقعی وصل می‌کند
create table staff_area (
  staff_id uuid not null references staff(id) on delete cascade,
  area_id  uuid not null references sales_area(id) on delete cascade,
  primary key (staff_id, area_id)
);

create index ix_staff_area_area on staff_area (area_id);

-- مجوزهای /staff — گروه master مثل بقیه مجوزهای اطلاعات پایه
insert into permission (code, module, title) values
  ('master.staff.view',   'master', 'مشاهده پرسنل'),
  ('master.staff.create', 'master', 'تعریف پرسنل'),
  ('master.staff.update', 'master', 'ویرایش پرسنل')
on conflict (code) do nothing;

-- نگاشت نقش ← مجوز (همان الگوی 0022):
--   sales_manager از master.* و ceo از * می‌گیرند؛ نیازی به ردیف جدا نیست
--   supervisor مثل master.customer.view صریحاً فقط «مشاهده پرسنل» را می‌گیرد
insert into role_permission (role_id, permission_code)
select r.id, p.code
  from role r
  join permission p on p.code = 'master.staff.view'
 where r.code = 'supervisor'
on conflict do nothing;
