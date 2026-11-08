-- بازگردانیِ مهاجرت 0053 — TASK-24Y
--
-- ایمن برای داده: این مهاجرت فقط ساختارهای تازه را برمی‌دارد و ستون‌های افزوده را
-- حذف می‌کند. **هیچ ردیفِ approval_request یا approval_decision حذف نمی‌شود** —
-- تاریخچهٔ تأیید حتی پس از rollback باقی می‌ماند.
--
-- هشدار: اگر پس از این مهاجرت سیاستِ تأیید یا تفکیل ثبت شده باشد، با rollback از
-- دست می‌رود. اجرای down باید با تصمیمِ صریحِ مالک و در پنجرهٔ نگهداشت انجام شود.

begin;

-- §6
drop table if exists approval_binding;

-- §5 — تریگرهای تغییرناپذیری
drop trigger if exists approval_decision_no_update on approval_decision;
drop trigger if exists approval_decision_no_delete on approval_decision;
drop function if exists approval_decision_immutable();

-- §4
drop table if exists approval_notification;

-- §3
drop table if exists approval_delegation;

-- §2 — ستون‌های افزوده
drop index if exists ix_approval_request_expiring;
alter table approval_request
  drop column if exists expires_at,
  drop column if exists escalated_at,
  drop column if exists escalation_of,
  drop column if exists entity_domain_id,
  drop column if exists risk_score,
  drop column if exists policy_id;

-- §7 — ستونِ سازندهٔ سفارش
-- توجه: این ستون دادهٔ ارزشمند (هویتِ سازنده) دارد. در rollback حذف می‌شود چون
-- بخشی از همین مهاجرت است؛ پیش از rollback باید آرشیو شود.
alter table sales_order drop column if exists created_by;
alter table purchase_order drop column if exists created_by;

-- §1
drop table if exists approval_policy;

commit;
