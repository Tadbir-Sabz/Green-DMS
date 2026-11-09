begin;
-- Never discard historical supersession or collapse repeated entity bindings.
do $$ begin
 if exists (select 1 from approval_binding where superseded_at is not null) then
   raise exception 'Rollback refused: historical supersession data exists';
 end if;
end $$;
drop index uq_approval_binding_active;
alter table approval_binding add constraint uq_approval_binding_entity unique(operation, entity_type, entity_id);
alter table approval_binding drop column superseded_at;
create unique index uq_approval_binding_active on approval_binding
 (company_id, operation, entity_type, entity_id) where consumed_at is null;
commit;
