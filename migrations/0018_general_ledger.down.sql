-- معکوس 0018_general_ledger
-- فقط شیت‌های خود همین مهاجرت را حذف می‌کند (CASCADE برای وابستگی‌ها)


drop view if exists v_trial_balance cascade;

alter table value_document drop constraint if exists fk_value_document_journal;

drop table if exists recurring_journal cascade;

drop table if exists ledger_balance_snapshot cascade;

drop index if exists uq_tax_ledger_source;

drop table if exists tax_ledger cascade;

drop table if exists account_mapping cascade;

drop trigger if exists trg_journal_balanced on journal_line;

drop function if exists fn_journal_balanced() cascade;

drop index if exists ix_journal_line_dimensions;

drop index if exists ix_journal_line_party;

drop index if exists ix_journal_line_account;

drop table if exists journal_line cascade;

drop trigger if exists trg_journal_immutable on journal_entry;

drop index if exists ix_journal_entry_period;

drop index if exists uq_journal_source;

drop trigger if exists trg_journal_period on journal_entry;

drop function if exists fn_check_journal_period() cascade;

drop table if exists journal_entry cascade;

drop table if exists fiscal_period cascade;

drop table if exists gl_dimension_value cascade;

drop table if exists gl_dimension cascade;

drop index if exists uq_gl_account_control;

drop index if exists ix_gl_account_parent;

drop table if exists gl_account cascade;
