-- معکوس 0013_treasury
-- فقط شیت‌های خود همین مهاجرت را حذف می‌کند (CASCADE برای وابستگی‌ها)


alter table tour_settlement drop constraint if exists fk_tour_settlement_cash_box;

drop table if exists daily_treasury_close cascade;

drop table if exists petty_cash_line cascade;

drop table if exists petty_cash cascade;

drop index if exists ix_psp_unsettled;

drop table if exists psp_transaction cascade;

drop index if exists ix_cheque_event;

drop table if exists cheque_event cascade;

drop index if exists uq_cheque_sayad;

drop index if exists ix_cheque_due;

drop table if exists cheque cascade;

drop index if exists ix_bank_line_unmatched;

drop index if exists uq_bank_line;

drop table if exists bank_statement_line cascade;

drop table if exists bank_statement cascade;

drop table if exists bank_account cascade;

drop index if exists uq_cash_session_open;

drop table if exists cash_session cascade;

drop index if exists ix_cash_txn_box_time;

drop table if exists cash_txn cascade;

drop index if exists uq_cash_box_holder;

drop table if exists cash_box cascade;
