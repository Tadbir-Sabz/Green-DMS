-- بازگردانیِ مهاجرت 0053 — TASK-24Y
--
-- TASK-24Z: populated approval structures cannot be destructively rolled back.
begin;

do $$
begin
  if exists (select 1 from approval_binding)
     or exists (select 1 from approval_policy)
     or exists (select 1 from approval_delegation)
     or exists (select 1 from approval_notification)
     or exists (select 1 from approval_request where policy_id is not null
       or expires_at is not null or escalated_at is not null
       or escalation_of is not null or entity_domain_id is not null or risk_score is not null)
  then
    raise exception 'TASK-24Z: rollback refused: protected approval data exists; retain schema or use a reviewed preservation migration';
  end if;
end $$;

-- Creator archive deliberately survives rollback and is restored on reapply.
do $$ begin
 if exists (select 1 from sales_order where created_by is not null)
    or exists (select 1 from purchase_order where created_by is not null) then
create table if not exists approval_sod_creator_archive (
  entity_table text not null check (entity_table in ('sales_order', 'purchase_order')),
  entity_id uuid not null,
  created_by uuid not null,
  primary key (entity_table, entity_id)
);
insert into approval_sod_creator_archive
  select 'sales_order', id, created_by from sales_order where created_by is not null
  on conflict (entity_table, entity_id) do update set created_by = excluded.created_by;
insert into approval_sod_creator_archive
  select 'purchase_order', id, created_by from purchase_order where created_by is not null
  on conflict (entity_table, entity_id) do update set created_by = excluded.created_by;

 end if;
end $$;

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
-- Creator identities have been preserved in the archive above.
alter table sales_order drop column if exists created_by;
alter table purchase_order drop column if exists created_by;

-- §1
drop table if exists approval_policy;

commit;
