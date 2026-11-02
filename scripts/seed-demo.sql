-- داده نمایشی Green-DMS — برای دمو و تست
-- اجرا با: npm run db:seed-demo
-- تکرارپذیر: اجرای مجدد با وجود شرکت PARS از سوی اجراکننده رد می‌شود
-- منبع واقعی ستون‌ها: DDL ضمیمه G (فیلدهای اجباری فقط code/name + کلید خارجی‌ها)

-- ۱) شرکت
insert into company (code, legal_name, economic_code, currency, vat_enabled)
values ('PARS', 'شرکت پخش مویرگی پارس (نمونه)', '411377665512', 'IRR', true);

-- ۲) شعبه مرکزی
insert into branch (company_id, code, name)
select c.id, 'MAIN', 'شعبه مرکزی تهران'
  from company c where c.code = 'PARS';

-- ۳) حوزه فروش
insert into sales_area (branch_id, code, name)
select b.id, 'TEH-N', 'حوزه فروش تهران شمال'
  from branch b join company c on c.id = b.company_id
 where c.code = 'PARS' and b.code = 'MAIN';

-- ۴) مسیر نمونه (شنبه‌ها)
insert into route (area_id, code, name, visit_weekday)
select a.id, 'R-101', 'مسیر نمونه تجریش ـ ولیعصر', 0
  from sales_area a
  join branch b on b.id = a.branch_id
  join company c on c.id = b.company_id
 where c.code = 'PARS' and a.code = 'TEH-N';

-- ۵) انبار مرکزی (متصل به حوزه)
insert into warehouse (branch_id, code, name, kind, area_id, allow_negative)
select b.id, 'WH-C', 'انبار مرکزی نمونه', 'main', a.id, false
  from branch b
  join company c on c.id = b.company_id
  join sales_area a on a.branch_id = b.id and a.code = 'TEH-N'
 where c.code = 'PARS' and b.code = 'MAIN';

-- ۶) لیست قیمت پایه
insert into price_list (company_id, code, title, kind, currency, is_active)
select c.id, 'PL-STD', 'لیست قیمت پایه', 'general', 'IRR', true
  from company c where c.code = 'PARS';

-- ۷) دسته‌بندی کالا
insert into product_category (company_id, code, name)
select c.id, t.code, t.name
  from company c
  cross join (values
                ('BEV',   'نوشیدنی'),
                ('DAIRY', 'لبنیات')
             ) as t(code, name)
 where c.code = 'PARS';

-- ۸) کالاهای نمونه (واحدها از seed مهاجرت 0022: pcs, bag, box, …)
insert into product (company_id, code, name, category_id, base_uom_id,
                     is_batch_tracked, is_expiry_tracked, shelf_life_days,
                     min_order_qty, weight_gr, volume_cm3, status)
select c.id, t.code, t.name,
       (select pc.id from product_category pc where pc.company_id = c.id and pc.code = t.cat),
       (select u.id from uom u where u.code = t.uom),
       t.batch, t.expiry, t.shelf, t.min_qty, t.weight_gr, t.volume_cm3, 'active'
  from company c
  cross join (values
                ('P-1001', 'نوشابه پت ۱.۵ لیتری پرتقالی', 'BEV',   'pcs',  true,  true,  150, 12, 1600, 1550),
                ('P-1002', 'دوغ سنتی پاکتی ۲۰۰ میلی‌لیتری', 'BEV',  'bag',  true,  true,  21,  50,  210,  210),
                ('P-1003', 'شیر پرچرب یک‌لیتری',           'DAIRY', 'pcs',  true,  true,  5,   24,  1030, 1000),
                ('P-1004', 'ماست موسیر سطلی ۲.۵ کیلوگرمی',  'DAIRY', 'box',  true,  true,  45,  6,   2600, 3000)
             ) as t(code, name, cat, uom, batch, expiry, shelf, min_qty, weight_gr, volume_cm3)
 where c.code = 'PARS';

-- ۹) مشتریان نمونه با موقعیت جغرافیایی (نقشه رهگیری/مسیریابی را داده دارد)
insert into person (company_id, code, legal_type, first_name, last_name, national_id)
select c.id, t.code, 'natural', t.first_name, t.last_name, t.nid
  from company c
  cross join (values
                ('C-01', 'سارا', 'مرادی',   '0084575941'),
                ('C-02', 'رضا',  'کاظمی',   '0071234567'),
                ('C-03', 'نرگس', 'احمدی',   '0099887766')
             ) as t(code, first_name, last_name, nid)
 where c.code = 'PARS';

insert into customer (person_id, branch_id, code, area_id, route_id, price_list_id,
                      visit_sequence, geo, geo_accuracy_m, geo_source, geo_captured_at, status)
select p.id, b.id, p.code, a.id, r.id, pl.id,
       t.seq,
       ST_SetSRID(ST_MakePoint(t.lon, t.lat), 4326)::geography,
       12, 'import', now(), 'active'
  from person p
  join company c on c.id = p.company_id
  join branch b on b.company_id = c.id and b.code = 'MAIN'
  join sales_area a on a.branch_id = b.id and a.code = 'TEH-N'
  join route r on r.area_id = a.id and r.code = 'R-101'
  join price_list pl on pl.company_id = c.id and pl.code = 'PL-STD'
  cross join (values
                ('C-01', 1, 51.4389, 35.7876),  -- حوالی میدان تجریش
                ('C-02', 2, 51.4267, 35.7720),  -- خیابان ولیعصر، بالاتر از پارک‌وی
                ('C-03', 3, 51.4130, 35.7540)   -- میدان ونک
             ) as t(code, seq, lon, lat)
 where c.code = 'PARS' and p.code = t.code;
