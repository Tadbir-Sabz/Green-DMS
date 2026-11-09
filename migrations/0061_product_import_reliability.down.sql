-- TASK-PM-01D-M2 — explicit rollback of the additive import reliability objects.
drop policy if exists p_product_import_batch_tenant on product_import_batch;
drop table if exists product_import_batch;

alter table product_import
  drop constraint if exists uq_product_import_company_id,
  drop column if exists status,
  drop column if exists failure_category,
  drop column if exists retryable,
  drop column if exists transaction_outcome,
  drop column if exists last_batch_no,
  drop column if exists completed_at,
  drop column if exists updated_at,
  drop column if exists attempts;
