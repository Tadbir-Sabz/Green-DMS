-- بازگردانی مهاجرت 0030
drop index if exists ix_psp_retry;

alter table psp_transaction drop column if exists next_retry_at;
alter table psp_transaction drop column if exists last_error;
alter table psp_transaction drop column if exists attempt_count;

alter table psp_transaction drop constraint psp_transaction_status_check;
alter table psp_transaction add constraint psp_transaction_status_check
  check (status in ('success', 'failed', 'reversed', 'settled'));
