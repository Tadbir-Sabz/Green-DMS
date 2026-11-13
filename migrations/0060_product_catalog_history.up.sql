-- Non-destructive family lifecycle; archived families retain their product references.
alter table product_family add column is_active boolean not null default true;
-- Atomic catalog evidence: changes and their history commit/rollback together.
-- No reconstruction of old history; no product/domain registry is fabricated.
create table product_catalog_history (
 id bigint generated always as identity primary key,
 company_id uuid not null references company(id),
 product_id uuid,
 entity_type text not null,
 entity_id uuid,
 action text not null check (action in ('INSERT','UPDATE','DELETE')),
 actor_user_id uuid,
 at timestamptz not null default clock_timestamp(),
 before_data jsonb,
 after_data jsonb
);
create index ix_product_catalog_history_lookup on product_catalog_history(company_id, product_id, id desc);
alter table product_catalog_history enable row level security;
alter table product_catalog_history force row level security;
create policy p_product_catalog_history on product_catalog_history for select
 using (company_id = fn_current_company_id());
create policy p_product_catalog_history_insert on product_catalog_history for insert
 with check (company_id = fn_current_company_id());
revoke all on product_catalog_history from public, dms_app;
grant select on product_catalog_history to dms_app;

create function fn_product_catalog_history() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare r jsonb; cid uuid; pid uuid;
begin
 r := case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
 if TG_OP = 'UPDATE' and to_jsonb(OLD) = to_jsonb(NEW) then return NEW; end if;
 if TG_TABLE_NAME = 'product' then pid := (r->>'id')::uuid;
 else pid := coalesce(r->>'product_id', r->>'bundle_product_id')::uuid; end if;
 cid := (r->>'company_id')::uuid;
 if cid is null and pid is not null then select company_id into cid from product where id = pid; end if;
 if cid is null and pid is not null then
   select company_id into cid from product_catalog_history where entity_type = 'product' and entity_id = pid order by id desc limit 1;
 end if;
 if cid is null and TG_TABLE_NAME = 'product_attribute_enum_value' then
   select company_id into cid from product_attribute_def where id = (r->>'def_id')::uuid;
   if cid is null then
     select company_id into cid from product_catalog_history where entity_type = 'product_attribute_def' and entity_id = (r->>'def_id')::uuid order by id desc limit 1;
   end if;
 end if;
 insert into product_catalog_history(company_id, product_id, entity_type, entity_id, action, actor_user_id, before_data, after_data)
 values(cid, pid, TG_TABLE_NAME, coalesce((r->>'id')::uuid,pid), TG_OP,
   nullif(current_setting('app.user_id',true),'')::uuid,
   case when TG_OP <> 'INSERT' then to_jsonb(OLD) end,
   case when TG_OP <> 'DELETE' then to_jsonb(NEW) end);
 if TG_OP = 'DELETE' then return OLD; end if;
 return NEW;
end $$;
revoke all on function fn_product_catalog_history() from public;
do $$ declare t text; begin
 foreach t in array array['product','product_category','product_family','product_alias','product_attribute_def','product_attribute_enum_value','product_attribute_value','product_relation','product_bundle','product_barcode','product_packaging'] loop
 execute format('create trigger trg_product_catalog_history before insert or update or delete on %I for each row execute function fn_product_catalog_history()',t);
 end loop;
end $$;
