-- مهاجرت 0065 — مدیریت دادههای مرجع کالا (TASK-PM-02-C2)
-- منبع: PRODUCT_MASTER_TARGET_DESIGN.md §A (گروه/برند: موجود، بدون تغییر ساختار)،
--        §C (uom موجود + decimal_places)، §F (RBAC عادی master.product.* + audit)،
--        GAP_REGISTER.md G-06 (مدیریت کامل UI برای uom/category/brand).
--
-- فقط ستون/ایندکس **افزوده** میشود؛ هیچ جدول، enum، نقش، مجوز، seed، سیاست RLS،
-- گرانت تازه یا مهاجرت دادهای (backfill/cutover) وجود ندارد. هیچ ردیف موجودی
-- بازنویسی نمیشود: ستونهای تازه nullable یا دارای default امناند، بنابراین
-- رکوردهای قدیمی brand/code=NULL همچنان معتبر و قابلخواندناند.
--
-- «unique code» برای رکوردهای تازه در لایهٔ سرویس + ایندکس جزئی زیر اعمال میشود؛
-- چون NULL در ایندکس یکتای PostgreSQL تکرارپذیر است، ردیفهای قدیمی بدون کد
-- نیازی به backfill ندارند. قید یکتای نام برند (0005) دستنخورده میماند.

-- ۱) برند — کد، نام لاتین، چرخهٔ فعال/غیرفعال، زمانها
alter table brand add column code text;
alter table brand add column name_latin text;
alter table brand add column is_active boolean not null default true;
alter table brand add column created_at timestamptz not null default now();
alter table brand add column updated_at timestamptz not null default now();

create unique index uq_brand_code on brand (company_id, code) where code is not null;
create index ix_brand_active_code on brand (company_id, is_active, code);

comment on column brand.code is 'کد یکتای برند در هر شرکت؛ ردیفهای قدیمی ممکن است NULL باشند (بدون backfill)';
comment on column brand.name_latin is 'نام لاتین/انگلیسی نمایشی (اختیاری، همسو با product.name_latin)';
comment on column brand.is_active is 'غیرفعال = قابلانتخاب در فرمهای جدید نیست؛ کالاهای قبلی دستنخورده میمانند';

-- ۲) دستهبندی کالا — نام لاتین، زمانها، ایندکس والد (سلسلهمراتب موجود 0005 حفظ شد)
alter table product_category add column name_latin text;
alter table product_category add column created_at timestamptz not null default now();
alter table product_category add column updated_at timestamptz not null default now();

create index ix_product_category_parent on product_category (company_id, parent_id);

comment on column product_category.name_latin is 'نام لاتین/انگلیسی نمایشی (اختیاری)';
comment on column product_category.parent_id is 'والد در سلسلهمراتب مرکزی شرکت؛ حلقه در لایهٔ سرویس رد میشود';

-- ۳) واحد اندازهگیری — نماد، عنوان لاتین، چرخهٔ فعال/غیرفعال، زمانها
--    قید موجود decimal_places between 0 and 4 (0005، مصوب D3) عیناً حفظ میشود؛
--    هیچ تبدیل ضمنی، ضریب یا قاعدهٔ گردکردن تازهای اضافه نمیشود.
alter table uom add column symbol text;
alter table uom add column title_latin text;
alter table uom add column is_active boolean not null default true;
alter table uom add column created_at timestamptz not null default now();
alter table uom add column updated_at timestamptz not null default now();

create index ix_uom_active_code on uom (is_active, code);

comment on column uom.symbol is 'نماد کوتاه نمایشی واحد (مثلاً kg)؛ صرفاً نمایشی، نه تبدیل';
comment on column uom.title_latin is 'عنوان لاتین/انگلیسی نمایشی (اختیاری)';
comment on column uom.is_active is 'غیرفعال = قابلانتخاب در فرمهای جدید نیست؛ اسناد/کالاهای قبلی دستنخورده میمانند';
