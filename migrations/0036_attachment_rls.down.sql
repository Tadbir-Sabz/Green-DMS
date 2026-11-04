-- معکوس مهاجرت 0036
drop policy if exists p_attachment_tenant on attachment;
alter table attachment disable row level security;
