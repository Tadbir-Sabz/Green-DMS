-- 0042: سیاست‌های RLS زنجیرهٔ والد برایِ جداولِ فرزند/سطری + پوششِ پارتیشن‌هایِ پویا
--
-- هدف: در 0041 جداسازیِ اجاره فقط روی ۷۰ جدولِ دارایِ ستونِ company_id/branch_id فعال شد؛
--      ۶۸ جدولِ فرزند هیچ سیاستی نداشتند، پس یک اجاره می‌توانست سطرِ فرزندِ اجارهٔ دیگر را
--      مستقیم بخواند/بنویسد (مثلاً invoice_line یا pod یک شرکتِ دیگر).
--
-- الگو: سیاستِ هر جدولِ فرزند «دیده‌شدنِ والد» را می‌سنجد، نه ستونِ اجاره را:
--          exists (select 1 from <parent> pp where pp.id = <child>.<fk>)
--       چون خودِ <parent> در 0041 RLS دارد، این زیرکوئری زیرِ RLS اجرا می‌شود و والدِ
--       اجارهٔ دیگر نامرئی است ⇒ فرزند هم نامرئی/غیرقابلِ نوشتن می‌شود. مزیت‌ها:
--       (۱) هیچ مسیرِ مالکیتی حدس زده نشده — همه از کلیدِ خارجیِ واقعیِ اسکیمان آمده‌اند؛
--       (۲) رفتارِ fail-closed از fn_current_company_id() به‌صورتِ گذرا به ارث می‌رسد
--           (زمینهٔ ست‌نشده/نامعتبر ⇒ null ⇒ هیچ والدی دیده نمی‌شود ⇒ صفر سطر)؛
--       (۳) برایِ جداولِ دو پرشی (مثلِ approval_decision→approval_request→approval_chain)
--           به‌صورتِ بازگشتی درست کار می‌کند، بدونِ نوشتنِ مسیرِ کامل در هر سیاست.
--
-- ستون‌هایِ سیاست‌ها عمداً «بدونِ پیشوندِ نامِ جدول» نوشته شده‌اند تا تعریفِ همان سیاست رویِ
-- پارتیشن‌ها (که نامِ دیگری دارند) با pg_get_expr بازتولیدپذیر بماند.

begin;

-- =====================================================================
-- §0  استثناها (عمداً سیاست نگرفتند — با دلیلِ مستند، نه برایِ بالا بردنِ شمارِ پوشش)
-- =====================================================================
--   app_user         خوشهٔ هویت/احرازِ پیش‌اجاره: پیش از set شدنِ app.company_id در ورودِ کارمند خوانده
--                    می‌شود (app_user/person) ⇒ سیاستِ زنجیرهٔ والد ورود را می‌شکست. راهِ درستِ آن
--                    همان الگویِ پرتال است: تابعِ SECURITY DEFINER با search_path پین‌شده.
--   auth_session     خوشهٔ هویت/احرازِ پیش‌اجاره: پیش از set شدنِ app.company_id در ورودِ کارمند خوانده
--                    می‌شود (app_user/person) ⇒ سیاستِ زنجیرهٔ والد ورود را می‌شکست. راهِ درستِ آن
--                    همان الگویِ پرتال است: تابعِ SECURITY DEFINER با search_path پین‌شده.
--   role_permission  خوشهٔ هویت/احرازِ پیش‌اجاره: پیش از set شدنِ app.company_id در ورودِ کارمند خوانده
--                    می‌شود (app_user/person) ⇒ سیاستِ زنجیرهٔ والد ورود را می‌شکست. راهِ درستِ آن
--                    همان الگویِ پرتال است: تابعِ SECURITY DEFINER با search_path پین‌شده.
--   user_role        خوشهٔ هویت/احرازِ پیش‌اجاره: پیش از set شدنِ app.company_id در ورودِ کارمند خوانده
--                    می‌شود (app_user/person) ⇒ سیاستِ زنجیرهٔ والد ورود را می‌شکست. راهِ درستِ آن
--                    همان الگویِ پرتال است: تابعِ SECURITY DEFINER با search_path پین‌شده.
--   user_scope       خوشهٔ هویت/احرازِ پیش‌اجاره: پیش از set شدنِ app.company_id در ورودِ کارمند خوانده
--                    می‌شود (app_user/person) ⇒ سیاستِ زنجیرهٔ والد ورود را می‌شکست. راهِ درستِ آن
--                    همان الگویِ پرتال است: تابعِ SECURITY DEFINER با search_path پین‌شده.
--   auth_otp         دادهٔ مرجعِ سراسری (بدونِ مالکِ اجاره) ⇒ باید برایِ همهٔ اجاره‌ها خواندنی بماند.
--   feature_flag     دادهٔ مرجعِ سراسری (بدونِ مالکِ اجاره) ⇒ باید برایِ همهٔ اجاره‌ها خواندنی بماند.
--   payment_method   دادهٔ مرجعِ سراسری (بدونِ مالکِ اجاره) ⇒ باید برایِ همهٔ اجاره‌ها خواندنی بماند.
--   permission       دادهٔ مرجعِ سراسری (بدونِ مالکِ اجاره) ⇒ باید برایِ همهٔ اجاره‌ها خواندنی بماند.
--   uom              دادهٔ مرجعِ سراسری (بدونِ مالکِ اجاره) ⇒ باید برایِ همهٔ اجاره‌ها خواندنی بماند.
--   attachment/setting/portal_*  از پیش در 0041 پوشش گرفته‌اند (با استثنایِ NULL=سراسری).

-- =====================================================================
-- §1  جداولِ فرزند: سیاستِ «دیده‌شدنِ والدِ راستی‌آزمایی‌شده»
-- =====================================================================
-- approval_decision.approval_request_id → approval_request.id
alter table approval_decision enable row level security;
alter table approval_decision force row level security;
create policy p_approval_decision_tenant on approval_decision
  for all
  using (exists (select 1 from approval_request pp where pp.id = approval_request_id))
  with check (exists (select 1 from approval_request pp where pp.id = approval_request_id));

-- approval_request.approval_chain_id → approval_chain.id
alter table approval_request enable row level security;
alter table approval_request force row level security;
create policy p_approval_request_tenant on approval_request
  for all
  using (exists (select 1 from approval_chain pp where pp.id = approval_chain_id))
  with check (exists (select 1 from approval_chain pp where pp.id = approval_chain_id));

-- approval_step_def.approval_chain_id → approval_chain.id
alter table approval_step_def enable row level security;
alter table approval_step_def force row level security;
create policy p_approval_step_def_tenant on approval_step_def
  for all
  using (exists (select 1 from approval_chain pp where pp.id = approval_chain_id))
  with check (exists (select 1 from approval_chain pp where pp.id = approval_chain_id));

-- bank_statement.bank_account_id → bank_account.id
alter table bank_statement enable row level security;
alter table bank_statement force row level security;
create policy p_bank_statement_tenant on bank_statement
  for all
  using (exists (select 1 from bank_account pp where pp.id = bank_account_id))
  with check (exists (select 1 from bank_account pp where pp.id = bank_account_id));

-- bank_statement_line.bank_statement_id → bank_statement.id
alter table bank_statement_line enable row level security;
alter table bank_statement_line force row level security;
create policy p_bank_statement_line_tenant on bank_statement_line
  for all
  using (exists (select 1 from bank_statement pp where pp.id = bank_statement_id))
  with check (exists (select 1 from bank_statement pp where pp.id = bank_statement_id));

-- batch.product_id → product.id
alter table batch enable row level security;
alter table batch force row level security;
create policy p_batch_tenant on batch
  for all
  using (exists (select 1 from product pp where pp.id = product_id))
  with check (exists (select 1 from product pp where pp.id = product_id));

-- cash_session.cash_box_id → cash_box.id
alter table cash_session enable row level security;
alter table cash_session force row level security;
create policy p_cash_session_tenant on cash_session
  for all
  using (exists (select 1 from cash_box pp where pp.id = cash_box_id))
  with check (exists (select 1 from cash_box pp where pp.id = cash_box_id));

-- cash_txn.cash_box_id → cash_box.id
alter table cash_txn enable row level security;
alter table cash_txn force row level security;
create policy p_cash_txn_tenant on cash_txn
  for all
  using (exists (select 1 from cash_box pp where pp.id = cash_box_id))
  with check (exists (select 1 from cash_box pp where pp.id = cash_box_id));

-- cheque_event.cheque_id → cheque.id
alter table cheque_event enable row level security;
alter table cheque_event force row level security;
create policy p_cheque_event_tenant on cheque_event
  for all
  using (exists (select 1 from cheque pp where pp.id = cheque_id))
  with check (exists (select 1 from cheque pp where pp.id = cheque_id));

-- cogs_entry.product_id → product.id
alter table cogs_entry enable row level security;
alter table cogs_entry force row level security;
create policy p_cogs_entry_tenant on cogs_entry
  for all
  using (exists (select 1 from product pp where pp.id = product_id))
  with check (exists (select 1 from product pp where pp.id = product_id));

-- collection_action.customer_id → customer.id
alter table collection_action enable row level security;
alter table collection_action force row level security;
create policy p_collection_action_tenant on collection_action
  for all
  using (exists (select 1 from customer pp where pp.id = customer_id))
  with check (exists (select 1 from customer pp where pp.id = customer_id));

-- commission_line.commission_plan_id → commission_plan.id
alter table commission_line enable row level security;
alter table commission_line force row level security;
create policy p_commission_line_tenant on commission_line
  for all
  using (exists (select 1 from commission_plan pp where pp.id = commission_plan_id))
  with check (exists (select 1 from commission_plan pp where pp.id = commission_plan_id));

-- commission_tier.commission_plan_id → commission_plan.id
alter table commission_tier enable row level security;
alter table commission_tier force row level security;
create policy p_commission_tier_tenant on commission_tier
  for all
  using (exists (select 1 from commission_plan pp where pp.id = commission_plan_id))
  with check (exists (select 1 from commission_plan pp where pp.id = commission_plan_id));

-- container_loan.customer_id → customer.id
alter table container_loan enable row level security;
alter table container_loan force row level security;
create policy p_container_loan_tenant on container_loan
  for all
  using (exists (select 1 from customer pp where pp.id = customer_id))
  with check (exists (select 1 from customer pp where pp.id = customer_id));

-- cost_layer.product_id → product.id
alter table cost_layer enable row level security;
alter table cost_layer force row level security;
create policy p_cost_layer_tenant on cost_layer
  for all
  using (exists (select 1 from product pp where pp.id = product_id))
  with check (exists (select 1 from product pp where pp.id = product_id));

-- credit_note_line.credit_note_id → credit_note.id
alter table credit_note_line enable row level security;
alter table credit_note_line force row level security;
create policy p_credit_note_line_tenant on credit_note_line
  for all
  using (exists (select 1 from credit_note pp where pp.id = credit_note_id))
  with check (exists (select 1 from credit_note pp where pp.id = credit_note_id));

-- customer_credit.customer_id → customer.id
alter table customer_credit enable row level security;
alter table customer_credit force row level security;
create policy p_customer_credit_tenant on customer_credit
  for all
  using (exists (select 1 from customer pp where pp.id = customer_id))
  with check (exists (select 1 from customer pp where pp.id = customer_id));

-- customer_price.product_id → product.id
alter table customer_price enable row level security;
alter table customer_price force row level security;
create policy p_customer_price_tenant on customer_price
  for all
  using (exists (select 1 from product pp where pp.id = product_id))
  with check (exists (select 1 from product pp where pp.id = product_id));

-- customer_request_line.customer_request_id → customer_request.id
alter table customer_request_line enable row level security;
alter table customer_request_line force row level security;
create policy p_customer_request_line_tenant on customer_request_line
  for all
  using (exists (select 1 from customer_request pp where pp.id = customer_request_id))
  with check (exists (select 1 from customer_request pp where pp.id = customer_request_id));

-- delivery_line.delivery_id → delivery.id
alter table delivery_line enable row level security;
alter table delivery_line force row level security;
create policy p_delivery_line_tenant on delivery_line
  for all
  using (exists (select 1 from delivery pp where pp.id = delivery_id))
  with check (exists (select 1 from delivery pp where pp.id = delivery_id));

-- field_session.staff_id → staff.id
alter table field_session enable row level security;
alter table field_session force row level security;
create policy p_field_session_tenant on field_session
  for all
  using (exists (select 1 from staff pp where pp.id = staff_id))
  with check (exists (select 1 from staff pp where pp.id = staff_id));

-- geofence_event.session_id → field_session.id
alter table geofence_event enable row level security;
alter table geofence_event force row level security;
create policy p_geofence_event_tenant on geofence_event
  for all
  using (exists (select 1 from field_session pp where pp.id = session_id))
  with check (exists (select 1 from field_session pp where pp.id = session_id));

-- gl_dimension_value.dimension_id → gl_dimension.id
alter table gl_dimension_value enable row level security;
alter table gl_dimension_value force row level security;
create policy p_gl_dimension_value_tenant on gl_dimension_value
  for all
  using (exists (select 1 from gl_dimension pp where pp.id = dimension_id))
  with check (exists (select 1 from gl_dimension pp where pp.id = dimension_id));

-- goods_receipt_line.goods_receipt_id → goods_receipt.id
alter table goods_receipt_line enable row level security;
alter table goods_receipt_line force row level security;
create policy p_goods_receipt_line_tenant on goods_receipt_line
  for all
  using (exists (select 1 from goods_receipt pp where pp.id = goods_receipt_id))
  with check (exists (select 1 from goods_receipt pp where pp.id = goods_receipt_id));

-- invoice_line.invoice_id → invoice.id
alter table invoice_line enable row level security;
alter table invoice_line force row level security;
create policy p_invoice_line_tenant on invoice_line
  for all
  using (exists (select 1 from invoice pp where pp.id = invoice_id))
  with check (exists (select 1 from invoice pp where pp.id = invoice_id));

-- invoice_match.supplier_invoice_id → supplier_invoice.id
alter table invoice_match enable row level security;
alter table invoice_match force row level security;
create policy p_invoice_match_tenant on invoice_match
  for all
  using (exists (select 1 from supplier_invoice pp where pp.id = supplier_invoice_id))
  with check (exists (select 1 from supplier_invoice pp where pp.id = supplier_invoice_id));

-- journal_line.entry_id → journal_entry.id
alter table journal_line enable row level security;
alter table journal_line force row level security;
create policy p_journal_line_tenant on journal_line
  for all
  using (exists (select 1 from journal_entry pp where pp.id = entry_id))
  with check (exists (select 1 from journal_entry pp where pp.id = entry_id));

-- moadian_submission.invoice_id → invoice.id
alter table moadian_submission enable row level security;
alter table moadian_submission force row level security;
create policy p_moadian_submission_tenant on moadian_submission
  for all
  using (exists (select 1 from invoice pp where pp.id = invoice_id))
  with check (exists (select 1 from invoice pp where pp.id = invoice_id));

-- number_counter.series_id → document_series.id
alter table number_counter enable row level security;
alter table number_counter force row level security;
create policy p_number_counter_tenant on number_counter
  for all
  using (exists (select 1 from document_series pp where pp.id = series_id))
  with check (exists (select 1 from document_series pp where pp.id = series_id));

-- payment_allocation.payment_voucher_id → payment_voucher.id
alter table payment_allocation enable row level security;
alter table payment_allocation force row level security;
create policy p_payment_allocation_tenant on payment_allocation
  for all
  using (exists (select 1 from payment_voucher pp where pp.id = payment_voucher_id))
  with check (exists (select 1 from payment_voucher pp where pp.id = payment_voucher_id));

-- person_address.person_id → person.id
alter table person_address enable row level security;
alter table person_address force row level security;
create policy p_person_address_tenant on person_address
  for all
  using (exists (select 1 from person pp where pp.id = person_id))
  with check (exists (select 1 from person pp where pp.id = person_id));

-- person_phone.person_id → person.id
alter table person_phone enable row level security;
alter table person_phone force row level security;
create policy p_person_phone_tenant on person_phone
  for all
  using (exists (select 1 from person pp where pp.id = person_id))
  with check (exists (select 1 from person pp where pp.id = person_id));

-- petty_cash_line.petty_cash_id → petty_cash.id
alter table petty_cash_line enable row level security;
alter table petty_cash_line force row level security;
create policy p_petty_cash_line_tenant on petty_cash_line
  for all
  using (exists (select 1 from petty_cash pp where pp.id = petty_cash_id))
  with check (exists (select 1 from petty_cash pp where pp.id = petty_cash_id));

-- pod.delivery_id → delivery.id
alter table pod enable row level security;
alter table pod force row level security;
create policy p_pod_tenant on pod
  for all
  using (exists (select 1 from delivery pp where pp.id = delivery_id))
  with check (exists (select 1 from delivery pp where pp.id = delivery_id));

-- price_list_item.price_list_id → price_list.id
alter table price_list_item enable row level security;
alter table price_list_item force row level security;
create policy p_price_list_item_tenant on price_list_item
  for all
  using (exists (select 1 from price_list pp where pp.id = price_list_id))
  with check (exists (select 1 from price_list pp where pp.id = price_list_id));

-- product_cost.product_id → product.id
alter table product_cost enable row level security;
alter table product_cost force row level security;
create policy p_product_cost_tenant on product_cost
  for all
  using (exists (select 1 from product pp where pp.id = product_id))
  with check (exists (select 1 from product pp where pp.id = product_id));

-- product_packaging.product_id → product.id
alter table product_packaging enable row level security;
alter table product_packaging force row level security;
create policy p_product_packaging_tenant on product_packaging
  for all
  using (exists (select 1 from product pp where pp.id = product_id))
  with check (exists (select 1 from product pp where pp.id = product_id));

-- purchase_order_line.purchase_order_id → purchase_order.id
alter table purchase_order_line enable row level security;
alter table purchase_order_line force row level security;
create policy p_purchase_order_line_tenant on purchase_order_line
  for all
  using (exists (select 1 from purchase_order pp where pp.id = purchase_order_id))
  with check (exists (select 1 from purchase_order pp where pp.id = purchase_order_id));

-- purchase_request_line.purchase_request_id → purchase_request.id
alter table purchase_request_line enable row level security;
alter table purchase_request_line force row level security;
create policy p_purchase_request_line_tenant on purchase_request_line
  for all
  using (exists (select 1 from purchase_request pp where pp.id = purchase_request_id))
  with check (exists (select 1 from purchase_request pp where pp.id = purchase_request_id));

-- receipt_allocation.receipt_id → payment_receipt.id
alter table receipt_allocation enable row level security;
alter table receipt_allocation force row level security;
create policy p_receipt_allocation_tenant on receipt_allocation
  for all
  using (exists (select 1 from payment_receipt pp where pp.id = receipt_id))
  with check (exists (select 1 from payment_receipt pp where pp.id = receipt_id));

-- region.area_id → sales_area.id
alter table region enable row level security;
alter table region force row level security;
create policy p_region_tenant on region
  for all
  using (exists (select 1 from sales_area pp where pp.id = area_id))
  with check (exists (select 1 from sales_area pp where pp.id = area_id));

-- reorder_policy.warehouse_id → warehouse.id
alter table reorder_policy enable row level security;
alter table reorder_policy force row level security;
create policy p_reorder_policy_tenant on reorder_policy
  for all
  using (exists (select 1 from warehouse pp where pp.id = warehouse_id))
  with check (exists (select 1 from warehouse pp where pp.id = warehouse_id));

-- return_request_line.return_request_id → return_request.id
alter table return_request_line enable row level security;
alter table return_request_line force row level security;
create policy p_return_request_line_tenant on return_request_line
  for all
  using (exists (select 1 from return_request pp where pp.id = return_request_id))
  with check (exists (select 1 from return_request pp where pp.id = return_request_id));

-- route.area_id → sales_area.id
alter table route enable row level security;
alter table route force row level security;
create policy p_route_tenant on route
  for all
  using (exists (select 1 from sales_area pp where pp.id = area_id))
  with check (exists (select 1 from sales_area pp where pp.id = area_id));

-- route_plan.tour_id → tour.id
alter table route_plan enable row level security;
alter table route_plan force row level security;
create policy p_route_plan_tenant on route_plan
  for all
  using (exists (select 1 from tour pp where pp.id = tour_id))
  with check (exists (select 1 from tour pp where pp.id = tour_id));

-- route_plan_stop.customer_id → customer.id
alter table route_plan_stop enable row level security;
alter table route_plan_stop force row level security;
create policy p_route_plan_stop_tenant on route_plan_stop
  for all
  using (exists (select 1 from customer pp where pp.id = customer_id))
  with check (exists (select 1 from customer pp where pp.id = customer_id));

-- route_salesperson.salesperson_id → staff.id
alter table route_salesperson enable row level security;
alter table route_salesperson force row level security;
create policy p_route_salesperson_tenant on route_salesperson
  for all
  using (exists (select 1 from staff pp where pp.id = salesperson_id))
  with check (exists (select 1 from staff pp where pp.id = salesperson_id));

-- rule_action.rule_id → rule.id
alter table rule_action enable row level security;
alter table rule_action force row level security;
create policy p_rule_action_tenant on rule_action
  for all
  using (exists (select 1 from rule pp where pp.id = rule_id))
  with check (exists (select 1 from rule pp where pp.id = rule_id));

-- rule_condition.rule_id → rule.id
alter table rule_condition enable row level security;
alter table rule_condition force row level security;
create policy p_rule_condition_tenant on rule_condition
  for all
  using (exists (select 1 from rule pp where pp.id = rule_id))
  with check (exists (select 1 from rule pp where pp.id = rule_id));

-- rule_scope.rule_id → rule.id
alter table rule_scope enable row level security;
alter table rule_scope force row level security;
create policy p_rule_scope_tenant on rule_scope
  for all
  using (exists (select 1 from rule pp where pp.id = rule_id))
  with check (exists (select 1 from rule pp where pp.id = rule_id));

-- sales_order_line.sales_order_id → sales_order.id
alter table sales_order_line enable row level security;
alter table sales_order_line force row level security;
create policy p_sales_order_line_tenant on sales_order_line
  for all
  using (exists (select 1 from sales_order pp where pp.id = sales_order_id))
  with check (exists (select 1 from sales_order pp where pp.id = sales_order_id));

-- staff_area.staff_id → staff.id
alter table staff_area enable row level security;
alter table staff_area force row level security;
create policy p_staff_area_tenant on staff_area
  for all
  using (exists (select 1 from staff pp where pp.id = staff_id))
  with check (exists (select 1 from staff pp where pp.id = staff_id));

-- standard_cost_history.product_id → product.id
alter table standard_cost_history enable row level security;
alter table standard_cost_history force row level security;
create policy p_standard_cost_history_tenant on standard_cost_history
  for all
  using (exists (select 1 from product pp where pp.id = product_id))
  with check (exists (select 1 from product pp where pp.id = product_id));

-- stock_adjustment_line.stock_adjustment_id → stock_adjustment.id
alter table stock_adjustment_line enable row level security;
alter table stock_adjustment_line force row level security;
create policy p_stock_adjustment_line_tenant on stock_adjustment_line
  for all
  using (exists (select 1 from stock_adjustment pp where pp.id = stock_adjustment_id))
  with check (exists (select 1 from stock_adjustment pp where pp.id = stock_adjustment_id));

-- stock_balance.warehouse_id → warehouse.id
alter table stock_balance enable row level security;
alter table stock_balance force row level security;
create policy p_stock_balance_tenant on stock_balance
  for all
  using (exists (select 1 from warehouse pp where pp.id = warehouse_id))
  with check (exists (select 1 from warehouse pp where pp.id = warehouse_id));

-- stock_count_line.stock_count_id → stock_count.id
alter table stock_count_line enable row level security;
alter table stock_count_line force row level security;
create policy p_stock_count_line_tenant on stock_count_line
  for all
  using (exists (select 1 from stock_count pp where pp.id = stock_count_id))
  with check (exists (select 1 from stock_count pp where pp.id = stock_count_id));

-- stock_reservation.warehouse_id → warehouse.id
alter table stock_reservation enable row level security;
alter table stock_reservation force row level security;
create policy p_stock_reservation_tenant on stock_reservation
  for all
  using (exists (select 1 from warehouse pp where pp.id = warehouse_id))
  with check (exists (select 1 from warehouse pp where pp.id = warehouse_id));

-- stock_transfer_line.stock_transfer_id → stock_transfer.id
alter table stock_transfer_line enable row level security;
alter table stock_transfer_line force row level security;
create policy p_stock_transfer_line_tenant on stock_transfer_line
  for all
  using (exists (select 1 from stock_transfer pp where pp.id = stock_transfer_id))
  with check (exists (select 1 from stock_transfer pp where pp.id = stock_transfer_id));

-- stock_valuation.warehouse_id → warehouse.id
alter table stock_valuation enable row level security;
alter table stock_valuation force row level security;
create policy p_stock_valuation_tenant on stock_valuation
  for all
  using (exists (select 1 from warehouse pp where pp.id = warehouse_id))
  with check (exists (select 1 from warehouse pp where pp.id = warehouse_id));

-- supplier_invoice_line.supplier_invoice_id → supplier_invoice.id
alter table supplier_invoice_line enable row level security;
alter table supplier_invoice_line force row level security;
create policy p_supplier_invoice_line_tenant on supplier_invoice_line
  for all
  using (exists (select 1 from supplier_invoice pp where pp.id = supplier_invoice_id))
  with check (exists (select 1 from supplier_invoice pp where pp.id = supplier_invoice_id));

-- tour_settlement.tour_id → tour.id
alter table tour_settlement enable row level security;
alter table tour_settlement force row level security;
create policy p_tour_settlement_tenant on tour_settlement
  for all
  using (exists (select 1 from tour pp where pp.id = tour_id))
  with check (exists (select 1 from tour pp where pp.id = tour_id));

-- tour_settlement_line.tour_settlement_id → tour_settlement.id
alter table tour_settlement_line enable row level security;
alter table tour_settlement_line force row level security;
create policy p_tour_settlement_line_tenant on tour_settlement_line
  for all
  using (exists (select 1 from tour_settlement pp where pp.id = tour_settlement_id))
  with check (exists (select 1 from tour_settlement pp where pp.id = tour_settlement_id));

-- tour_stop.tour_id → tour.id
alter table tour_stop enable row level security;
alter table tour_stop force row level security;
create policy p_tour_stop_tenant on tour_stop
  for all
  using (exists (select 1 from tour pp where pp.id = tour_id))
  with check (exists (select 1 from tour pp where pp.id = tour_id));

-- value_document_line.value_document_id → value_document.id
alter table value_document_line enable row level security;
alter table value_document_line force row level security;
create policy p_value_document_line_tenant on value_document_line
  for all
  using (exists (select 1 from value_document pp where pp.id = value_document_id))
  with check (exists (select 1 from value_document pp where pp.id = value_document_id));

-- vehicle_load_line.vehicle_load_id → vehicle_load.id
alter table vehicle_load_line enable row level security;
alter table vehicle_load_line force row level security;
create policy p_vehicle_load_line_tenant on vehicle_load_line
  for all
  using (exists (select 1 from vehicle_load pp where pp.id = vehicle_load_id))
  with check (exists (select 1 from vehicle_load pp where pp.id = vehicle_load_id));

-- visit.tour_id → tour.id
alter table visit enable row level security;
alter table visit force row level security;
create policy p_visit_tenant on visit
  for all
  using (exists (select 1 from tour pp where pp.id = tour_id))
  with check (exists (select 1 from tour pp where pp.id = tour_id));

-- waybill_line.waybill_id → waybill.id
alter table waybill_line enable row level security;
alter table waybill_line force row level security;
create policy p_waybill_line_tenant on waybill_line
  for all
  using (exists (select 1 from waybill pp where pp.id = waybill_id))
  with check (exists (select 1 from waybill pp where pp.id = waybill_id));

-- webhook_delivery.endpoint_id → webhook_endpoint.id
alter table webhook_delivery enable row level security;
alter table webhook_delivery force row level security;
create policy p_webhook_delivery_tenant on webhook_delivery
  for all
  using (exists (select 1 from webhook_endpoint pp where pp.id = endpoint_id))
  with check (exists (select 1 from webhook_endpoint pp where pp.id = endpoint_id));

-- =====================================================================
-- §2  سه جدولِ پارتیشن‌شده (در 0041 عمداً بیرون گذاشته شدند)
--     audit_log(at) · inventory_txn(occurred_at) · location_sample(recorded_at)
-- =====================================================================
-- audit_log.company_id nullable است: سطرِ NULL یعنی رویدادِ سطحِ سامانه (پیش از زمینهٔ اجاره،
-- مثلِ تلاشِ ورود) نه دادهٔ اجارهٔ دیگر ⇒ خواندن/نوشتنِ NULL مجاز است، ولی نوشتنِ company_idِ
-- اجارهٔ دیگر یا خواندنِ سطرِ اجارهٔ دیگر ممکن نیست (همان قاعدهٔ «NULL=سراسری» در setting).
alter table audit_log enable row level security;
alter table audit_log force row level security;
create policy p_audit_log_tenant on audit_log
  for all
  using (company_id is null or company_id = fn_current_company_id())
  with check (company_id is null or company_id = fn_current_company_id());

-- inventory_txn.branch_id NOT NULL → branch.company_id (همان الگویِ invoice در 0041).
alter table inventory_txn enable row level security;
alter table inventory_txn force row level security;
create policy p_inventory_txn_tenant on inventory_txn
  for all
  using (branch_id in (select id from branch where branch.company_id = fn_current_company_id()))
  with check (branch_id in (select id from branch where branch.company_id = fn_current_company_id()));

-- location_sample.staff_id NOT NULL → staff (کلیدِ خارجیِ اعلام‌نشده ولی معنایی؛ همان ستونی که
-- field_session.staff_id به staff.id ارجاع می‌دهد). staff در 0041 RLS دارد ⇒ گذرا اجاره‌محور.
alter table location_sample enable row level security;
alter table location_sample force row level security;
create policy p_location_sample_tenant on location_sample
  for all
  using (exists (select 1 from staff s where s.id = staff_id))
  with check (exists (select 1 from staff s where s.id = staff_id));

-- =====================================================================
-- §3  پارتیشن‌هایِ «موجود»: RLS والد به‌تنهایی کافی نیست
-- =====================================================================
-- خطرِ واقعی: در PostgreSQL سیاست‌هایِ جدولِ پارتیشن‌شده فقط وقتی از راهِ والد پرس‌وجو شود
-- اعمال می‌شوند؛ دسترسیِ مستقیم به یک پارتیشن (select * from audit_log_2026_11) سیاستِ والد
-- را دور می‌زند، مگر اینکه روی خودِ پارتیشن هم RLS فعال و همان سیاست تعریف شده باشد.
do $retro$
declare
  r record; v_using text; v_check text;
begin
  for r in
    select c.relname as part, p.relname as parent
      from pg_inherits i
      join pg_class c on c.oid = i.inhrelid
      join pg_class p on p.oid = i.inhparent
     where p.relname in ('audit_log','inventory_txn','location_sample')
  loop
    v_using := case r.parent
                 when 'audit_log'       then 'company_id is null or company_id = fn_current_company_id()'
                 when 'inventory_txn'   then 'branch_id in (select id from branch where branch.company_id = fn_current_company_id())'
                 when 'location_sample' then 'exists (select 1 from staff s where s.id = staff_id)'
               end;
    if v_using is null then continue; end if;
    -- عبارت‌ها عمداً «بدونِ پیشوندِ نامِ والد» هستند تا رویِ پارتیشنی با نامِ متفاوت هم درست
    -- بسته شوند (pg_get_expr ارجاعِ بیرونی را با نامِ والد واجدِ شرایط می‌کرد و رویِ پارتیشن
    -- خطایِ missing FROM-clause entry می‌داد).
    v_check := v_using;
    execute format('alter table %I enable row level security', r.part);
    execute format('alter table %I force row level security', r.part);
    execute format('drop policy if exists p_%s_tenant on %I', r.parent, r.part);
    execute format('create policy p_%s_tenant on %I for all using (%s) with check (%s)',
                   r.parent, r.part, v_using, v_check);
  end loop;
end $retro$;

-- =====================================================================
-- §4  پارتیشن‌هایِ «آینده»: خودِ سازنده باید آنها را سخت کند
-- =====================================================================
-- fn_ensure_partitions در 0019 فقط create table می‌کرد ⇒ هر پارتیشنِ جدیدِ ماهانه یک
-- دریچهٔ بازِ دورزدنِ جداسازیِ اجاره بود. نسخهٔ زیر همان منطقِ بازهٔ زمانی را نگه می‌دارد و
-- برایِ هر پارتیشنِ تازه RLS + همان سیاستِ والد را اعمال می‌کند (بدونِ تغییرِ امضا).
create or replace function fn_ensure_partitions(p_months_ahead integer default 2)
returns void
language plpgsql as $$
declare
  v_tbl   text;
  v_lower date;
  v_upper date;
  v_name  text;
  v_months integer;
  v_using text;
  v_check text;
begin
  for v_tbl in
       select unnest(array['location_sample', 'audit_log', 'inventory_txn'])
  loop
    v_months := -1;                      -- ماه جاری
    while v_months <= p_months_ahead loop
      v_lower := (date_trunc('month', current_date) + make_interval(months => v_months))::date;
      v_upper := (v_lower + interval '1 month')::date;
      v_name  := v_tbl || '_' || to_char(v_lower, 'YYYY_MM');
      if not exists (
        select 1
          from pg_inherits i
          join pg_class c on c.oid = i.inhrelid
         where i.inhparent = v_tbl::regclass
           and c.relname = v_name
      ) then
        execute format('create table %I partition of %I for values from (%L) to (%L)',
                       v_name, v_tbl, v_lower, v_upper);
        -- سخت‌سازیِ اجاره‌ایِ همان پارتیشنِ تازه (0042): بدونِ این، دسترسیِ مستقیم به
        -- پارتیشن سیاستِ والد را دور می‌زد.
        v_using := case v_tbl
                     when 'audit_log'       then 'company_id is null or company_id = fn_current_company_id()'
                     when 'inventory_txn'   then 'branch_id in (select id from branch where branch.company_id = fn_current_company_id())'
                     when 'location_sample' then 'exists (select 1 from staff s where s.id = staff_id)'
                   end;
        v_check := v_using;
        if v_using is not null then
          execute format('alter table %I enable row level security', v_name);
          execute format('alter table %I force row level security', v_name);
          execute format('drop policy if exists p_%s_tenant on %I', v_tbl, v_name);
          execute format('create policy p_%s_tenant on %I for all using (%s) with check (%s)',
                         v_tbl, v_name, v_using, v_check);
        end if;
      end if;
      v_months := v_months + 1;
    end loop;
  end loop;
end $$;

comment on function fn_ensure_partitions(integer) is
  'ساختِ پارتیشنِ ماهانهٔ سه جدولِ پرحجم + فعال‌سازیِ RLS و سیاستِ اجارهٔ والد رویِ هر پارتیشنِ تازه (0042)';

commit;
