-- مهاجرت 0030 — صف یکپارچه‌سازی‌ها (فاز B — ایمنی و درستی داده)
-- منبع: گزارش کد › صف integrations امروز روی آرایهٔ درون‌حافظه است و پاسخ‌ها
--        با «simulate» ساخته می‌شود؛ باید روی جدول‌های پایدار moadian_submission و
--        psp_transaction با retry واقعی اجرا شود.
-- فاز توسعه: ۶ | ماژول/بخش: یکپارچه‌سازی‌ها (PSP)

-- وضعیت‌های صف برای تراکنش PSP (قبلاً فقط success/failed/reversed/settled)
alter table psp_transaction drop constraint psp_transaction_status_check;
alter table psp_transaction add constraint psp_transaction_status_check
  check (status in ('queued', 'sending', 'success', 'failed', 'reversed', 'settled', 'retrying', 'dead'));

-- شمارش تلاش‌ها و زمان بازتلاش (همان ستون‌های moadian_submission)
alter table psp_transaction add column if not exists attempt_count smallint not null default 0;
alter table psp_transaction add column if not exists last_error text;
alter table psp_transaction add column if not exists next_retry_at timestamptz;

create index if not exists ix_psp_retry on psp_transaction (next_retry_at)
  where status in ('queued', 'retrying');
