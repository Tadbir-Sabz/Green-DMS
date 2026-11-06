-- بازگردانیِ 0042: حذفِ سیاست‌هایِ زنجیرهٔ والد، خاموش‌کردنِ RLS رویِ جداولِ فرزند و
-- پارتیشن‌ها، و بازگرداندنِ fn_ensure_partitions به نسخهٔ اصلیِ 0019 (بدونِ سخت‌سازیِ پارتیشن).
-- ترتیب: اول پارتیشن‌ها، بعد والدِ پارتیشن‌شده، بعد فرزند‌ها، و در آخر تابع.
begin;
do $undo$
declare r record;
begin
  for r in
    select c.relname as part, p.relname as parent
      from pg_inherits i
      join pg_class c on c.oid = i.inhrelid
      join pg_class p on p.oid = i.inhparent
     where p.relname in ('audit_log','inventory_txn','location_sample')
  loop
    execute format('drop policy if exists p_%s_tenant on %I', r.parent, r.part);
    execute format('alter table %I no force row level security', r.part);
    execute format('alter table %I disable row level security', r.part);
  end loop;
end $undo$;
drop policy if exists p_audit_log_tenant on audit_log;
alter table audit_log no force row level security;
alter table audit_log disable row level security;
drop policy if exists p_inventory_txn_tenant on inventory_txn;
alter table inventory_txn no force row level security;
alter table inventory_txn disable row level security;
drop policy if exists p_location_sample_tenant on location_sample;
alter table location_sample no force row level security;
alter table location_sample disable row level security;

drop policy if exists p_approval_decision_tenant on approval_decision;
alter table approval_decision no force row level security;
alter table approval_decision disable row level security;
drop policy if exists p_approval_request_tenant on approval_request;
alter table approval_request no force row level security;
alter table approval_request disable row level security;
drop policy if exists p_approval_step_def_tenant on approval_step_def;
alter table approval_step_def no force row level security;
alter table approval_step_def disable row level security;
drop policy if exists p_bank_statement_tenant on bank_statement;
alter table bank_statement no force row level security;
alter table bank_statement disable row level security;
drop policy if exists p_bank_statement_line_tenant on bank_statement_line;
alter table bank_statement_line no force row level security;
alter table bank_statement_line disable row level security;
drop policy if exists p_batch_tenant on batch;
alter table batch no force row level security;
alter table batch disable row level security;
drop policy if exists p_cash_session_tenant on cash_session;
alter table cash_session no force row level security;
alter table cash_session disable row level security;
drop policy if exists p_cash_txn_tenant on cash_txn;
alter table cash_txn no force row level security;
alter table cash_txn disable row level security;
drop policy if exists p_cheque_event_tenant on cheque_event;
alter table cheque_event no force row level security;
alter table cheque_event disable row level security;
drop policy if exists p_cogs_entry_tenant on cogs_entry;
alter table cogs_entry no force row level security;
alter table cogs_entry disable row level security;
drop policy if exists p_collection_action_tenant on collection_action;
alter table collection_action no force row level security;
alter table collection_action disable row level security;
drop policy if exists p_commission_line_tenant on commission_line;
alter table commission_line no force row level security;
alter table commission_line disable row level security;
drop policy if exists p_commission_tier_tenant on commission_tier;
alter table commission_tier no force row level security;
alter table commission_tier disable row level security;
drop policy if exists p_container_loan_tenant on container_loan;
alter table container_loan no force row level security;
alter table container_loan disable row level security;
drop policy if exists p_cost_layer_tenant on cost_layer;
alter table cost_layer no force row level security;
alter table cost_layer disable row level security;
drop policy if exists p_credit_note_line_tenant on credit_note_line;
alter table credit_note_line no force row level security;
alter table credit_note_line disable row level security;
drop policy if exists p_customer_credit_tenant on customer_credit;
alter table customer_credit no force row level security;
alter table customer_credit disable row level security;
drop policy if exists p_customer_price_tenant on customer_price;
alter table customer_price no force row level security;
alter table customer_price disable row level security;
drop policy if exists p_customer_request_line_tenant on customer_request_line;
alter table customer_request_line no force row level security;
alter table customer_request_line disable row level security;
drop policy if exists p_delivery_line_tenant on delivery_line;
alter table delivery_line no force row level security;
alter table delivery_line disable row level security;
drop policy if exists p_field_session_tenant on field_session;
alter table field_session no force row level security;
alter table field_session disable row level security;
drop policy if exists p_geofence_event_tenant on geofence_event;
alter table geofence_event no force row level security;
alter table geofence_event disable row level security;
drop policy if exists p_gl_dimension_value_tenant on gl_dimension_value;
alter table gl_dimension_value no force row level security;
alter table gl_dimension_value disable row level security;
drop policy if exists p_goods_receipt_line_tenant on goods_receipt_line;
alter table goods_receipt_line no force row level security;
alter table goods_receipt_line disable row level security;
drop policy if exists p_invoice_line_tenant on invoice_line;
alter table invoice_line no force row level security;
alter table invoice_line disable row level security;
drop policy if exists p_invoice_match_tenant on invoice_match;
alter table invoice_match no force row level security;
alter table invoice_match disable row level security;
drop policy if exists p_journal_line_tenant on journal_line;
alter table journal_line no force row level security;
alter table journal_line disable row level security;
drop policy if exists p_moadian_submission_tenant on moadian_submission;
alter table moadian_submission no force row level security;
alter table moadian_submission disable row level security;
drop policy if exists p_number_counter_tenant on number_counter;
alter table number_counter no force row level security;
alter table number_counter disable row level security;
drop policy if exists p_payment_allocation_tenant on payment_allocation;
alter table payment_allocation no force row level security;
alter table payment_allocation disable row level security;
drop policy if exists p_person_address_tenant on person_address;
alter table person_address no force row level security;
alter table person_address disable row level security;
drop policy if exists p_person_phone_tenant on person_phone;
alter table person_phone no force row level security;
alter table person_phone disable row level security;
drop policy if exists p_petty_cash_line_tenant on petty_cash_line;
alter table petty_cash_line no force row level security;
alter table petty_cash_line disable row level security;
drop policy if exists p_pod_tenant on pod;
alter table pod no force row level security;
alter table pod disable row level security;
drop policy if exists p_price_list_item_tenant on price_list_item;
alter table price_list_item no force row level security;
alter table price_list_item disable row level security;
drop policy if exists p_product_cost_tenant on product_cost;
alter table product_cost no force row level security;
alter table product_cost disable row level security;
drop policy if exists p_product_packaging_tenant on product_packaging;
alter table product_packaging no force row level security;
alter table product_packaging disable row level security;
drop policy if exists p_purchase_order_line_tenant on purchase_order_line;
alter table purchase_order_line no force row level security;
alter table purchase_order_line disable row level security;
drop policy if exists p_purchase_request_line_tenant on purchase_request_line;
alter table purchase_request_line no force row level security;
alter table purchase_request_line disable row level security;
drop policy if exists p_receipt_allocation_tenant on receipt_allocation;
alter table receipt_allocation no force row level security;
alter table receipt_allocation disable row level security;
drop policy if exists p_region_tenant on region;
alter table region no force row level security;
alter table region disable row level security;
drop policy if exists p_reorder_policy_tenant on reorder_policy;
alter table reorder_policy no force row level security;
alter table reorder_policy disable row level security;
drop policy if exists p_return_request_line_tenant on return_request_line;
alter table return_request_line no force row level security;
alter table return_request_line disable row level security;
drop policy if exists p_route_tenant on route;
alter table route no force row level security;
alter table route disable row level security;
drop policy if exists p_route_plan_tenant on route_plan;
alter table route_plan no force row level security;
alter table route_plan disable row level security;
drop policy if exists p_route_plan_stop_tenant on route_plan_stop;
alter table route_plan_stop no force row level security;
alter table route_plan_stop disable row level security;
drop policy if exists p_route_salesperson_tenant on route_salesperson;
alter table route_salesperson no force row level security;
alter table route_salesperson disable row level security;
drop policy if exists p_rule_action_tenant on rule_action;
alter table rule_action no force row level security;
alter table rule_action disable row level security;
drop policy if exists p_rule_condition_tenant on rule_condition;
alter table rule_condition no force row level security;
alter table rule_condition disable row level security;
drop policy if exists p_rule_scope_tenant on rule_scope;
alter table rule_scope no force row level security;
alter table rule_scope disable row level security;
drop policy if exists p_sales_order_line_tenant on sales_order_line;
alter table sales_order_line no force row level security;
alter table sales_order_line disable row level security;
drop policy if exists p_staff_area_tenant on staff_area;
alter table staff_area no force row level security;
alter table staff_area disable row level security;
drop policy if exists p_standard_cost_history_tenant on standard_cost_history;
alter table standard_cost_history no force row level security;
alter table standard_cost_history disable row level security;
drop policy if exists p_stock_adjustment_line_tenant on stock_adjustment_line;
alter table stock_adjustment_line no force row level security;
alter table stock_adjustment_line disable row level security;
drop policy if exists p_stock_balance_tenant on stock_balance;
alter table stock_balance no force row level security;
alter table stock_balance disable row level security;
drop policy if exists p_stock_count_line_tenant on stock_count_line;
alter table stock_count_line no force row level security;
alter table stock_count_line disable row level security;
drop policy if exists p_stock_reservation_tenant on stock_reservation;
alter table stock_reservation no force row level security;
alter table stock_reservation disable row level security;
drop policy if exists p_stock_transfer_line_tenant on stock_transfer_line;
alter table stock_transfer_line no force row level security;
alter table stock_transfer_line disable row level security;
drop policy if exists p_stock_valuation_tenant on stock_valuation;
alter table stock_valuation no force row level security;
alter table stock_valuation disable row level security;
drop policy if exists p_supplier_invoice_line_tenant on supplier_invoice_line;
alter table supplier_invoice_line no force row level security;
alter table supplier_invoice_line disable row level security;
drop policy if exists p_tour_settlement_tenant on tour_settlement;
alter table tour_settlement no force row level security;
alter table tour_settlement disable row level security;
drop policy if exists p_tour_settlement_line_tenant on tour_settlement_line;
alter table tour_settlement_line no force row level security;
alter table tour_settlement_line disable row level security;
drop policy if exists p_tour_stop_tenant on tour_stop;
alter table tour_stop no force row level security;
alter table tour_stop disable row level security;
drop policy if exists p_value_document_line_tenant on value_document_line;
alter table value_document_line no force row level security;
alter table value_document_line disable row level security;
drop policy if exists p_vehicle_load_line_tenant on vehicle_load_line;
alter table vehicle_load_line no force row level security;
alter table vehicle_load_line disable row level security;
drop policy if exists p_visit_tenant on visit;
alter table visit no force row level security;
alter table visit disable row level security;
drop policy if exists p_waybill_line_tenant on waybill_line;
alter table waybill_line no force row level security;
alter table waybill_line disable row level security;
drop policy if exists p_webhook_delivery_tenant on webhook_delivery;
alter table webhook_delivery no force row level security;
alter table webhook_delivery disable row level security;

-- fn_ensure_partitions دقیقاً به بدنهٔ 0019 بازمی‌گردد
create or replace function fn_ensure_partitions(p_months_ahead integer default 2)
returns void
language plpgsql as $$
declare
  v_tbl   text;
  v_lower date;
  v_upper date;
  v_name  text;
  v_months integer;
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
      end if;
      v_months := v_months + 1;
    end loop;
  end loop;
end $$;
comment on function fn_ensure_partitions(integer) is
  'ساختِ پارتیشنِ ماهانهٔ سه جدولِ پرحجم برایِ بازهٔ جاری تا p_months_ahead ماهِ آینده';
commit;
