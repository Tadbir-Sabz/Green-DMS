-- TASK-PM-01D-M4 — explicit rollback of only the additive bulk-operation ledger.
-- Product rows, 0060 history, 0061 import evidence and 0041 grants remain intact.
drop policy if exists p_product_bulk_operation_tenant on product_bulk_operation;
drop table if exists product_bulk_operation;
