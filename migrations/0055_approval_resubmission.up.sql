-- Preserve every historical binding; supersession is not consumption.
begin;
alter table approval_binding add column superseded_at timestamptz;
alter table approval_binding drop constraint uq_approval_binding_entity;
drop index uq_approval_binding_active;
create unique index uq_approval_binding_active on approval_binding
 (company_id, operation, entity_type, entity_id)
 where consumed_at is null and superseded_at is null;
commit;
