-- Restore the original expression; no data or grants are changed.
alter policy p_invoice_scope on invoice using (
 exists (select 1 from user_scope us
   where us.app_user_id = current_setting('app.user_id')::uuid
     and us.scope_type = 'branch' and us.scope_id = invoice.branch_id)
);
