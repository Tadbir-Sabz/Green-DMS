-- بازگردانیِ 0041 — حذفِ نقش‌ها، امتیازات، سیاست‌هایِ افزوده‌شده و توابعِ SECURITY DEFINER
--
-- ترتیبِ عمدی: نخست وابستگی‌ها (توابع/سیاست‌ها) برداشته می‌شوند، سپس امتیازها،
-- و در آخر نقش‌ها. جدول‌هایی که «پیش از 0041» هم RLS داشتند فقط NO FORCE می‌شوند
-- (RLSشان دست‌نخورده می‌ماند) تا وضعیتِ پیشین دقیقاً بازگردد.
--
-- نکته: search_pathِ پین‌شدهٔ fn_provision_company عمداً برداشته نمی‌شود، چون
-- پین‌کردنِ search_path یک سخت‌سازیِ بی‌ضرر است و بازگرداندنش نیازمندِ بازنویسیِ
-- کاملِ بدنهٔ تابع است (ریسکِ بیشتر، سودِ صفر).

-- ۱) توابعِ SECURITY DEFINERِ افزوده‌شده
drop function if exists fn_portal_find_login(text);
-- توجه: fn_current_company_id «نمی‌تواند» اینجا حذف شود، چون ۶۷ سیاستِ RLS به آن
-- وابسته‌اند (cannot drop function ... because other objects depend on it).
-- حذفش به «پایانِ» این فایل منتقل شد، یعنی پس از آنکه همهٔ سیاست‌ها برداشته شدند.

-- fn_provision_company را به رفتارِ پیشین (SECURITY INVOKER) برمی‌گردانیم
alter function fn_provision_company(text, text, text, text, text, text) security invoker;
grant execute on function fn_provision_company(text, text, text, text, text, text) to public;

-- ۲) سیاستِ ممیزیِ استقرار و جدولِ اجاره
drop policy if exists p_onboarding_attempt_insert on onboarding_attempt;
alter table onboarding_attempt no force row level security;
alter table onboarding_attempt disable row level security;

drop policy if exists p_setting_tenant on setting;
alter table setting no force row level security;
alter table setting disable row level security;

drop policy if exists p_company_tenant on company;
alter table company no force row level security;
alter table company disable row level security;

-- ۳) سیاست‌هایِ افزوده‌شده رویِ جدول‌هایِ اجاره‌ای

drop policy if exists p_account_mapping_tenant on account_mapping;
alter table account_mapping no force row level security;
alter table account_mapping disable row level security;

drop policy if exists p_approval_chain_tenant on approval_chain;
alter table approval_chain no force row level security;
alter table approval_chain disable row level security;

drop policy if exists p_ar_aging_snapshot_tenant on ar_aging_snapshot;
alter table ar_aging_snapshot no force row level security;
alter table ar_aging_snapshot disable row level security;

drop policy if exists p_bank_account_tenant on bank_account;
alter table bank_account no force row level security;
alter table bank_account disable row level security;

drop policy if exists p_branch_tenant on branch;
alter table branch no force row level security;
alter table branch disable row level security;

drop policy if exists p_brand_tenant on brand;
alter table brand no force row level security;
alter table brand disable row level security;

drop policy if exists p_cash_box_tenant on cash_box;
alter table cash_box no force row level security;
alter table cash_box disable row level security;

drop policy if exists p_cheque_tenant on cheque;
alter table cheque no force row level security;
alter table cheque disable row level security;

drop policy if exists p_commission_plan_tenant on commission_plan;
alter table commission_plan no force row level security;
alter table commission_plan disable row level security;

drop policy if exists p_company_tenant on company;
alter table company no force row level security;
alter table company disable row level security;

drop policy if exists p_credit_note_tenant on credit_note;
alter table credit_note no force row level security;
alter table credit_note disable row level security;

drop policy if exists p_customer_tenant on customer;
alter table customer no force row level security;
alter table customer disable row level security;

drop policy if exists p_customer_ledger_entry_tenant on customer_ledger_entry;
alter table customer_ledger_entry no force row level security;
alter table customer_ledger_entry disable row level security;

drop policy if exists p_customer_request_tenant on customer_request;
alter table customer_request no force row level security;
alter table customer_request disable row level security;

drop policy if exists p_daily_treasury_close_tenant on daily_treasury_close;
alter table daily_treasury_close no force row level security;
alter table daily_treasury_close disable row level security;

drop policy if exists p_delivery_tenant on delivery;
alter table delivery no force row level security;
alter table delivery disable row level security;

drop policy if exists p_document_series_tenant on document_series;
alter table document_series no force row level security;
alter table document_series disable row level security;

drop policy if exists p_exception_item_tenant on exception_item;
alter table exception_item no force row level security;
alter table exception_item disable row level security;

drop policy if exists p_fiscal_period_tenant on fiscal_period;
alter table fiscal_period no force row level security;
alter table fiscal_period disable row level security;

drop policy if exists p_gl_account_tenant on gl_account;
alter table gl_account no force row level security;
alter table gl_account disable row level security;

drop policy if exists p_gl_dimension_tenant on gl_dimension;
alter table gl_dimension no force row level security;
alter table gl_dimension disable row level security;

drop policy if exists p_goods_receipt_tenant on goods_receipt;
alter table goods_receipt no force row level security;
alter table goods_receipt disable row level security;

drop policy if exists p_integration_credential_tenant on integration_credential;
alter table integration_credential no force row level security;
alter table integration_credential disable row level security;

drop policy if exists p_job_position_tenant on job_position;
alter table job_position no force row level security;
alter table job_position disable row level security;

drop policy if exists p_journal_entry_tenant on journal_entry;
alter table journal_entry no force row level security;
alter table journal_entry disable row level security;

drop policy if exists p_landed_cost_tenant on landed_cost;
alter table landed_cost no force row level security;
alter table landed_cost disable row level security;

drop policy if exists p_ledger_balance_snapshot_tenant on ledger_balance_snapshot;
alter table ledger_balance_snapshot no force row level security;
alter table ledger_balance_snapshot disable row level security;

drop policy if exists p_payment_receipt_tenant on payment_receipt;
alter table payment_receipt no force row level security;
alter table payment_receipt disable row level security;

drop policy if exists p_payment_voucher_tenant on payment_voucher;
alter table payment_voucher no force row level security;
alter table payment_voucher disable row level security;

drop policy if exists p_person_tenant on person;
alter table person no force row level security;
alter table person disable row level security;

drop policy if exists p_petty_cash_tenant on petty_cash;
alter table petty_cash no force row level security;
alter table petty_cash disable row level security;

drop policy if exists p_price_list_tenant on price_list;
alter table price_list no force row level security;
alter table price_list disable row level security;

drop policy if exists p_print_template_tenant on print_template;
alter table print_template no force row level security;
alter table print_template disable row level security;

drop policy if exists p_product_tenant on product;
alter table product no force row level security;
alter table product disable row level security;

drop policy if exists p_product_category_tenant on product_category;
alter table product_category no force row level security;
alter table product_category disable row level security;

drop policy if exists p_promotion_tenant on promotion;
alter table promotion no force row level security;
alter table promotion disable row level security;

drop policy if exists p_psp_transaction_tenant on psp_transaction;
alter table psp_transaction no force row level security;
alter table psp_transaction disable row level security;

drop policy if exists p_purchase_order_tenant on purchase_order;
alter table purchase_order no force row level security;
alter table purchase_order disable row level security;

drop policy if exists p_purchase_request_tenant on purchase_request;
alter table purchase_request no force row level security;
alter table purchase_request disable row level security;

drop policy if exists p_recurring_journal_tenant on recurring_journal;
alter table recurring_journal no force row level security;
alter table recurring_journal disable row level security;

drop policy if exists p_return_request_tenant on return_request;
alter table return_request no force row level security;
alter table return_request disable row level security;

drop policy if exists p_role_tenant on role;
alter table role no force row level security;
alter table role disable row level security;

drop policy if exists p_rule_tenant on rule;
alter table rule no force row level security;
alter table rule disable row level security;

drop policy if exists p_sales_area_tenant on sales_area;
alter table sales_area no force row level security;
alter table sales_area disable row level security;

drop policy if exists p_sales_order_tenant on sales_order;
alter table sales_order no force row level security;
alter table sales_order disable row level security;

drop policy if exists p_settlement_term_tenant on settlement_term;
alter table settlement_term no force row level security;
alter table settlement_term disable row level security;

drop policy if exists p_sms_template_tenant on sms_template;
alter table sms_template no force row level security;
alter table sms_template disable row level security;

drop policy if exists p_staff_tenant on staff;
alter table staff no force row level security;
alter table staff disable row level security;

drop policy if exists p_stock_adjustment_tenant on stock_adjustment;
alter table stock_adjustment no force row level security;
alter table stock_adjustment disable row level security;

drop policy if exists p_stock_count_tenant on stock_count;
alter table stock_count no force row level security;
alter table stock_count disable row level security;

drop policy if exists p_stock_transfer_tenant on stock_transfer;
alter table stock_transfer no force row level security;
alter table stock_transfer disable row level security;

drop policy if exists p_supplier_tenant on supplier;
alter table supplier no force row level security;
alter table supplier disable row level security;

drop policy if exists p_supplier_invoice_tenant on supplier_invoice;
alter table supplier_invoice no force row level security;
alter table supplier_invoice disable row level security;

drop policy if exists p_supplier_ledger_entry_tenant on supplier_ledger_entry;
alter table supplier_ledger_entry no force row level security;
alter table supplier_ledger_entry disable row level security;

drop policy if exists p_tax_code_tenant on tax_code;
alter table tax_code no force row level security;
alter table tax_code disable row level security;

drop policy if exists p_tax_ledger_tenant on tax_ledger;
alter table tax_ledger no force row level security;
alter table tax_ledger disable row level security;

drop policy if exists p_telesale_target_tenant on telesale_target;
alter table telesale_target no force row level security;
alter table telesale_target disable row level security;

drop policy if exists p_tour_tenant on tour;
alter table tour no force row level security;
alter table tour disable row level security;

drop policy if exists p_value_document_tenant on value_document;
alter table value_document no force row level security;
alter table value_document disable row level security;

drop policy if exists p_vehicle_tenant on vehicle;
alter table vehicle no force row level security;
alter table vehicle disable row level security;

drop policy if exists p_vehicle_load_tenant on vehicle_load;
alter table vehicle_load no force row level security;
alter table vehicle_load disable row level security;

drop policy if exists p_warehouse_tenant on warehouse;
alter table warehouse no force row level security;
alter table warehouse disable row level security;

drop policy if exists p_waybill_tenant on waybill;
alter table waybill no force row level security;
alter table waybill disable row level security;

drop policy if exists p_webhook_endpoint_tenant on webhook_endpoint;
alter table webhook_endpoint no force row level security;
alter table webhook_endpoint disable row level security;

-- ۴) جدول‌هایی که پیش از 0041 هم RLS داشتند: فقط FORCE برداشته می‌شود

alter table attachment no force row level security;

alter table billing_invoice no force row level security;

alter table invoice no force row level security;

alter table portal_session no force row level security;

alter table portal_user no force row level security;

-- ۵) امتیازها و پیش‌فرض‌هایِ اعطاشده
alter default privileges in schema public revoke select, insert, update, delete on tables from dms_app;
alter default privileges in schema public revoke select on tables from dms_readonly;
alter default privileges in schema public revoke usage, select, update on sequences from dms_app;

revoke insert on onboarding_attempt from dms_app;
revoke usage, select, update on all sequences in schema public from dms_app;
revoke usage, select on all sequences in schema public from dms_readonly;
revoke select, insert, update, delete on all tables in schema public from dms_app;
revoke select on all tables in schema public from dms_readonly;
revoke execute on all functions in schema public from dms_app;
revoke create on schema public from dms_migrator;
revoke usage on schema public from dms_migrator, dms_app, dms_readonly;

-- ۶) نقش‌ها — فقط اگر واقعاً قابلِ حذف باشند (بدونِ مالکیت/اتصالِ باز)
do $$
declare
  r text;
  blocked boolean;
begin
  foreach r in array array['dms_readonly', 'dms_app', 'dms_migrator', 'dms_owner'] loop
    select exists (select 1 from pg_class c
                     join pg_roles g on g.oid = c.relowner
                    where g.rolname = r) into blocked;
    if blocked then
      raise notice 'role % still owns objects — skipping drop (REASSIGN/DROP OWNED first)', r;
    else
      begin
        execute format('drop role if exists %I', r);
      exception when others then
        raise notice 'role % could not be dropped: %', r, sqlerrm;
      end;
    end if;
  end loop;
end
$$;

-- نکته: سیاست‌هایی که در 0041 «بازتعریف» شدند (p_attachment_tenant,
-- p_billing_invoice_tenant, p_portal_user_tenant, p_portal_session_tenant,
-- p_invoice_tenant) در پایین حذف می‌شوند و سپس با همان معنایِ اصلی از مهاجرت‌هایِ
-- 0021/0036/0037/0039 بازسازی می‌گردند تا وضعیتِ پیش از 0041 دقیقاً برگردد.
drop policy if exists p_attachment_tenant on attachment;
create policy p_attachment_tenant on attachment
  using (company_id = current_setting('app.company_id')::uuid);
drop policy if exists p_billing_invoice_tenant on billing_invoice;
create policy p_billing_invoice_tenant on billing_invoice
  using (company_id = current_setting('app.company_id')::uuid);
drop policy if exists p_portal_user_tenant on portal_user;
create policy p_portal_user_tenant on portal_user
  using (company_id = current_setting('app.company_id')::uuid);
drop policy if exists p_portal_session_tenant on portal_session;
create policy p_portal_session_tenant on portal_session
  using (company_id = current_setting('app.company_id')::uuid);
drop policy if exists p_invoice_tenant on invoice;
create policy p_invoice_tenant on invoice
  using (branch_id in (select id from branch
                        where company_id = current_setting('app.company_id')::uuid));

-- ۷) اکنون که هیچ سیاستی به آن وابسته نیست، تابعِ زمینهٔ اجاره حذف می‌شود
-- (این خط عمداً در پایان است؛ ترتیبِ نادرست باعثِ شکستِ down می‌شد).
drop function if exists fn_current_company_id();
