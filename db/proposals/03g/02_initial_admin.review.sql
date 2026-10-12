-- PROPOSAL ONLY. OWNER APPROVAL REQUIRED. DO NOT RUN on mva_dev in Phase 03G.
-- Install only after independent Supabase Auth UUID confirmation, backup and
-- exact target review. Execute the function with bound parameters in a
-- migration-owner session. Never put a UUID in this file or command arguments.
BEGIN;
DO $guard$
BEGIN
  IF current_database() <> 'mva_dev'
     OR inet_server_addr() <> '::1'::inet
     OR inet_server_port() <> 5432
     OR (SELECT system_identifier FROM pg_control_system()) <> 7629597861964584196
     OR to_regclass('scoreboard.role_grants') IS NULL
     OR to_regprocedure('scoreboard.bootstrap_initial_admin(uuid,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'wrong target or bootstrap already installed';
  END IF;
END $guard$;
CREATE FUNCTION scoreboard.bootstrap_initial_admin(p_user_id uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE v_existing uuid; v_id uuid;
BEGIN
  IF current_database() <> 'mva_dev'
     OR inet_server_addr() <> '::1'::inet
     OR inet_server_port() <> 5432
     OR (SELECT system_identifier FROM pg_control_system()) <> 7629597861964584196
     OR p_user_id IS NULL
     OR length(btrim(coalesce(p_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'invalid bootstrap target or parameters';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('scoreboard.initial_admin_bootstrap'));
  IF EXISTS (SELECT 1 FROM scoreboard.role_grants
              WHERE role = 'ADMIN' AND revoked_at IS NOT NULL) THEN
    RAISE EXCEPTION 'ADMIN history exists; initial bootstrap is no longer valid';
  END IF;
  SELECT id INTO v_existing FROM scoreboard.role_grants
    WHERE role = 'ADMIN' AND revoked_at IS NULL AND user_id = p_user_id;
  IF EXISTS (SELECT 1 FROM scoreboard.role_grants
              WHERE role = 'ADMIN' AND revoked_at IS NULL AND user_id <> p_user_id) THEN
    RAISE EXCEPTION 'another active ADMIN exists';
  END IF;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  INSERT INTO scoreboard.role_grants(user_id, role, granted_by_user_id)
    VALUES (p_user_id, 'ADMIN', p_user_id) RETURNING id INTO v_id;
  INSERT INTO scoreboard.admin_audit_events
    (actor_user_id, action, target_type, target_id, before_state, after_state, reason)
    VALUES (p_user_id, 'INITIAL_ADMIN_GRANTED', 'role_grant', v_id, NULL,
            jsonb_build_object('user_id', p_user_id, 'role', 'ADMIN'), p_reason);
  RETURN v_id;
END $fn$;
REVOKE ALL ON FUNCTION scoreboard.bootstrap_initial_admin(uuid,text) FROM PUBLIC;
COMMIT;

-- Later, with separate explicit owner approval and verified Supabase Auth ID:
-- BEGIN; SELECT scoreboard.bootstrap_initial_admin($1::uuid, $2::text); COMMIT;
-- $1 and $2 are client-bound parameters, not SQL text substitution.
