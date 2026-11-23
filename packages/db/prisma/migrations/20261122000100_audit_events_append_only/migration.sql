-- audit_events is append-only: reject UPDATE and DELETE at the database level.
-- Retention (1 year) will be enforced by a later phase through a dedicated privileged function
-- that disables this trigger inside its own transaction; the application role never can.
CREATE OR REPLACE FUNCTION audit_events_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only (% blocked)', TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION audit_events_reject_mutation();

CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON "audit_events"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_reject_mutation();
