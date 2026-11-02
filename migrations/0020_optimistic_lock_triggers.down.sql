-- معکوس 0020 — حذف تریگرهای قفل خوش‌بینانه

drop trigger if exists trg_touch on journal_entry;

drop trigger if exists trg_touch on gl_account;

drop trigger if exists trg_touch on payment_receipt;

drop trigger if exists trg_touch on cheque;

drop trigger if exists trg_touch on tour;

drop trigger if exists trg_touch on invoice;

drop trigger if exists trg_touch on sales_order;

drop trigger if exists trg_touch on customer_request;

drop trigger if exists trg_touch on rule;

drop trigger if exists trg_touch on stock_adjustment;

drop trigger if exists trg_touch on stock_count;

drop trigger if exists trg_touch on warehouse;

drop trigger if exists trg_touch on customer;

drop trigger if exists trg_touch on product;

drop trigger if exists trg_touch on app_user;

drop trigger if exists trg_touch on staff;

drop trigger if exists trg_touch on person;

drop trigger if exists trg_touch on sales_area;

drop trigger if exists trg_touch on branch;

drop trigger if exists trg_touch on company;
