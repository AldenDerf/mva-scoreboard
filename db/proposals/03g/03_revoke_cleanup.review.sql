-- PROPOSAL ONLY. OWNER APPROVAL REQUIRED. DO NOT RUN on mva_dev in Phase 03G.
-- The ADMIN revocation transaction below is a reviewed operator template.
-- Bind $1=target Auth UUID, $2=verified operator Auth UUID, $3=reason through
-- a client that supports
-- parameter binding. A separate authorized ADMIN revocation function may
-- supersede this migration-owner procedure after runtime admin workflows exist.
BEGIN;
DO $guard$
BEGIN
  IF current_database() <> 'mva_dev'
     OR inet_server_addr() <> '::1'::inet
     OR inet_server_port() <> 5432
     OR (SELECT system_identifier FROM pg_control_system()) <> 7629597861964584196
     OR to_regclass('scoreboard.role_grants') IS NULL THEN
    RAISE EXCEPTION 'wrong revocation target';
  END IF;
END $guard$;
WITH revoked AS (
  UPDATE scoreboard.role_grants
     SET revoked_at = now(), revoked_by_user_id = $2::uuid
   WHERE user_id = $1::uuid AND role = 'ADMIN' AND revoked_at IS NULL
   RETURNING id, user_id, role, revoked_at
), audited AS (
  INSERT INTO scoreboard.admin_audit_events
    (actor_user_id, action, target_type, target_id, before_state, after_state, reason)
  SELECT $2::uuid, 'ADMIN_REVOKED', 'role_grant', id,
         jsonb_build_object('user_id', user_id, 'role', role),
         jsonb_build_object('revoked_at', revoked_at), $3::text
    FROM revoked
  RETURNING id
)
SELECT 1 / count(*) FROM audited; -- zero audit rows raise division by zero
COMMIT;

-- Separately approved cleanup after bootstrap verification:
-- BEGIN;
-- DROP FUNCTION scoreboard.bootstrap_initial_admin(uuid,text);
-- COMMIT;
-- Preserve role_grants and admin_audit_events history.
