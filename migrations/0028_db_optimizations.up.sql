-- ?????? 0028: ?????????? ?????? ????
-- ???????????? location_sample (?? ???? ????)
create index if not exists idx_so_branch_date_status on sales_order (branch_id, order_date, status);
create index if not exists idx_inv_branch_date_status on invoice (branch_id, invoice_date, status);
create index if not exists idx_cust_route_status on customer (route_id, status) where status = 'active';
create index if not exists idx_stock_wh_prod on stock_balance (warehouse_id, product_id);
