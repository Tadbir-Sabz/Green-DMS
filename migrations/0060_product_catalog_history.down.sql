-- Explicit rollback drops only this new evidence store and its hooks.
-- Canonical products, legacy audit_log and all existing document history survive.
do $$ declare t text; begin
 foreach t in array array['product','product_category','product_family','product_alias','product_attribute_def','product_attribute_enum_value','product_attribute_value','product_relation','product_bundle','product_barcode','product_packaging'] loop
 execute format('drop trigger trg_product_catalog_history on %I',t);
 end loop;
end $$;
drop function fn_product_catalog_history();
drop table product_catalog_history;
