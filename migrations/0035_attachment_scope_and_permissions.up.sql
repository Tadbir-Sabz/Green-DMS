-- مهاجرت 0035 — جداسازی چنداجاره‌ای ضمیمه‌ها + مجوزهای ماژول attachment
-- جدول attachment (مهاجرت 0002) ستون company_id نداشت، پس دامنهٔ اجارهٔ یک ضمیمه
-- قابل استعلام نبود. برای ماژول آپلود (POD/ضمیمه) ستون company_id + ایندکس دامنه
-- افزوده می‌شود تا ریپوزیتوری دسترسی را به شرکتِ نشست محدود کند (جلوگیری از IDOR
-- بین اجاره‌ها). دو مجوز attachment.upload/attachment.view هم به کاتالوگ اضافه و به
-- نقش‌هایی که فایل بارگذاری/مشاهده می‌کنند اعطا می‌شود (الگوی نقش←مجوز مانند 0022).

-- ۱) ستون company_id + ایندکس دامنهٔ اجاره
alter table attachment add column if not exists company_id uuid references company(id);
create index if not exists ix_attachment_company on attachment (company_id, owner_type, owner_id);

-- ۲) مجوزهای ماژول attachment در کاتالوگ
insert into permission (code, module, title) values
  ('attachment.upload', 'attachment', 'بارگذاری ضمیمه / مدرک تحویل'),
  ('attachment.view',   'attachment', 'مشاهده و دریافت ضمیمه')
on conflict (code) do nothing;

-- ۳) اعطا به نقش‌های سیستمیِ همهٔ شرکت‌ها. (نقش ceo الگوی '*' دارد اما آن الگو در
--    زمانِ seedِ 0022 به کدهای همان زمان باز شد، پس مجوزهای جدید را صریح اعطا می‌کنیم.)
insert into role_permission (role_id, permission_code)
select r.id, p.code
  from role r
  join (values
          ('sys_admin',        'attachment.upload'), ('sys_admin',        'attachment.view'),
          ('ceo',              'attachment.upload'), ('ceo',              'attachment.view'),
          ('sales_manager',    'attachment.upload'), ('sales_manager',    'attachment.view'),
          ('supervisor',       'attachment.upload'), ('supervisor',       'attachment.view'),
          ('salesperson_cold', 'attachment.upload'), ('salesperson_cold', 'attachment.view'),
          ('salesperson_warm', 'attachment.upload'), ('salesperson_warm', 'attachment.view'),
          ('courier',          'attachment.upload'), ('courier',          'attachment.view'),
          ('telesales',        'attachment.upload'), ('telesales',        'attachment.view'),
          ('storekeeper',      'attachment.upload'), ('storekeeper',      'attachment.view'),
          ('buyer',            'attachment.upload'), ('buyer',            'attachment.view'),
          ('accountant',       'attachment.upload'), ('accountant',       'attachment.view'),
          ('treasurer',        'attachment.upload'), ('treasurer',        'attachment.view')
       ) as g(role_code, code) on g.role_code = r.code
  join permission p on p.code = g.code
on conflict do nothing;
