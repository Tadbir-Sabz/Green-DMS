drop index if exists idx_stock_wh_prod;
drop index if exists idx_cust_route_status;
drop index if exists idx_inv_branch_date_status;
drop index if exists idx_so_branch_date_status;
drop materialized view if exists mv_salesperson_performance;
drop materialized view if exists mv_ar_aging;
drop materialized view if exists mv_daily_sales;
drop table if exists location_sample_2026_12;
drop table if exists location_sample_2026_11;
