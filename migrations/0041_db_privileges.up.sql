-- 0041 — معماریِ امتیازاتِ پایگاه‌داده: نقش‌ها، RLS گسترده، FORCE، و توابعِ SECURITY DEFINER
--
-- طراحیِ کامل و دلیلِ هر تصمیم در docs/db-privilege-architecture.md آمده است.
-- خلاصهٔ یافته‌ای که این مهاجرت رفع می‌کند:
--   * هیچ نقش/GRANTی در ۴۰ مهاجرتِ پیشین وجود نداشت و اتصالِ برنامه «ابرکاربر» بود
--     (CI: postgres، compose: dms) ⇒ RLS برای ابرکاربر اعمال نمی‌شود و سیاست‌هایِ
--     موجود عملاً بی‌اثر بودند.
--   * از ۱۵۲ جدول فقط ۶ جدول RLS داشتند و هیچ‌جا FORCE ROW LEVEL SECURITY نبود.
--   * هیچ تابعِ SECURITY DEFINER وجود نداشت، در حالی که ورودِ پرتال و خودخدمت‌دهیِ
--     استقرار هر دو «پیش از اجاره» اجرا می‌شوند.
--
-- این مهاجرت «افزودنی» است و هیچ داده/مالکیتی را جابه‌جا نمی‌کند. تا وقتی اتصالِ
-- برنامه ابرکاربر بماند، رفتار دقیقاً مثلِ قبل است؛ فعال‌سازیِ جداسازی با ست‌کردنِ
-- APP_DATABASE_URL رویِ نقشِ dms_app در زمانِ استقرار انجام می‌شود.
--
-- ⚠️ هیچ رمزی در این فایل نیست: نقش‌ها NOLOGIN ساخته می‌شوند و LOGIN + رمز فقط در
--    زمانِ استقرار از env داده می‌شود (یا در تست، با رمزِ تصادفیِ یکبارمصرف).

-- ---------------------------------------------------------------------------
-- ۱) تابعِ واحدِ زمینهٔ اجاره — fail-closed
-- ---------------------------------------------------------------------------
-- اگر app.company_id ست نباشد یا UUID معتبر نباشد، null برمی‌گردد و چون هیچ سیاستی
-- با null برابر نمی‌شود، «نه خواندن» ممکن است و «نه نوشتن». این همان چیزی است که
-- جداسازیِ واقعی را از یک فیلترِ اختیاریِ لایهٔ کد به یک اجبارِ پایگاه‌داده‌ای تبدیل
-- می‌کند. تابع stable است (نه immutable) چون به وضعیتِ نشست وابسته است.
create or replace function fn_current_company_id() returns uuid
language sql stable
set search_path = public, pg_temp
as $$
  select case
           when coalesce(current_setting('app.company_id', true), '')
                ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
           then current_setting('app.company_id', true)::uuid
           else null
         end;
$$;

comment on function fn_current_company_id() is
  'زمینهٔ اجارهٔ جاری از app.company_id؛ اگر ست/معتبر نباشد null ⇒ سیاست‌ها fail-closed';

-- این تابع فقط GUC خودِ نشستِ فراخوان را می‌خواند و چیزی را افشا نمی‌کند، پس
-- EXECUTE عمومی بودنش امن است (و برایِ ارزیابیِ سیاست‌ها توسطِ هر نقشِ پرس‌وجو لازم است).
grant execute on function fn_current_company_id() to public;

-- ---------------------------------------------------------------------------
-- ۲) نقش‌ها — تفکیکِ هویتِ مهاجرت از هویتِ زمانِ اجرا
-- ---------------------------------------------------------------------------
do $$
begin
  -- مالکِ طرحواره (مدیریتی)؛ هرگز در برنامه استفاده نمی‌شود
  if not exists (select 1 from pg_roles where rolname = 'dms_owner') then
    create role dms_owner nologin nosuperuser nobypassrls nocreatedb nocreaterole;
  end if;
  -- مجریِ مهاجرت‌ها
  if not exists (select 1 from pg_roles where rolname = 'dms_migrator') then
    create role dms_migrator nologin nosuperuser nobypassrls nocreatedb nocreaterole;
  end if;
  -- نقشِ زمانِ اجرایِ برنامه: نه ابرکاربر، نه BYPASSRLS، و مالکِ هیچ جدولی نیست
  if not exists (select 1 from pg_roles where rolname = 'dms_app') then
    create role dms_app nologin nosuperuser nobypassrls nocreatedb nocreaterole;
  end if;
  -- گزارش‌گیری/ممیزیِ فقط‌خواندن
  if not exists (select 1 from pg_roles where rolname = 'dms_readonly') then
    create role dms_readonly nologin nosuperuser nobypassrls nocreatedb nocreaterole;
  end if;
end
$$;

-- اطمینانِ صریح: حتی اگر نقشی پیش‌تر با امتیازِ خطرناک ساخته شده باشد، اینجا گرفته
-- می‌شود (تضمینِ «بدونِ تصعیدِ امتیاز» که آزمونِ DB هم آن را بررسی می‌کند).
--
-- توجهِ مهم: rolcanlogin عمداً دست‌نخورده می‌ماند. نقش‌ها cluster-wideاند و چند
-- پایگاهِ آزمونِ موازی ممکن است هم‌زمان مهاجرت اجرا کنند؛ اگر اینجا بی‌قیدوشرط
-- NOLOGIN ست می‌شد، اجرایِ موازی می‌توانست LOGIN را در میانهٔ آزمونِ دیگری بگیرد
-- و شکستِ متناوب (flaky) بسازد. پس فقط امتیازهایِ خطرناک بازستانی می‌شوند.
do $$
declare
  r record;
begin
  for r in select rolname from pg_roles
            where rolname in ('dms_owner', 'dms_migrator', 'dms_app', 'dms_readonly') loop
    if r.rolname <> '' then
      execute format(
        'alter role %I nosuperuser nobypassrls nocreatedb nocreaterole', r.rolname);
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- ۳) امتیازاتِ صریح و کمینه
-- ---------------------------------------------------------------------------
grant usage on schema public to dms_migrator, dms_app, dms_readonly;
grant create on schema public to dms_migrator;

-- DML رویِ جدول‌هایِ کاری؛ «محدودیتِ سطری» کارِ RLS است و «محدودیتِ شیئی» کارِ GRANT.
grant select, insert, update, delete on all tables in schema public to dms_app;
grant select on all tables in schema public to dms_readonly;
grant usage, select, update on all sequences in schema public to dms_app;
grant usage, select on all sequences in schema public to dms_readonly;

-- مهاجرت‌هایِ آینده هم به‌طورِ خودکار همان امتیازها را بدهند تا استقرار نشکند
alter default privileges in schema public
  grant select, insert, update, delete on tables to dms_app;
alter default privileges in schema public
  grant select on tables to dms_readonly;
alter default privileges in schema public
  grant usage, select, update on sequences to dms_app;

-- استثنا: جدولِ ممیزیِ استقرار.
-- «نخواندنِ» تاریخچهٔ دیگر اجاره‌ها اینجا با RLS تضمین می‌شود نه با REVOKE:
-- سیاستِ فقط-INSERT تعریف شده و چون سیاستِ SELECT/ALL وجود ندارد، هر پرس‌وجویِ
-- خواندن برایِ نقشِ برنامه «صفر ردیف» برمی‌گرداند (deny-by-defaultِ خودِ RLS).
-- این یکنواخت‌تر از ترکیبِ ACL+RLS است و رفتارِ قابلِ آزمونِ قطعی دارد.
grant insert on onboarding_attempt to dms_app;

-- توابعِ کاری
grant execute on all functions in schema public to dms_app;

-- ---------------------------------------------------------------------------
-- ۴) FORCE ROW LEVEL SECURITY رویِ جدول‌هایی که پیش‌تر RLS داشتند
-- ---------------------------------------------------------------------------
-- با FORCE، حتی «مالکِ» جدول هم از سیاست‌ها عبور نمی‌کند (ابرکاربر و BYPASSRLS هنوز
-- عبور می‌کنند — به همین دلیل نقشِ زمانِ اجرا هیچ‌کدام از این دو را ندارد).
alter table attachment      force row level security;
alter table billing_invoice force row level security;
alter table invoice         force row level security;
alter table portal_session  force row level security;
alter table portal_user     force row level security;

-- ---------------------------------------------------------------------------
-- ۴-۱) بازتعریفِ سیاست‌هایِ «پیشین» با fn_current_company_id
-- ---------------------------------------------------------------------------
-- سیاست‌هایِ مهاجرت‌هایِ 0021/0036/0037/0039 مستقیماً
-- current_setting('app.company_id')::uuid را صدا می‌زدند. آن شکل:
--   * اگر GUC ست نشده باشد ⇒ خطایِ 42704 (unrecognized configuration parameter)
--   * اگر مقدارش UUID نباشد ⇒ خطایِ 22P02 (invalid input syntax for type uuid)
-- یعنی «پرتابِ خطا» به‌جایِ «صفر ردیف». از نظرِ امنیت هر دو بسته‌اند، اما رفتارِ
-- یکنواختِ fail-closed (و قابلِ آزمونِ قطعی) این است که همهٔ سیاست‌ها زمینهٔ اجاره
-- را از «یک» تابعِ واحد بخوانند. معنا حفظ شده: همان ستون، همان مقایسه.
drop policy if exists p_attachment_tenant on attachment;
create policy p_attachment_tenant on attachment
  for all
  using (attachment.company_id = fn_current_company_id())
  with check (attachment.company_id = fn_current_company_id());

drop policy if exists p_billing_invoice_tenant on billing_invoice;
create policy p_billing_invoice_tenant on billing_invoice
  for all
  using (billing_invoice.company_id = fn_current_company_id())
  with check (billing_invoice.company_id = fn_current_company_id());

drop policy if exists p_portal_user_tenant on portal_user;
create policy p_portal_user_tenant on portal_user
  for all
  using (portal_user.company_id = fn_current_company_id())
  with check (portal_user.company_id = fn_current_company_id());

drop policy if exists p_portal_session_tenant on portal_session;
create policy p_portal_session_tenant on portal_session
  for all
  using (portal_session.company_id = fn_current_company_id())
  with check (portal_session.company_id = fn_current_company_id());

-- سیاستِ اجاره‌ایِ invoice (از راهِ شعبه). سیاستِ دومِ آن یعنی p_invoice_scope
-- عمداً دست‌نخورده می‌ماند: آن سیاست بر پایهٔ user_scope (دامنهٔ دادهٔ کاربرِ
-- کارکن) است و نه اجاره، و تغییرِ معنایش خارج از دامنهٔ این مهاجرت است.
drop policy if exists p_invoice_tenant on invoice;
create policy p_invoice_tenant on invoice
  for all
  using (invoice.branch_id in (select id from branch
                                where branch.company_id = fn_current_company_id()))
  with check (invoice.branch_id in (select id from branch
                                     where branch.company_id = fn_current_company_id()));

-- ---------------------------------------------------------------------------
-- ۵) سیاستِ ممیزیِ استقرار (فقط نوشتن، پیش از وجودِ اجاره)
-- ---------------------------------------------------------------------------
alter table onboarding_attempt enable row level security;
alter table onboarding_attempt force row level security;
drop policy if exists p_onboarding_attempt_insert on onboarding_attempt;
create policy p_onboarding_attempt_insert on onboarding_attempt
  for insert
  with check (true);   -- تلاش‌ها «پیش از» وجودِ اجاره رخ می‌دهند (company_id تهی)

-- پیامدِ عملیِ نبودِ سیاستِ SELECT (مهم برایِ توسعه‌دهنده‌ها):
-- «INSERT ... RETURNING» زیرِ نقشِ dms_app رویِ این جدول رد می‌شود، چون RETURNING
-- سطر را بازمی‌خواند و به سیاستِ SELECT نیاز دارد. کدِ تولیدی
-- (OnboardingRepository.recordAttempt) عمداً RETURNING ندارد؛ اگر روزی لازم شد،
-- باید شناسه را با یک پرس‌وجویِ جداگانهٔ مدیریتی گرفت، نه با افزودنِ سیاستِ SELECT.

-- ---------------------------------------------------------------------------
-- ۶) جدولِ خودِ اجاره
-- ---------------------------------------------------------------------------
alter table company enable row level security;
alter table company force row level security;
drop policy if exists p_company_tenant on company;
create policy p_company_tenant on company
  for all
  using (company.id = fn_current_company_id())
  with check (company.id = fn_current_company_id());

-- ---------------------------------------------------------------------------
-- ۷) جدول‌هایِ دارایِ ستونِ company_id (27 جدول)
-- ---------------------------------------------------------------------------
-- account_mapping
alter table account_mapping enable row level security;
alter table account_mapping force row level security;
drop policy if exists p_account_mapping_tenant on account_mapping;
create policy p_account_mapping_tenant on account_mapping
  for all
  using (account_mapping.company_id = fn_current_company_id())
  with check (account_mapping.company_id = fn_current_company_id());

-- approval_chain
alter table approval_chain enable row level security;
alter table approval_chain force row level security;
drop policy if exists p_approval_chain_tenant on approval_chain;
create policy p_approval_chain_tenant on approval_chain
  for all
  using (approval_chain.company_id = fn_current_company_id())
  with check (approval_chain.company_id = fn_current_company_id());

-- branch
alter table branch enable row level security;
alter table branch force row level security;
drop policy if exists p_branch_tenant on branch;
create policy p_branch_tenant on branch
  for all
  using (branch.company_id = fn_current_company_id())
  with check (branch.company_id = fn_current_company_id());

-- brand
alter table brand enable row level security;
alter table brand force row level security;
drop policy if exists p_brand_tenant on brand;
create policy p_brand_tenant on brand
  for all
  using (brand.company_id = fn_current_company_id())
  with check (brand.company_id = fn_current_company_id());

-- commission_plan
alter table commission_plan enable row level security;
alter table commission_plan force row level security;
drop policy if exists p_commission_plan_tenant on commission_plan;
create policy p_commission_plan_tenant on commission_plan
  for all
  using (commission_plan.company_id = fn_current_company_id())
  with check (commission_plan.company_id = fn_current_company_id());

-- fiscal_period
alter table fiscal_period enable row level security;
alter table fiscal_period force row level security;
drop policy if exists p_fiscal_period_tenant on fiscal_period;
create policy p_fiscal_period_tenant on fiscal_period
  for all
  using (fiscal_period.company_id = fn_current_company_id())
  with check (fiscal_period.company_id = fn_current_company_id());

-- gl_account
alter table gl_account enable row level security;
alter table gl_account force row level security;
drop policy if exists p_gl_account_tenant on gl_account;
create policy p_gl_account_tenant on gl_account
  for all
  using (gl_account.company_id = fn_current_company_id())
  with check (gl_account.company_id = fn_current_company_id());

-- gl_dimension
alter table gl_dimension enable row level security;
alter table gl_dimension force row level security;
drop policy if exists p_gl_dimension_tenant on gl_dimension;
create policy p_gl_dimension_tenant on gl_dimension
  for all
  using (gl_dimension.company_id = fn_current_company_id())
  with check (gl_dimension.company_id = fn_current_company_id());

-- integration_credential
alter table integration_credential enable row level security;
alter table integration_credential force row level security;
drop policy if exists p_integration_credential_tenant on integration_credential;
create policy p_integration_credential_tenant on integration_credential
  for all
  using (integration_credential.company_id = fn_current_company_id())
  with check (integration_credential.company_id = fn_current_company_id());

-- job_position
alter table job_position enable row level security;
alter table job_position force row level security;
drop policy if exists p_job_position_tenant on job_position;
create policy p_job_position_tenant on job_position
  for all
  using (job_position.company_id = fn_current_company_id())
  with check (job_position.company_id = fn_current_company_id());

-- journal_entry
alter table journal_entry enable row level security;
alter table journal_entry force row level security;
drop policy if exists p_journal_entry_tenant on journal_entry;
create policy p_journal_entry_tenant on journal_entry
  for all
  using (journal_entry.company_id = fn_current_company_id())
  with check (journal_entry.company_id = fn_current_company_id());

-- ledger_balance_snapshot
alter table ledger_balance_snapshot enable row level security;
alter table ledger_balance_snapshot force row level security;
drop policy if exists p_ledger_balance_snapshot_tenant on ledger_balance_snapshot;
create policy p_ledger_balance_snapshot_tenant on ledger_balance_snapshot
  for all
  using (ledger_balance_snapshot.company_id = fn_current_company_id())
  with check (ledger_balance_snapshot.company_id = fn_current_company_id());

-- person
alter table person enable row level security;
alter table person force row level security;
drop policy if exists p_person_tenant on person;
create policy p_person_tenant on person
  for all
  using (person.company_id = fn_current_company_id())
  with check (person.company_id = fn_current_company_id());

-- price_list
alter table price_list enable row level security;
alter table price_list force row level security;
drop policy if exists p_price_list_tenant on price_list;
create policy p_price_list_tenant on price_list
  for all
  using (price_list.company_id = fn_current_company_id())
  with check (price_list.company_id = fn_current_company_id());

-- print_template
alter table print_template enable row level security;
alter table print_template force row level security;
drop policy if exists p_print_template_tenant on print_template;
create policy p_print_template_tenant on print_template
  for all
  using (print_template.company_id = fn_current_company_id())
  with check (print_template.company_id = fn_current_company_id());

-- product
alter table product enable row level security;
alter table product force row level security;
drop policy if exists p_product_tenant on product;
create policy p_product_tenant on product
  for all
  using (product.company_id = fn_current_company_id())
  with check (product.company_id = fn_current_company_id());

-- product_category
alter table product_category enable row level security;
alter table product_category force row level security;
drop policy if exists p_product_category_tenant on product_category;
create policy p_product_category_tenant on product_category
  for all
  using (product_category.company_id = fn_current_company_id())
  with check (product_category.company_id = fn_current_company_id());

-- promotion
alter table promotion enable row level security;
alter table promotion force row level security;
drop policy if exists p_promotion_tenant on promotion;
create policy p_promotion_tenant on promotion
  for all
  using (promotion.company_id = fn_current_company_id())
  with check (promotion.company_id = fn_current_company_id());

-- recurring_journal
alter table recurring_journal enable row level security;
alter table recurring_journal force row level security;
drop policy if exists p_recurring_journal_tenant on recurring_journal;
create policy p_recurring_journal_tenant on recurring_journal
  for all
  using (recurring_journal.company_id = fn_current_company_id())
  with check (recurring_journal.company_id = fn_current_company_id());

-- role
alter table role enable row level security;
alter table role force row level security;
drop policy if exists p_role_tenant on role;
create policy p_role_tenant on role
  for all
  using (role.company_id = fn_current_company_id())
  with check (role.company_id = fn_current_company_id());

-- rule
alter table rule enable row level security;
alter table rule force row level security;
drop policy if exists p_rule_tenant on rule;
create policy p_rule_tenant on rule
  for all
  using (rule.company_id = fn_current_company_id())
  with check (rule.company_id = fn_current_company_id());

-- settlement_term
alter table settlement_term enable row level security;
alter table settlement_term force row level security;
drop policy if exists p_settlement_term_tenant on settlement_term;
create policy p_settlement_term_tenant on settlement_term
  for all
  using (settlement_term.company_id = fn_current_company_id())
  with check (settlement_term.company_id = fn_current_company_id());

-- sms_template
alter table sms_template enable row level security;
alter table sms_template force row level security;
drop policy if exists p_sms_template_tenant on sms_template;
create policy p_sms_template_tenant on sms_template
  for all
  using (sms_template.company_id = fn_current_company_id())
  with check (sms_template.company_id = fn_current_company_id());

-- supplier
alter table supplier enable row level security;
alter table supplier force row level security;
drop policy if exists p_supplier_tenant on supplier;
create policy p_supplier_tenant on supplier
  for all
  using (supplier.company_id = fn_current_company_id())
  with check (supplier.company_id = fn_current_company_id());

-- tax_code
alter table tax_code enable row level security;
alter table tax_code force row level security;
drop policy if exists p_tax_code_tenant on tax_code;
create policy p_tax_code_tenant on tax_code
  for all
  using (tax_code.company_id = fn_current_company_id())
  with check (tax_code.company_id = fn_current_company_id());

-- tax_ledger
alter table tax_ledger enable row level security;
alter table tax_ledger force row level security;
drop policy if exists p_tax_ledger_tenant on tax_ledger;
create policy p_tax_ledger_tenant on tax_ledger
  for all
  using (tax_ledger.company_id = fn_current_company_id())
  with check (tax_ledger.company_id = fn_current_company_id());

-- webhook_endpoint
alter table webhook_endpoint enable row level security;
alter table webhook_endpoint force row level security;
drop policy if exists p_webhook_endpoint_tenant on webhook_endpoint;
create policy p_webhook_endpoint_tenant on webhook_endpoint
  for all
  using (webhook_endpoint.company_id = fn_current_company_id())
  with check (webhook_endpoint.company_id = fn_current_company_id());

-- ---------------------------------------------------------------------------
-- ۸) جدول‌هایِ دارایِ branch_id (38 جدول) — اجاره از راهِ شعبه
-- ---------------------------------------------------------------------------
-- نکته: اگر در جدولی branch_id تهی‌پذیر باشد، سطرهایِ با branch_id تهی زیرِ نقشِ
-- اجبارکننده دیده نمی‌شوند و درجِ چنین سطری هم رد می‌شود. این «شکستِ بسته» است و
-- عمدی: دادهٔ بدونِ شعبهٔ مشخص به هیچ اجاره‌ای تعلق ندارد.
-- ar_aging_snapshot
alter table ar_aging_snapshot enable row level security;
alter table ar_aging_snapshot force row level security;
drop policy if exists p_ar_aging_snapshot_tenant on ar_aging_snapshot;
create policy p_ar_aging_snapshot_tenant on ar_aging_snapshot
  for all
  using (ar_aging_snapshot.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (ar_aging_snapshot.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- bank_account
alter table bank_account enable row level security;
alter table bank_account force row level security;
drop policy if exists p_bank_account_tenant on bank_account;
create policy p_bank_account_tenant on bank_account
  for all
  using (bank_account.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (bank_account.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- cash_box
alter table cash_box enable row level security;
alter table cash_box force row level security;
drop policy if exists p_cash_box_tenant on cash_box;
create policy p_cash_box_tenant on cash_box
  for all
  using (cash_box.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (cash_box.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- cheque
alter table cheque enable row level security;
alter table cheque force row level security;
drop policy if exists p_cheque_tenant on cheque;
create policy p_cheque_tenant on cheque
  for all
  using (cheque.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (cheque.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- credit_note
alter table credit_note enable row level security;
alter table credit_note force row level security;
drop policy if exists p_credit_note_tenant on credit_note;
create policy p_credit_note_tenant on credit_note
  for all
  using (credit_note.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (credit_note.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- customer
alter table customer enable row level security;
alter table customer force row level security;
drop policy if exists p_customer_tenant on customer;
create policy p_customer_tenant on customer
  for all
  using (customer.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (customer.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- customer_ledger_entry
alter table customer_ledger_entry enable row level security;
alter table customer_ledger_entry force row level security;
drop policy if exists p_customer_ledger_entry_tenant on customer_ledger_entry;
create policy p_customer_ledger_entry_tenant on customer_ledger_entry
  for all
  using (customer_ledger_entry.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (customer_ledger_entry.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- customer_request
alter table customer_request enable row level security;
alter table customer_request force row level security;
drop policy if exists p_customer_request_tenant on customer_request;
create policy p_customer_request_tenant on customer_request
  for all
  using (customer_request.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (customer_request.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- daily_treasury_close
alter table daily_treasury_close enable row level security;
alter table daily_treasury_close force row level security;
drop policy if exists p_daily_treasury_close_tenant on daily_treasury_close;
create policy p_daily_treasury_close_tenant on daily_treasury_close
  for all
  using (daily_treasury_close.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (daily_treasury_close.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- delivery
alter table delivery enable row level security;
alter table delivery force row level security;
drop policy if exists p_delivery_tenant on delivery;
create policy p_delivery_tenant on delivery
  for all
  using (delivery.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (delivery.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- document_series
alter table document_series enable row level security;
alter table document_series force row level security;
drop policy if exists p_document_series_tenant on document_series;
create policy p_document_series_tenant on document_series
  for all
  using (document_series.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (document_series.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- exception_item
alter table exception_item enable row level security;
alter table exception_item force row level security;
drop policy if exists p_exception_item_tenant on exception_item;
create policy p_exception_item_tenant on exception_item
  for all
  using (exception_item.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (exception_item.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- goods_receipt
alter table goods_receipt enable row level security;
alter table goods_receipt force row level security;
drop policy if exists p_goods_receipt_tenant on goods_receipt;
create policy p_goods_receipt_tenant on goods_receipt
  for all
  using (goods_receipt.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (goods_receipt.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- landed_cost
alter table landed_cost enable row level security;
alter table landed_cost force row level security;
drop policy if exists p_landed_cost_tenant on landed_cost;
create policy p_landed_cost_tenant on landed_cost
  for all
  using (landed_cost.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (landed_cost.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- payment_receipt
alter table payment_receipt enable row level security;
alter table payment_receipt force row level security;
drop policy if exists p_payment_receipt_tenant on payment_receipt;
create policy p_payment_receipt_tenant on payment_receipt
  for all
  using (payment_receipt.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (payment_receipt.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- payment_voucher
alter table payment_voucher enable row level security;
alter table payment_voucher force row level security;
drop policy if exists p_payment_voucher_tenant on payment_voucher;
create policy p_payment_voucher_tenant on payment_voucher
  for all
  using (payment_voucher.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (payment_voucher.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- petty_cash
alter table petty_cash enable row level security;
alter table petty_cash force row level security;
drop policy if exists p_petty_cash_tenant on petty_cash;
create policy p_petty_cash_tenant on petty_cash
  for all
  using (petty_cash.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (petty_cash.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- psp_transaction
alter table psp_transaction enable row level security;
alter table psp_transaction force row level security;
drop policy if exists p_psp_transaction_tenant on psp_transaction;
create policy p_psp_transaction_tenant on psp_transaction
  for all
  using (psp_transaction.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (psp_transaction.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- purchase_order
alter table purchase_order enable row level security;
alter table purchase_order force row level security;
drop policy if exists p_purchase_order_tenant on purchase_order;
create policy p_purchase_order_tenant on purchase_order
  for all
  using (purchase_order.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (purchase_order.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- purchase_request
alter table purchase_request enable row level security;
alter table purchase_request force row level security;
drop policy if exists p_purchase_request_tenant on purchase_request;
create policy p_purchase_request_tenant on purchase_request
  for all
  using (purchase_request.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (purchase_request.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- return_request
alter table return_request enable row level security;
alter table return_request force row level security;
drop policy if exists p_return_request_tenant on return_request;
create policy p_return_request_tenant on return_request
  for all
  using (return_request.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (return_request.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- sales_area
alter table sales_area enable row level security;
alter table sales_area force row level security;
drop policy if exists p_sales_area_tenant on sales_area;
create policy p_sales_area_tenant on sales_area
  for all
  using (sales_area.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (sales_area.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- sales_order
alter table sales_order enable row level security;
alter table sales_order force row level security;
drop policy if exists p_sales_order_tenant on sales_order;
create policy p_sales_order_tenant on sales_order
  for all
  using (sales_order.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (sales_order.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- staff
alter table staff enable row level security;
alter table staff force row level security;
drop policy if exists p_staff_tenant on staff;
create policy p_staff_tenant on staff
  for all
  using (staff.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (staff.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- stock_adjustment
alter table stock_adjustment enable row level security;
alter table stock_adjustment force row level security;
drop policy if exists p_stock_adjustment_tenant on stock_adjustment;
create policy p_stock_adjustment_tenant on stock_adjustment
  for all
  using (stock_adjustment.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (stock_adjustment.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- stock_count
alter table stock_count enable row level security;
alter table stock_count force row level security;
drop policy if exists p_stock_count_tenant on stock_count;
create policy p_stock_count_tenant on stock_count
  for all
  using (stock_count.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (stock_count.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- stock_transfer
alter table stock_transfer enable row level security;
alter table stock_transfer force row level security;
drop policy if exists p_stock_transfer_tenant on stock_transfer;
create policy p_stock_transfer_tenant on stock_transfer
  for all
  using (stock_transfer.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (stock_transfer.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- supplier_invoice
alter table supplier_invoice enable row level security;
alter table supplier_invoice force row level security;
drop policy if exists p_supplier_invoice_tenant on supplier_invoice;
create policy p_supplier_invoice_tenant on supplier_invoice
  for all
  using (supplier_invoice.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (supplier_invoice.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- supplier_ledger_entry
alter table supplier_ledger_entry enable row level security;
alter table supplier_ledger_entry force row level security;
drop policy if exists p_supplier_ledger_entry_tenant on supplier_ledger_entry;
create policy p_supplier_ledger_entry_tenant on supplier_ledger_entry
  for all
  using (supplier_ledger_entry.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (supplier_ledger_entry.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- telesale_target
alter table telesale_target enable row level security;
alter table telesale_target force row level security;
drop policy if exists p_telesale_target_tenant on telesale_target;
create policy p_telesale_target_tenant on telesale_target
  for all
  using (telesale_target.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (telesale_target.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- tour
alter table tour enable row level security;
alter table tour force row level security;
drop policy if exists p_tour_tenant on tour;
create policy p_tour_tenant on tour
  for all
  using (tour.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (tour.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- value_document
alter table value_document enable row level security;
alter table value_document force row level security;
drop policy if exists p_value_document_tenant on value_document;
create policy p_value_document_tenant on value_document
  for all
  using (value_document.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (value_document.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- vehicle
alter table vehicle enable row level security;
alter table vehicle force row level security;
drop policy if exists p_vehicle_tenant on vehicle;
create policy p_vehicle_tenant on vehicle
  for all
  using (vehicle.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (vehicle.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- vehicle_load
alter table vehicle_load enable row level security;
alter table vehicle_load force row level security;
drop policy if exists p_vehicle_load_tenant on vehicle_load;
create policy p_vehicle_load_tenant on vehicle_load
  for all
  using (vehicle_load.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (vehicle_load.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- warehouse
alter table warehouse enable row level security;
alter table warehouse force row level security;
drop policy if exists p_warehouse_tenant on warehouse;
create policy p_warehouse_tenant on warehouse
  for all
  using (warehouse.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (warehouse.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- waybill
alter table waybill enable row level security;
alter table waybill force row level security;
drop policy if exists p_waybill_tenant on waybill;
create policy p_waybill_tenant on waybill
  for all
  using (waybill.branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (waybill.branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- ---------------------------------------------------------------------------
-- ۸-۰) استثنا: جدول‌هایِ «پارتیشن‌شده» عمداً در این گام RLS نمی‌گیرند
-- ---------------------------------------------------------------------------
-- inventory_txn (پارتیشن بر اساسِ occurred_at)، location_sample (بر اساسِ
-- recorded_at) و audit_log (بر اساسِ at) جدولِ پارتیشن‌شده‌اند و پارتیشن‌هایشان
-- «پویا» توسطِ fn_ensure_partitions ساخته می‌شود.
--
-- اگر رویِ والد RLS فعال شود بدونِ آنکه سیاستِ متناسب با پارتیشن‌هایِ موجود و آینده
-- تعریف شده باشد، دسترسی به همهٔ پارتیشن‌ها به‌طورِ پیش‌فرض «رد» می‌شود و ماژول‌هایِ
-- موجودی/ردیابی/ممیزی زیرِ نقشِ اجبارکننده از کار می‌افتند. چون صحتِ این رفتار
-- نیازمندِ آزمونِ DB رویِ پارتیشن‌هایِ چندگانه است، عمداً به گامِ بعدی موکول شد و
-- در docs/db-privilege-architecture.md (بخشِ ۶) به‌عنوانِ کارِ باقی‌مانده ثبت شده است.
--
-- توجه: این سه جدول امروز هم از راهِ فیلترِ company_id/branch_id در ریپازیتوری‌ها
-- محدود می‌شوند؛ این استثنا فقط «لایهٔ دومِ دفاع» را برایِ آن‌ها به تعویق می‌اندازد.

-- ---------------------------------------------------------------------------
-- ۸-۱) استثنا: setting — ستونِ company_id «تهی‌پذیر» است
-- ---------------------------------------------------------------------------
-- در مهاجرت 0031 ستونِ company_id به setting افزوده شد و company_id IS NULL یعنی
-- «تنظیمِ واقعاً سراسری» (scope_type='global'). پس سیاستِ یکنواختِ
-- «company_id = زمینهٔ جاری» تنظیماتِ سراسری را از همهٔ اجاره‌ها پنهان می‌کرد و
-- برنامه را زیرِ نقشِ اجبارکننده می‌شکست.
--
-- طراحیِ کمینه‌امتیار:
--   * خواندن: تنظیماتِ همان شرکت + تنظیماتِ سراسری (company_id تهی)
--   * نوشتن: فقط تنظیماتِ «همان شرکت» ⇒ یک اجاره نمی‌تواند تنظیمِ سراسری بسازد یا
--     ویرایش کند (تصعیدِ امتیازِ بین‌اجاره‌ای). همین‌طور ردیفِ سراسریِ موجود را هم
--     نمی‌تواند به‌روزرسانی کند، چون WITH CHECK رویِ مقدارِ جدید هم اعمال می‌شود.
alter table setting enable row level security;
alter table setting force row level security;
drop policy if exists p_setting_tenant on setting;
create policy p_setting_tenant on setting
  for all
  using (setting.company_id = fn_current_company_id() or setting.company_id is null)
  with check (setting.company_id = fn_current_company_id());

-- ---------------------------------------------------------------------------
-- ۹) توابعِ SECURITY DEFINER برایِ مسیرهایِ «پیش از اجاره»
-- ---------------------------------------------------------------------------
-- قاعدهٔ مشترک: search_path پین‌شده (تا ربودنِ search_path ممکن نباشد)،
-- REVOKE از PUBLIC، و EXECUTE فقط برایِ نقشِ برنامه.

-- ۹-۱) ساختِ اجاره: نوشتنِ پیش‌از‌اجاره در چند جدول (شرکت/شعبه/شخص/نقش/حسابِ مدیر)
alter function fn_provision_company(text, text, text, text, text, text) security definer;
alter function fn_provision_company(text, text, text, text, text, text)
  set search_path = public, pg_temp;
revoke all on function fn_provision_company(text, text, text, text, text, text) from public;
grant execute on function fn_provision_company(text, text, text, text, text, text) to dms_app;

-- ۹-۲) جست‌وجویِ ورودِ پرتال
-- ورودِ پرتال «پیش از» ست‌شدنِ app.company_id رخ می‌دهد، پس با سیاستِ
-- p_portal_user_tenant هیچ ردیفی برگشت نمی‌شد و عملاً هیچ کاربری نمی‌توانست وارد شود.
-- این تابع تنها «یک» سطرِ متناظر با ایمیل را برمی‌گرداند (ایندکسِ یکتا روی
-- lower(email) ⇒ ابهام ذاتاً ممکن نیست)، هیچ پارامترِ company_id نمی‌گیرد (پس
-- فراخوان نمی‌تواند اجارهٔ دلخواه انتخاب کند) و رمزِ حساب را فقط به خودِ نقشِ
-- برنامه می‌دهد — نه به PUBLIC.
create or replace function fn_portal_find_login(p_email text)
returns table (
  id uuid,
  company_id uuid,
  customer_id uuid,
  email text,
  password_hash text,
  display_name text,
  is_active boolean,
  failed_attempts integer,
  locked_until timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id, u.company_id, u.customer_id, u.email, u.password_hash, u.display_name,
         u.is_active, u.failed_attempts, u.locked_until
    from portal_user u
   where lower(u.email) = lower(p_email)
   limit 1;
$$;

comment on function fn_portal_find_login(text) is
  'جست‌وجویِ محدودِ ورودِ پرتال (پیش از اجاره): فقط یک سطرِ متناظر با ایمیل، SECURITY DEFINER با search_path ثابت';

revoke all on function fn_portal_find_login(text) from public;
grant execute on function fn_portal_find_login(text) to dms_app;
