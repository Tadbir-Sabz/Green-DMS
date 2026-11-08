-- مهاجرت 0051 (down) — حذفِ تضمینِ یکتاییِ تصمیم
begin;
drop index if exists uq_approval_decision_step;
commit;
