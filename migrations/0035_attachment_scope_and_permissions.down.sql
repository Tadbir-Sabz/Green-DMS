-- معکوس مهاجرت 0035
delete from role_permission where permission_code in ('attachment.upload', 'attachment.view');
delete from permission where code in ('attachment.upload', 'attachment.view');
drop index if exists ix_attachment_company;
alter table attachment drop column if exists company_id;
