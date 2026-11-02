-- مهاجرت 0022 — داده‌های مرجع (permission، uom، payment_method، نقش‌ها، سمت‌ها)
-- منبع: dms-design-report.md › ضمیمه G › G.۴.۲ / G.۴.۳ / G.۴.۵ + ضمیمه H (RBAC) + §۱.۴
-- فاز توسعه: ۱ | اجرای این فایل باید پس از ثبت اولین شرکت (company) انجام شود،
-- چون نقش و سمت به شرکت وابسته‌اند. اجرا چندباره بی‌خطر است (idempotent).

-- ====================================================================
-- ۱) سراسری‌ها: بدون company_id، مستقیم درج می‌شوند
-- ====================================================================

-- واحد اندازه‌گیری (G.۴.۳) — unit های پرکاربرد پخش مویرگی
insert into uom (code, title, decimal_places) values
  ('pcs',      'عدد',      0),
  ('box',      'بسته',     0),
  ('carton',   'کارتن',    0),
  ('bag',      'کیسه',     0),
  ('pallet',   'پالت',     0),
  ('kg',       'کیلوگرم',  3),
  ('gr',       'گرم',      0),
  ('l',        'لیتر',     3),
  ('ml',       'میلی‌لیتر', 0)
on conflict (code) do update
  set title = excluded.title,
      decimal_places = excluded.decimal_places;

-- روش پرداخت (G.۴.۵) — کد cash باید وجود داشته باشد: قرارداد پیش‌فرض settlement_term.allowed_methods
insert into payment_method (code, title, kind, requires_reference, is_active) values
  ('cash',   'نقدی',            'cash',   false, true),
  ('card',   'کارت (پوز)',      'card',   true,  true),
  ('cheque', 'چک',              'cheque', true,  true),
  ('credit', 'اعتباری (نسیه)',  'credit', false, true),
  ('online', 'پرداخت اینترنتی', 'online', true,  true),
  ('offset', 'تهاتر',           'offset', false, false)
on conflict (code) do update
  set title = excluded.title,
      kind = excluded.kind,
      requires_reference = excluded.requires_reference,
      is_active = excluded.is_active;

-- ====================================================================
-- ۲) مجوزها (permission) — سراسری، کلید اصلی همان code است
-- قالب: <module>.<entity>[.<action>] — ماژول‌های G.۱ و ساختار API ضمیمه F
-- ====================================================================
insert into permission (code, module, title) values
  -- اطلاعات پایه (ماژول ۱)
  ('master.product.view',       'master', 'مشاهده اطلاعات پایه کالا'),
  ('master.product.create',     'master', 'تعریف کالای جدید'),
  ('master.product.update',     'master', 'ویرایش کالا، بسته‌بندی و بچ'),
  ('master.product.approve',    'master', 'تأیید تغییرات کالا'),
  ('master.price.view',         'master', 'مشاهده لیست‌های قیمت'),
  ('master.price.update',       'master', 'تعریف و ویرایش قیمت'),
  ('master.price.approve',      'master', 'تأیید تغییر قیمت'),
  ('master.promotion.view',     'master', 'مشاهده تخفیف‌ها و جوایز'),
  ('master.promotion.update',   'master', 'تعریف و ویرایش تخفیف'),
  ('master.promotion.approve',  'master', 'تأیید تخفیف خارج از قاعده'),
  ('master.person.view',        'master', 'مشاهده اشخاص'),
  ('master.person.create',      'master', 'تعریف شخص جدید'),
  ('master.person.update',      'master', 'ویرایش مشخصات شخص'),
  ('master.customer.view',      'master', 'مشاهده مشتریان'),
  ('master.customer.create',    'master', 'تعریف مشتری جدید'),
  ('master.customer.update',    'master', 'ویرایش مشتری'),
  ('master.customer.approve',   'master', 'تأیید سقف اعتبار مشتری'),
  ('master.structure.view',     'master', 'مشاهده حوزه، منطقه، مسیر، انبار، خودرو'),
  ('master.structure.update',   'master', 'تعریف و ویرایش ساختار سازمانی فروش'),
  ('master.settings.view',      'master', 'مشاهده تنظیمات'),
  ('master.settings.update',    'master', 'ویرایش تنظیمات عمومی و هر حوزه'),

  -- انبار (ماژول ۲)
  ('inventory.stock.view',        'inventory', 'مشاهده موجودی انبارها'),
  ('inventory.count.create',      'inventory', 'شروع و ثبت انبارگردانی'),
  ('inventory.count.approve',     'inventory', 'تأیید نتیجه انبارگردانی'),
  ('inventory.transfer.create',   'inventory', 'ثبت حواله انتقال بین انبارها'),
  ('inventory.transfer.approve',  'inventory', 'تأیید انتقال بین انبارها'),
  ('inventory.adjust.create',     'inventory', 'ثبت سند ضایعات و اصلاح موجودی'),
  ('inventory.adjust.approve',    'inventory', 'تأیید سند اصلاح موجودی'),
  ('inventory.warehouse.view',    'inventory', 'مشاهده فهرست انبارها'),
  ('inventory.warehouse.create',  'inventory', 'تعریف انبار جدید (مرکزی/شعبه/خودرو)'),
  ('inventory.warehouse.update',  'inventory', 'ویرایش انبار'),

  -- کنترل‌ها و قوانین (ماژول ۳)
  ('rules.view',               'rules', 'مشاهده قوانین و کنترل‌ها'),
  ('rules.manage',             'rules', 'تعریف و ویرایش قوانین'),
  ('rules.approval.decide',    'rules', 'تأیید یا رد در گردش تأیید'),
  ('rules.exceptions.resolve', 'rules', 'بررسی و رفع صف استثناها'),

  -- فروش (ماژول ۴)
  ('sales.request.view',     'sales', 'مشاهده درخواست مشتریان'),
  ('sales.request.create',   'sales', 'ثبت درخواست مشتری'),
  ('sales.request.convert',  'sales', 'تبدیل درخواست به سفارش'),
  ('sales.order.view',       'sales', 'مشاهده سفارش‌ها'),
  ('sales.order.create',     'sales', 'ثبت سفارش'),
  ('sales.order.approve',    'sales', 'تأیید سفارش مشروط'),
  ('sales.waybill.create',   'sales', 'صدور حواله انبار'),
  ('sales.waybill.view',     'sales', 'مشاهده حواله‌های انبار'),
  ('sales.waybill.issue',    'sales', 'انتشار حواله'),
  ('sales.invoice.view',     'sales', 'مشاهده فاکتورها'),
  ('sales.invoice.create',   'sales', 'پیش‌نویس فاکتور'),
  ('sales.invoice.issue',    'sales', 'صدور فاکتور قطعی'),
  ('sales.invoice.void',     'sales', 'ابطال فاکتور'),
  ('sales.invoice.correct',  'sales', 'صدور فاکتور اصلاحی'),
  ('sales.delivery.view',    'sales', 'مشاهده وضعیت توزیع'),
  ('sales.delivery.update',  'sales', 'ثبت تحویل و مدرک تحویل (POD)'),
  ('sales.return.request',   'sales', 'ثبت درخواست مرجوعی'),
  ('sales.return.approve',   'sales', 'تأیید مرجوعی'),
  ('sales.return.post',      'sales', 'ثبت نهایی مرجوعی و سند ارزشی'),
  ('sales.moadian.submit',    'sales', 'ارسال و پیگیری فاکتور به مؤدیان'),

  -- تور، توزیع و تلفنی (ماژول ۵)
  ('tour.plan.view',           'tour', 'مشاهده تورها'),
  ('tour.plan.create',         'tour', 'ساخت تور و ایستگاه‌ها'),
  ('tour.plan.approve',        'tour', 'تأیید تور سرد/گرم'),
  ('tour.settle.create',       'tour', 'ثبت تسویه پایان روز تور'),
  ('tour.settle.approve',      'tour', 'تأیید تسویه و مغایرت نقد'),
  ('telesales.order.create',   'tour', 'ثبت سفارش تلفنی'),
  ('telesales.target.manage',  'tour', 'تعریف هدف و سهمیه تلفنی'),
  ('commission.approve',       'tour', 'تأیید محاسبه پورسانت'),

  -- رهگیری و مسیر (ماژول ۶)
  ('tracking.live.view',           'tracking', 'مشاهده موقعیت زنده روی نقشه'),
  ('tracking.route.view',          'tracking', 'مشاهده مسیر و برنامه‌بندی'),
  ('tracking.route.create',        'tracking', 'ایجاد مسیر بهینه'),
  ('tracking.geofence.view',       'tracking', 'مشاهده محدوده‌های جغرافیایی'),
  ('tracking.geofence.update',     'tracking', 'تعریف و ویرایش محدوده کار'),
  ('tracking.customer_geo.update', 'tracking', 'ثبت موقعیت مشتری در نقشه'),

  -- حساب‌های دریافتنی (ماژول ۷)
  ('ar.receipt.create',    'ar', 'ثبت رسید وصول'),
  ('ar.receipt.void',      'ar', 'ابطال رسید وصول'),
  ('ar.ledger.view',       'ar', 'مشاهده دفتر و صورت‌حساب مشتری'),
  ('ar.credit.approve',    'ar', 'تأیید اعتبار خارج از سقف'),
  ('ar.collection.manage', 'ar', 'مدیریت پیگیری وصول'),

  -- حساب‌های پرداختنی (ماژول ۸)
  ('ap.supplier.view',    'ap', 'مشاهده تأمین‌کنندگان'),
  ('ap.supplier.update',  'ap', 'تعریف و ویرایش تأمین‌کننده'),
  ('ap.purchase.request', 'ap', 'ثبت درخواست خرید'),
  ('ap.purchase.approve', 'ap', 'تأیید سفارش خرید'),
  ('ap.grn.post',         'ap', 'ثبت رسید انبار خرید'),
  ('ap.invoice.match',    'ap', 'اجرای تطبیق سه‌طرفه'),
  ('ap.invoice.approve',  'ap', 'تأیید صورتحساب تأمین‌کننده'),
  ('ap.payment.create',   'ap', 'صدور سند پرداخت'),

  -- حسابداری انبار (ماژول ۹)
  ('valuation.view',          'valuation', 'مشاهده ارزش موجودی و بهای تمام‌شده'),
  ('valuation.cogs.view',     'valuation', 'مشاهده COGS و ریز بهای فروش'),
  ('valuation.revalue.approve', 'valuation', 'تأیید تغییر بهای استاندارد و ارزش‌گذاری مجدد'),

  -- خزانه‌داری (ماژول ۱۰)
  ('treasury.cash.view',      'treasury', 'مشاهده صندوق‌ها'),
  ('treasury.cash.close',     'treasury', 'شمارش و بستن صندوق'),
  ('treasury.close.approve',  'treasury', 'تأیید بستن روزانه خزانه'),
  ('treasury.bank.view',      'treasury', 'مشاهده حساب‌های بانکی'),
  ('treasury.bank.reconcile', 'treasury', 'مغایرت‌گیری بانکی'),
  ('treasury.cheque.view',    'treasury', 'مشاهده چک‌ها'),
  ('treasury.cheque.update',  'treasury', 'ثبت وضعیت و سررسید چک'),
  ('treasury.petty.approve',  'treasury', 'تأیید هزینه‌های تنخواه'),

  -- دفتر کل (ضمیمه A)
  ('gl.journal.view',   'gl', 'مشاهده اسناد حسابداری'),
  ('gl.journal.create', 'gl', 'ثبت سند دستی'),
  ('gl.journal.post',   'gl', 'ثبت نهایی سند'),
  ('gl.journal.void',   'gl', 'ابطال سند با سند معکوس'),
  ('gl.period.close',   'gl', 'بستن و قفل دوره مالی'),
  ('gl.report.view',    'gl', 'مشاهده تراز و صورت‌های مالی'),

  -- گزارش‌ها
  ('reports.dashboard.view', 'reports', 'مشاهده داشبوردها'),
  ('reports.export',         'reports', 'خروجی گرفتن و ارسال گزارش'),

  -- مدیریت سیستم
  ('admin.user.manage',      'admin', 'مدیریت کاربران و دسترسی'),
  ('admin.role.manage',      'admin', 'مدیریت نقش‌ها و مجوزها'),
  ('admin.audit.view',       'admin', 'مشاهده لاگ ممیزی'),
  ('admin.backup.manage',    'admin', 'مدیریت پشتیبان‌گیری و بازیابی'),
  ('admin.integration.manage', 'admin', 'مدیریت یکپارچه‌سازی‌ها و کلیدها')
on conflict (code) do update
  set module = excluded.module,
      title = excluded.title;

-- ====================================================================
-- ۳) داده‌های وابسته به شرکت: سمت، نقش و نگاشت نقش ← مجوز
-- ====================================================================
do $$
declare
  v_company record;
  v_count    integer;
begin
  if not exists (select 1 from company) then
    raise notice 'شرکتی ثبت نشده است؛ سمت و نقش‌ها پس از ایجاد اولین company درج می‌شوند.';
    return;
  end if;

  for v_company in select id from company order by id loop

    -- سمت‌ها (§۱.۴ + ضمیمه H)
    insert into job_position (company_id, code, title, department) values
      (v_company.id, 'ceo',             'مدیرعامل',              'مدیریت'),
      (v_company.id, 'sales_manager',   'مدیر فروش',             'فروش'),
      (v_company.id, 'supervisor',      'سرپرست فروشندگان',      'فروش'),
      (v_company.id, 'salesperson_cold','ویزیتور سرد',           'فروش'),
      (v_company.id, 'salesperson_warm','ویزیتور گرم',           'فروش'),
      (v_company.id, 'courier',         'موزع / راننده',          'توزیع'),
      (v_company.id, 'telesales',       'کارشناس فروش تلفنی',    'فروش'),
      (v_company.id, 'storekeeper',     'انباردار',               'انبار'),
      (v_company.id, 'buyer',           'مسئول خرید',            'خرید'),
      (v_company.id, 'accountant',      'حسابدار',                'مالی'),
      (v_company.id, 'treasurer',       'خزانه‌دار',              'مالی'),
      (v_company.id, 'sys_admin',       'ادمین سیستم',            'فناوری اطلاعات')
    on conflict (company_id, code) do nothing;

    -- نقش‌ها (is_system: قالب است، حذف نمی‌شود)
    insert into role (company_id, code, name, is_system) values
      (v_company.id, 'sys_admin',         'ادمین سیستم',        true),
      (v_company.id, 'ceo',               'مدیرعامل / مدیر',    true),
      (v_company.id, 'sales_manager',     'مدیر فروش',          true),
      (v_company.id, 'supervisor',        'سرپرست',             true),
      (v_company.id, 'salesperson_cold',  'ویزیتور سرد',        true),
      (v_company.id, 'salesperson_warm',  'ویزیتور گرم',        true),
      (v_company.id, 'courier',           'موزع / راننده',       true),
      (v_company.id, 'telesales',         'کارشناس تلفنی',      true),
      (v_company.id, 'storekeeper',       'انباردار',            true),
      (v_company.id, 'buyer',             'مسئول خرید',         true),
      (v_company.id, 'accountant',        'حسابدار / مالی',      true),
      (v_company.id, 'treasurer',         'خزانه‌دار',           true)
    on conflict (company_id, code) do nothing;

    -- نگاشت نقش ← مجوز
    -- الگو: '*' همه مجوزها | 'sales.invoice' همه زیرمجموعه‌های آن | 'x.y.z' دقیقاً همان مجوز
    insert into role_permission (role_id, permission_code)
    select distinct r.id, p.code
      from role r
      join (values
              -- ادمین سیستم: سیستمی، نه تجاری (ضمن H: «بدون دسترسی تجاری پیش‌فرض»)
              ('sys_admin',       'admin.*'),
              ('sys_admin',       'rules.*'),
              ('sys_admin',       'reports.*'),
              -- مدیر: همه‌چیز
              ('ceo',             '*'),
              -- مدیر فروش
              ('sales_manager',   'master.*'),
              ('sales_manager',   'sales.*'),
              ('sales_manager',   'tour.*'),
              ('sales_manager',   'tracking.*'),
              ('sales_manager',   'ar.*'),
              ('sales_manager',   'reports.*'),
              ('sales_manager',   'inventory.stock.view'),
              ('sales_manager',   'rules.view'),
              ('sales_manager',   'rules.approval.decide'),
              ('sales_manager',   'rules.exceptions.resolve'),
              -- سرپرست: تیم خودش، بدون اطلاعات پایه و بدون مالی
              ('supervisor',      'sales.*'),
              ('supervisor',      'tour.*'),
              ('supervisor',      'tracking.*'),
              ('supervisor',      'ar.receipt.create'),
              ('supervisor',      'ar.ledger.view'),
              ('supervisor',      'master.product.view'),
              ('supervisor',      'master.customer.view'),
              ('supervisor',      'inventory.stock.view'),
              ('supervisor',      'reports.dashboard.view'),
              ('supervisor',      'rules.approval.decide'),
              ('supervisor',      'rules.exceptions.resolve'),
              -- ویزیتورها: میدان، دامنه داده با user_scope محدود می‌شود
              ('salesperson_cold','master.product.view'),
              ('salesperson_cold','master.customer.view'),
              ('salesperson_cold','master.customer.create'),
              ('salesperson_cold','master.customer.update'),
              ('salesperson_cold','tracking.customer_geo.update'),
              ('salesperson_cold','sales.request.*'),
              ('salesperson_cold','sales.order.*'),
              ('salesperson_cold','sales.waybill.create'),
              ('salesperson_cold','sales.invoice.view'),
              ('salesperson_cold','sales.invoice.create'),
              ('salesperson_cold','sales.invoice.issue'),
              ('salesperson_cold','sales.delivery.view'),
              ('salesperson_cold','sales.delivery.update'),
              ('salesperson_cold','sales.return.request'),
              ('salesperson_cold','sales.moadian.submit'),
              ('salesperson_cold','ar.receipt.create'),
              ('salesperson_cold','ar.ledger.view'),
              ('salesperson_cold','tour.plan.view'),
              ('salesperson_cold','tour.settle.create'),
              ('salesperson_warm','master.product.view'),
              ('salesperson_warm','master.customer.view'),
              ('salesperson_warm','master.customer.create'),
              ('salesperson_warm','master.customer.update'),
              ('salesperson_warm','tracking.customer_geo.update'),
              ('salesperson_warm','sales.request.*'),
              ('salesperson_warm','sales.order.*'),
              ('salesperson_warm','sales.waybill.create'),
              ('salesperson_warm','sales.invoice.view'),
              ('salesperson_warm','sales.invoice.create'),
              ('salesperson_warm','sales.invoice.issue'),
              ('salesperson_warm','sales.delivery.view'),
              ('salesperson_warm','sales.delivery.update'),
              ('salesperson_warm','sales.return.request'),
              ('salesperson_warm','sales.moadian.submit'),
              ('salesperson_warm','ar.receipt.create'),
              ('salesperson_warm','ar.ledger.view'),
              ('salesperson_warm','tour.plan.view'),
              ('salesperson_warm','tour.settle.create'),
              ('salesperson_warm','telesales.order.create'),
              -- موزع / راننده: تحویل و تسویه خودرو
              ('courier',         'sales.delivery.*'),
              ('courier',         'sales.waybill.view'),
              ('courier',         'sales.invoice.view'),
              ('courier',         'sales.return.request'),
              ('courier',         'inventory.stock.view'),
              ('courier',         'tour.plan.view'),
              ('courier',         'tour.settle.create'),
              -- تلفنی: بدون وصول میدانی (ضمن H)
              ('telesales',       'master.product.view'),
              ('telesales',       'master.customer.*'),
              ('telesales',       'sales.request.*'),
              ('telesales',       'sales.order.*'),
              ('telesales',       'sales.invoice.view'),
              ('telesales',       'sales.invoice.create'),
              ('telesales',       'telesales.*'),
              ('telesales',       'reports.dashboard.view'),
              ('telesales',       'ar.ledger.view'),
              -- انباردار
              ('storekeeper',     'inventory.*'),
              ('storekeeper',     'master.product.view'),
              ('storekeeper',     'master.structure.view'),
              ('storekeeper',     'valuation.view'),
              ('storekeeper',     'reports.dashboard.view'),
              -- مسئول خرید
              ('buyer',           'ap.*'),
              ('buyer',           'master.product.view'),
              ('buyer',           'inventory.stock.view'),
              ('buyer',           'valuation.view'),
              ('buyer',           'reports.dashboard.view'),
              -- حسابدار
              ('accountant',      'gl.*'),
              ('accountant',      'ar.*'),
              ('accountant',      'ap.*'),
              ('accountant',      'valuation.*'),
              ('accountant',      'sales.invoice.*'),
              ('accountant',      'sales.return.*'),
              ('accountant',      'master.customer.view'),
              ('accountant',      'master.product.view'),
              ('accountant',      'reports.*'),
              ('accountant',      'rules.approval.decide'),
              -- خزانه‌دار
              ('treasurer',       'treasury.*'),
              ('treasurer',       'ar.receipt.*'),
              ('treasurer',       'ap.payment.create'),
              ('treasurer',       'gl.journal.view'),
              ('treasurer',       'gl.report.view'),
              ('treasurer',       'reports.dashboard.view')
           ) as g(role_code, pattern)
           on g.role_code = r.code
      cross join permission p
     where r.company_id = v_company.id
       and (g.pattern = '*'
            or p.code = g.pattern
            or p.code like
                 case when right(g.pattern, 2) = '.*'
                      then left(g.pattern, length(g.pattern) - 1) || '%'
                      else g.pattern || '.%'
                 end)
    on conflict do nothing;

  end loop;

  select count(*) into v_count from role_permission;
  raise notice 'seed مجوزها: % ردیف نگاشت نقش ← مجوز ثبت شد.', v_count;
end $$;
