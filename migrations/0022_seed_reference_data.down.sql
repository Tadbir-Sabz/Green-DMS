-- معکوس 0022 — داده‌های مرجع
-- فقط شیت‌های خود همین مهاجرت را حذف می‌کند، آن هم تنها وقتی به داده دیگری وابسته نباشند:
-- نقش با کاربر، سمت با پرسنل، واحد با کالا و روش پرداخت با رسید.
-- دلیل محافظت: حذف داده‌ای که کاربر روی آن اصلاح کرده یا به آن وابسته شده، از دست رفتن داده تولیدی است.

do $$
declare
  v_perm text[] := array[
    'master.product.view','master.product.create','master.product.update','master.product.approve',
    'master.price.view','master.price.update','master.price.approve',
    'master.promotion.view','master.promotion.update','master.promotion.approve',
    'master.person.view','master.person.create','master.person.update',
    'master.customer.view','master.customer.create','master.customer.update','master.customer.approve',
    'master.structure.view','master.structure.update','master.settings.view','master.settings.update',
    'inventory.stock.view','inventory.count.create','inventory.count.approve',
    'inventory.transfer.create','inventory.transfer.approve',
    'inventory.adjust.create','inventory.adjust.approve',
    'rules.view','rules.manage','rules.approval.decide','rules.exceptions.resolve',
    'sales.request.view','sales.request.create','sales.request.convert',
    'sales.order.view','sales.order.create','sales.order.approve',
    'sales.waybill.view','sales.waybill.create','sales.waybill.issue',
    'sales.invoice.view','sales.invoice.create','sales.invoice.issue','sales.invoice.void','sales.invoice.correct',
    'sales.delivery.view','sales.delivery.update',
    'sales.return.request','sales.return.approve','sales.return.post','sales.moadian.submit',
    'tour.plan.view','tour.plan.create','tour.plan.approve','tour.settle.create','tour.settle.approve',
    'telesales.order.create','telesales.target.manage','commission.approve',
    'tracking.live.view','tracking.route.view','tracking.route.create',
    'tracking.geofence.view','tracking.geofence.update','tracking.customer_geo.update',
    'ar.receipt.create','ar.receipt.void','ar.ledger.view','ar.credit.approve','ar.collection.manage',
    'ap.supplier.view','ap.supplier.update','ap.purchase.request','ap.purchase.approve',
    'ap.grn.post','ap.invoice.match','ap.invoice.approve','ap.payment.create',
    'valuation.view','valuation.cogs.view','valuation.revalue.approve',
    'treasury.cash.view','treasury.cash.close','treasury.close.approve',
    'treasury.bank.view','treasury.bank.reconcile','treasury.cheque.view','treasury.cheque.update',
    'treasury.petty.approve',
    'gl.journal.view','gl.journal.create','gl.journal.post','gl.journal.void','gl.period.close','gl.report.view',
    'reports.dashboard.view','reports.export',
    'admin.user.manage','admin.role.manage','admin.audit.view','admin.backup.manage','admin.integration.manage'
  ];
  v_role text[] := array[
    'sys_admin','ceo','sales_manager','supervisor','salesperson_cold','salesperson_warm',
    'courier','telesales','storekeeper','buyer','accountant','treasurer'
  ];
  v_uom text[]  := array['pcs','box','carton','bag','pallet','kg','gr','l','ml'];
  v_pay text[]  := array['cash','card','cheque','credit','online','offset'];
  n integer;
begin
  -- ۱) نگاشت نقش ← مجوز (فقط نقش‌های سیستمیِ ساخته‌شده در همین مهاجرت)
  delete from role_permission rp
   where rp.permission_code = any(v_perm)
     and exists (select 1 from role r where r.id = rp.role_id and r.is_system);

  -- ۲) نقش‌های سیستمی، فقط وقتی هیچ کاربری از آن استفاده نمی‌کند
  delete from role r
   where r.code = any(v_role)
     and r.is_system
     and not exists (select 1 from user_role ur where ur.role_id = r.id);
  get diagnostics n = row_count;
  raise notice '0022: % نقش حذف شد (نقش‌های دارای کاربر حفظ شدند).', n;

  -- ۳) سمت‌ها، فقط وقتی پرسنلی به آن وابسته نیست
  delete from job_position jp
   where jp.code = any(v_role)
     and not exists (select 1 from staff s where s.job_position_id = jp.id);
  get diagnostics n = row_count;
  raise notice '0022: % سمت حذف شد (سمت‌های دارای پرسنل حفظ شدند).', n;

  -- ۴) مجوزها، فقط وقتی هیچ نگاشتی به آن نمانده باشد
  delete from permission p
   where p.code = any(v_perm)
     and not exists (select 1 from role_permission rp where rp.permission_code = p.code);

  -- ۵) روش پرداخت، فقط وقتی رسید یا ردیف تسویه‌ای از آن استفاده نکرده باشد
  delete from payment_method pm
   where pm.code = any(v_pay)
     and not exists (select 1 from payment_receipt pr where pr.payment_method_id = pm.id)
     and not exists (select 1 from tour_settlement_line tsl where tsl.payment_method_id = pm.id);

  -- ۶) واحد اندازه‌گیری، فقط وقتی به کالایی وصل نباشد
  delete from uom u
   where u.code = any(v_uom)
     and not exists (select 1 from product p where p.base_uom_id = u.id)
     and not exists (select 1 from product_packaging pp where pp.uom_id = u.id);
end $$;
