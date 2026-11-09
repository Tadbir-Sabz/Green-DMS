-- New requests preserve the policy inputs used to compose their stage snapshot.
-- Historical requests remain NULL: reconstructing them from current policy would
-- invent history. Existing RLS/grants apply; no data or authorization is changed.
alter table approval_request add column policy_snapshot jsonb;
