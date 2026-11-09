-- Explicit rollback removes this newly introduced evidence field only.
alter table approval_request drop column policy_snapshot;
