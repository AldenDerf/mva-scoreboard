-- PROPOSAL ONLY. OWNER APPROVAL REQUIRED. DO NOT RUN on mva_dev in Phase 03G.
-- Requires a fresh backup, target/ACL review, and an independently approved execution.
-- This stages the runtime as NOLOGIN; activation and secret provisioning are separate.
BEGIN;
DO $guard$
BEGIN
  IF current_database() <> 'mva_dev'
     OR inet_server_addr() <> '::1'::inet
     OR inet_server_port() <> 5432
     OR (SELECT system_identifier FROM pg_control_system()) <> 7629597861964584196
     OR to_regclass('scoreboard.role_grants') IS NULL
     OR to_regclass('scoreboard.admin_audit_events') IS NULL
     OR to_regrole('scoreboard_runtime') IS NOT NULL
     OR to_regrole('scoreboard_auth_lookup_owner') IS NOT NULL THEN
    RAISE EXCEPTION 'wrong target or unexpected pre-existing objects';
  END IF;
END $guard$;

ALTER TABLE scoreboard.role_grants
  ADD COLUMN grant_source text NOT NULL DEFAULT 'SCOREBOARD'
  CHECK (grant_source IN ('SCOREBOARD', 'MVA_ADMIN'));

CREATE ROLE scoreboard_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS;
CREATE ROLE scoreboard_auth_lookup_owner NOLOGIN NOSUPERUSER NOCREATEDB
  NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

GRANT CONNECT ON DATABASE mva_dev TO scoreboard_runtime;
GRANT USAGE ON SCHEMA scoreboard TO scoreboard_runtime, scoreboard_auth_lookup_owner;
GRANT SELECT (id, user_id, role, grant_source, revoked_at, revoked_by_user_id),
      INSERT (id, user_id, role, granted_by_user_id, granted_at, grant_source),
      UPDATE (revoked_at, revoked_by_user_id)
  ON scoreboard.role_grants TO scoreboard_auth_lookup_owner;
GRANT INSERT (id, actor_user_id, action, target_type, target_id, before_state, after_state, reason, created_at)
  ON scoreboard.admin_audit_events TO scoreboard_auth_lookup_owner;

CREATE POLICY auth_lookup_owner_read ON scoreboard.role_grants
  FOR SELECT TO scoreboard_auth_lookup_owner USING (true);
CREATE POLICY auth_lookup_owner_insert ON scoreboard.role_grants
  FOR INSERT TO scoreboard_auth_lookup_owner
  WITH CHECK (role = 'ADMIN' AND grant_source = 'MVA_ADMIN' AND revoked_at IS NULL);
CREATE POLICY auth_lookup_owner_update ON scoreboard.role_grants
  FOR UPDATE TO scoreboard_auth_lookup_owner
  USING (role = 'ADMIN' AND grant_source = 'MVA_ADMIN' AND revoked_at IS NULL)
  WITH CHECK (role = 'ADMIN' AND grant_source = 'MVA_ADMIN' AND revoked_at IS NOT NULL);
CREATE POLICY auth_lookup_owner_audit_insert ON scoreboard.admin_audit_events
  FOR INSERT TO scoreboard_auth_lookup_owner
  WITH CHECK (target_type = 'role_grant' AND action IN ('MVA_ADMIN_SYNC_GRANTED', 'MVA_ADMIN_SYNC_REVOKED'));

-- CREATE is needed only while transferring function ownership. It is revoked
-- before COMMIT. No runtime membership in this owner role is granted.
GRANT CREATE ON SCHEMA scoreboard TO scoreboard_auth_lookup_owner;
CREATE FUNCTION scoreboard.active_role_for_user(p_user_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE v_admin integer; v_scorekeeper integer;
BEGIN
  IF p_user_id IS NULL THEN RETURN NULL; END IF;
  SELECT count(*) FILTER (WHERE role = 'ADMIN'),
         count(*) FILTER (WHERE role = 'SCOREKEEPER')
    INTO v_admin, v_scorekeeper
    FROM scoreboard.role_grants
   WHERE user_id = p_user_id AND revoked_at IS NULL;
  IF v_admin > 1 OR v_scorekeeper > 1 THEN
    RAISE EXCEPTION 'ambiguous active scoreboard grants';
  END IF;
  IF v_admin = 1 THEN RETURN 'ADMIN'; END IF;
  IF v_scorekeeper = 1 THEN RETURN 'SCOREKEEPER'; END IF;
  RETURN NULL;
END $fn$;

CREATE FUNCTION scoreboard.reconcile_mva_admin_role(
  p_user_id uuid,
  p_is_active_mva_admin boolean
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE
  v_grant_id uuid;
  v_grant_source text;
  v_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_is_active_mva_admin IS NULL THEN
    RAISE EXCEPTION 'invalid MVA admin reconciliation parameters' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('scoreboard.reconcile_mva_admin:' || p_user_id::text));

  SELECT id, grant_source
    INTO v_grant_id, v_grant_source
    FROM scoreboard.role_grants
   WHERE user_id = p_user_id AND role = 'ADMIN' AND revoked_at IS NULL;

  IF p_is_active_mva_admin THEN
    IF NOT FOUND THEN
      INSERT INTO scoreboard.role_grants (user_id, role, granted_by_user_id, grant_source)
        VALUES (p_user_id, 'ADMIN', p_user_id, 'MVA_ADMIN')
        RETURNING id INTO v_id;
      INSERT INTO scoreboard.admin_audit_events
        (actor_user_id, action, target_type, target_id, before_state, after_state, reason)
        VALUES (
          p_user_id,
          'MVA_ADMIN_SYNC_GRANTED',
          'role_grant',
          v_id,
          NULL,
          jsonb_build_object('user_id', p_user_id, 'role', 'ADMIN', 'grant_source', 'MVA_ADMIN'),
          'Synchronized active MVA administrator status'
        );
    END IF;
  ELSE
    -- Only revoke ADMIN grants that originated from MVA_ADMIN inheritance.
    -- Independently granted SCOREBOARD ADMIN and SCOREKEEPER grants are preserved.
    IF FOUND AND v_grant_source = 'MVA_ADMIN' THEN
      UPDATE scoreboard.role_grants
         SET revoked_at = now(), revoked_by_user_id = p_user_id
       WHERE id = v_grant_id;
      INSERT INTO scoreboard.admin_audit_events
        (actor_user_id, action, target_type, target_id, before_state, after_state, reason)
        VALUES (
          p_user_id,
          'MVA_ADMIN_SYNC_REVOKED',
          'role_grant',
          v_grant_id,
          jsonb_build_object('user_id', p_user_id, 'role', 'ADMIN', 'grant_source', 'MVA_ADMIN'),
          jsonb_build_object('revoked_at', now()),
          'Revoked inherited ADMIN after MVA administrator status became inactive'
        );
    END IF;
  END IF;

  RETURN scoreboard.active_role_for_user(p_user_id);
END $fn$;

ALTER FUNCTION scoreboard.active_role_for_user(uuid)
  OWNER TO scoreboard_auth_lookup_owner;
ALTER FUNCTION scoreboard.reconcile_mva_admin_role(uuid, boolean)
  OWNER TO scoreboard_auth_lookup_owner;
REVOKE CREATE ON SCHEMA scoreboard FROM scoreboard_auth_lookup_owner;
REVOKE ALL ON FUNCTION scoreboard.active_role_for_user(uuid),
  scoreboard.reconcile_mva_admin_role(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION scoreboard.active_role_for_user(uuid)
  TO scoreboard_runtime, scoreboard_auth_lookup_owner;
GRANT EXECUTE ON FUNCTION scoreboard.reconcile_mva_admin_role(uuid, boolean)
  TO scoreboard_runtime;
COMMIT;

-- Separate approved activation, AFTER setting a protected password and
-- verifying pg_hba/network rules: ALTER ROLE scoreboard_runtime LOGIN;
-- Never use the existing postgres migration credential in app runtime.
