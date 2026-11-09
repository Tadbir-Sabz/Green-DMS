-- Non-staff principals have no staff user scope. Empty/missing identity must
-- evaluate false, not throw an invalid-UUID error. Existing scope semantics,
-- tenant policies and grants are unchanged.
alter policy p_invoice_scope on invoice using (
 exists (select 1 from user_scope us
   where us.app_user_id = nullif(current_setting('app.user_id', true), '')::uuid
     and us.scope_type = 'branch' and us.scope_id = invoice.branch_id)
);
