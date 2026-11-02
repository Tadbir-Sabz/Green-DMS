-- معکوس 0009_rules_engine
-- فقط شیت‌های خود همین مهاجرت را حذف می‌کند (CASCADE برای وابستگی‌ها)


drop index if exists ix_exception_open;

drop table if exists exception_item cascade;

drop table if exists approval_decision cascade;

drop index if exists uq_approval_request_open;

drop index if exists ix_approval_request_pending;

drop table if exists approval_request cascade;

drop table if exists approval_step_def cascade;

drop table if exists approval_chain cascade;

drop table if exists rule_scope cascade;

drop table if exists rule_action cascade;

drop index if exists ix_rule_condition_rule;

drop table if exists rule_condition cascade;

drop index if exists ix_rule_entity_active;

drop table if exists rule cascade;
