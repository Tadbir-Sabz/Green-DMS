-- مهاجرت 0021 — امنیت سطح سطر (اختیاری، پس از آماده‌سازی لایه نشست)
-- منبع: dms-design-report.md › ضمیمه G › G.۱۶.۳
-- فاز توسعه: ۶ | ماژول/بخش: امنیت سطح سطر (اختیاری، پس از آماده‌سازی لایه نشست)

alter table invoice enable row level security;

create policy p_invoice_tenant on invoice
  using (branch_id in (select id from branch
                        where company_id = current_setting('app.company_id')::uuid));

create policy p_invoice_scope on invoice
  using (exists (select 1 from user_scope us
                  where us.app_user_id = current_setting('app.user_id')::uuid
                    and us.scope_type = 'branch' and us.scope_id = invoice.branch_id));
