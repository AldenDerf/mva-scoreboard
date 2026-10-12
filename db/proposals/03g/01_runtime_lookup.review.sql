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
     OR to_regrole('scoreboard_runtime') IS NOT NULL
     OR to_regrole('scoreboard_auth_lookup_owner') IS NOT NULL THEN
    RAISE EXCEPTION 'wrong target or unexpected pre-existing objects';
  END IF;
END $guard$;

CREATE ROLE scoreboard_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS;
CREATE ROLE scoreboard_auth_lookup_owner NOLOGIN NOSUPERUSER NOCREATEDB
  NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

GRANT CONNECT ON DATABASE mva_dev TO scoreboard_runtime;
GRANT USAGE ON SCHEMA scoreboard TO scoreboard_runtime, scoreboard_auth_lookup_owner;
GRANT SELECT (user_id, role, revoked_at) ON scoreboard.role_grants
  TO scoreboard_auth_lookup_owner;
CREATE POLICY auth_lookup_owner_read ON scoreboard.role_grants
  FOR SELECT TO scoreboard_auth_lookup_owner USING (true);

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
ALTER FUNCTION scoreboard.active_role_for_user(uuid)
  OWNER TO scoreboard_auth_lookup_owner;
REVOKE CREATE ON SCHEMA scoreboard FROM scoreboard_auth_lookup_owner;
REVOKE ALL ON FUNCTION scoreboard.active_role_for_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION scoreboard.active_role_for_user(uuid)
  TO scoreboard_runtime;
COMMIT;

-- Separate approved activation, AFTER setting a protected password and
-- verifying pg_hba/network rules: ALTER ROLE scoreboard_runtime LOGIN;
-- Never use the existing postgres migration credential in app runtime.
