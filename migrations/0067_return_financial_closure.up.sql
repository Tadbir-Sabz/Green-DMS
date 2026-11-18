-- مهاجرت 0067 — بستن مالیِ مرجوعی (TASK-P4-FC, P4)
-- منبع: docs/product-inventory/TASK-P4-FC_RETURN_FINANCIAL_CLOSURE.md
-- فاز توسعه: ۴ | ماژول/بخش: مرجوعی ← فاکتور، یادداشت بستانکار
--
-- فقط افزودنی است (بدون حذف/تغییرِ قاعدهٔ موجود):
-- ۱) پیوند traceability قلم مرجوعی به قلمِ فاکتور (nullable — مرجوعی‌های legacy بدون پیوند دست‌نخورده می‌مانند)
-- ۲) وضعیت صریحِ ارزش‌گذاریِ مرجوعی (valuation_status) روی سرخط مرجوعی
-- ۳) ایندکس‌های کمکی برای eligibility/بستانکاری
-- ۴) مجوزِ صدور یادداشت بستانکار (sales.return.credit) + نگاشتِ نقش‌ها.
-- seed 0022 الگوها را هنگام همان migration به کدهای موجود بسط می‌دهد؛ چون این مجوز تازه است،
-- role_permission باید اینجا صریحاً برای نقش‌های متناظر تکمیل شود.

alter table return_request_line
  add column invoice_line_id uuid null references invoice_line(id);

comment on column return_request_line.invoice_line_id is
  'پیوند اختیاری به قلمِ فاکتورِ مبدأ (traceability + سقفِ بستانکاری).
   NULL = مرجوعیِ بدون پیوند (رفتاریِ فعلیِ پیش از این مهاجرت).';

create index ix_return_request_line_invoice_line
  on return_request_line (invoice_line_id)
  where invoice_line_id is not null;

-- eligibility بستانکاری: مجموع qty_approved بستانکارشدهٔ قبلی به‌ازای هر قلمِ فاکتور
create index ix_credit_note_line_invoice_line
  on credit_note_line (invoice_line_id)
  where invoice_line_id is not null;

-- جمعِ بستانکارِ posted به‌ازای هر فاکتور (سقف سخت)
create index ix_credit_note_invoice_posted
  on credit_note (invoice_id)
  where status = 'posted';

alter table return_request
  add column valuation_status text not null default 'unresolved'
    check (valuation_status in ('unresolved','valued','not_applicable','waived'));

comment on column return_request.valuation_status is
  'وضعیت صریحِ ارزش‌گذاریِ بهای تمام‌شدهٔ کالای برگشتی.
   مقدارِ پیش‌فرضِ «unresolved» = بهای تمام‌شده ثبت نشده؛ کمیت و ارزش دو مسیر جدا هستند
   (sale_return_in با unit_cost=0 + v_stock_valuation_variance).
   گذار به «valued» فقط پس از تصمیمِ مالک دربارهٔ سیاست (OD-01) با مهاجرتِ بعدی فعال می‌شود.';

insert into permission (code, module, title)
values ('sales.return.credit', 'sales', 'صدور یادداشت بستانکار مرجوعی')
on conflict (code) do nothing;

-- role_permission در seed 0022 الگوها را در لحظهٔ اجرا به مجوزهای موجود بسط می‌دهد؛
-- مجوز تازهٔ بالا به‌تنهایی accountant را مجاز نمی‌کند. هم‌ارزِ sales.return.* / sales.* / *:
-- accountant و sales_manager و ceo در تمام شرکت‌های seedشده دسترسی می‌گیرند؛ نقش‌های میدانی
-- (salesperson/courier) و sys_admin عمداً دسترسیِ صدور ندارند. مجوزِ مدیرکل مطابق seed ceo='*' است.
insert into role_permission (role_id, permission_code)
select r.id, 'sales.return.credit'
  from role r
 where r.code in ('accountant', 'sales_manager', 'ceo')
on conflict (role_id, permission_code) do nothing;

-- نمایِ آشتی‌گیریِ مرجوعی روی فاکتور — جایگزینِ نوشتنِ return_status روی فاکتورِ posted
-- (immutability triggerِ fn_immutable_after_post اجازهٔ UPDATE روی سند ثبت‌شده نمی‌دهد؛
--  بنابراین وضعیتِ «بازگشت کامل/جزئی» مشتق‌شده و خواندنی است، نه ستونِ نگه‌داشته‌شده).
-- security_invoker = true طبق قراردادِ TASK-23 (RLS نقشِ فراخوان اعمال می‌شود).
create or replace view v_invoice_return_summary as
select i.id                as invoice_id,
       i.branch_id,
       i.customer_id,
       i.doc_number,
       i.grand_total,
       coalesce(sum(il.qty), 0)                       as sold_qty,
       coalesce(sum(rq.q), 0)                         as returned_qty,
       case
         when coalesce(sum(rq.q), 0) <= 0 then 'none'
         when coalesce(sum(rq.q), 0) >= coalesce(sum(il.qty), 0) then 'full'
         else 'partial'
       end                                            as return_status
  from invoice i
  join invoice_line il on il.invoice_id = i.id
  left join (
    select rl.invoice_line_id, rl.qty_approved as q
      from return_request_line rl
      join return_request rr
        on rr.id = rl.return_request_id
       and rr.status in ('posted', 'closed')
     where rl.invoice_line_id is not null
  ) rq on rq.invoice_line_id = il.id
 group by i.id, i.branch_id, i.customer_id, i.doc_number, i.grand_total;

alter view v_invoice_return_summary set (security_invoker = true);

-- همان الگوی 0048: گرانتِ صریح علاوه بر default privileges
grant select on v_invoice_return_summary to dms_app, dms_readonly;
