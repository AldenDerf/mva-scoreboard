-- REVIEW ONLY. DO NOT APPLY IN PHASE 02.
-- Design proposal for Phase 03 official match persistence.
-- Requires separate owner review, fresh backup, verified target identity,
-- and prior application of Phase 03G + Phase 04 proposals.
-- Never apply to production without a production-specific reviewed migration.

BEGIN;
DO $guard$
BEGIN
  IF current_database() <> 'mva_dev'
     OR inet_server_addr() <> inet '::1'
     OR inet_server_port() <> 5432
     OR (SELECT system_identifier FROM pg_control_system()) <> '7629597861964584196'
     OR to_regclass('scoreboard.matches') IS NULL
     OR to_regprocedure('scoreboard.phase04_role(uuid,uuid)') IS NULL
     OR to_regrole('scoreboard_runtime') IS NULL
     OR to_regrole('scoreboard_phase04_owner') IS NULL THEN
    RAISE EXCEPTION 'Phase 02 official match creation prerequisite or target guard failed';
  END IF;
END $guard$;

GRANT CREATE ON SCHEMA scoreboard TO scoreboard_phase04_owner;

CREATE FUNCTION scoreboard.phase02_create_official_match(
  p_actor uuid,
  p_mva_tournament_id uuid,
  p_mva_division_id uuid,
  p_mva_team_a_id uuid,
  p_mva_team_b_id uuid,
  p_mva_registration_a_id uuid,
  p_mva_registration_b_id uuid,
  p_tournament_name text,
  p_division_name text,
  p_team_a_name text,
  p_team_b_name text,
  p_team_a_logo_url text,
  p_team_b_logo_url text,
  p_best_of smallint,
  p_serve char(1)
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE v_id uuid;
BEGIN
  -- 1. Enforce scoreboard-specific ADMIN role (never inferred from MVA admin_access)
  IF scoreboard.phase04_role(p_actor, NULL) IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'ADMIN required' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate MVA catalog UUIDs and distinct teams/registrations
  IF p_mva_tournament_id IS NULL
     OR p_mva_division_id IS NULL
     OR p_mva_team_a_id IS NULL
     OR p_mva_team_b_id IS NULL
     OR p_mva_registration_a_id IS NULL
     OR p_mva_registration_b_id IS NULL
     OR p_mva_team_a_id = p_mva_team_b_id
     OR p_mva_registration_a_id = p_mva_registration_b_id THEN
    RAISE EXCEPTION 'invalid official match catalog identities' USING ERRCODE = '22023';
  END IF;

  -- 3. Validate immutable broadcast display snapshots and match configuration
  IF length(btrim(coalesce(p_tournament_name, ''))) NOT BETWEEN 1 AND 150
     OR length(btrim(coalesce(p_division_name, ''))) NOT BETWEEN 1 AND 100
     OR length(btrim(coalesce(p_team_a_name, ''))) NOT BETWEEN 1 AND 150
     OR length(btrim(coalesce(p_team_b_name, ''))) NOT BETWEEN 1 AND 150
     OR lower(btrim(p_team_a_name)) = lower(btrim(p_team_b_name))
     OR (p_team_a_logo_url IS NOT NULL AND (length(p_team_a_logo_url) > 2048 OR left(p_team_a_logo_url, 8) <> 'https://'))
     OR (p_team_b_logo_url IS NOT NULL AND (length(p_team_b_logo_url) > 2048 OR left(p_team_b_logo_url, 8) <> 'https://'))
     OR p_best_of NOT IN (3, 5)
     OR p_serve NOT IN ('A', 'B') THEN
    RAISE EXCEPTION 'invalid official match snapshot or configuration' USING ERRCODE = '22023';
  END IF;

  -- 4. Insert official match with immutable MVA IDs and display snapshots
  INSERT INTO scoreboard.matches (
    mva_tournament_id,
    mva_division_id,
    mva_team_a_id,
    mva_team_b_id,
    mva_registration_a_id,
    mva_registration_b_id,
    tournament_name,
    division_name,
    team_a_name,
    team_b_name,
    team_a_logo_url,
    team_b_logo_url,
    status,
    serving_team,
    created_by_user_id,
    is_test,
    is_published
  ) VALUES (
    p_mva_tournament_id,
    p_mva_division_id,
    p_mva_team_a_id,
    p_mva_team_b_id,
    p_mva_registration_a_id,
    p_mva_registration_b_id,
    btrim(p_tournament_name),
    btrim(p_division_name),
    btrim(p_team_a_name),
    btrim(p_team_b_name),
    p_team_a_logo_url,
    p_team_b_logo_url,
    'LIVE',
    p_serve,
    p_actor,
    false,
    true
  ) RETURNING id INTO v_id;

  -- 5. Snapshot rules configuration and open Set 1
  INSERT INTO scoreboard.match_configurations (
    match_id,
    best_of,
    initial_serving_team
  ) VALUES (
    v_id,
    p_best_of,
    p_serve
  );

  INSERT INTO scoreboard.match_sets (
    match_id,
    set_number
  ) VALUES (
    v_id,
    1
  );

  -- 6. Record append-only administrative audit event
  INSERT INTO scoreboard.admin_audit_events (
    actor_user_id,
    action,
    target_type,
    target_id,
    after_state
  ) VALUES (
    p_actor,
    'OFFICIAL_MATCH_CREATED',
    'match',
    v_id,
    jsonb_build_object(
      'mvaTournamentId', p_mva_tournament_id,
      'mvaDivisionId', p_mva_division_id,
      'mvaTeamAId', p_mva_team_a_id,
      'mvaTeamBId', p_mva_team_b_id,
      'mvaRegistrationAId', p_mva_registration_a_id,
      'mvaRegistrationBId', p_mva_registration_b_id,
      'tournamentName', btrim(p_tournament_name),
      'divisionName', btrim(p_division_name),
      'teamAName', btrim(p_team_a_name),
      'teamBName', btrim(p_team_b_name),
      'bestOf', p_best_of,
      'initialServingTeam', p_serve
    )
  );

  RETURN v_id;
END $fn$;

ALTER FUNCTION scoreboard.phase02_create_official_match(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, smallint, character
) OWNER TO scoreboard_phase04_owner;

REVOKE ALL ON FUNCTION scoreboard.phase02_create_official_match(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, smallint, character
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION scoreboard.phase02_create_official_match(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, smallint, character
) TO scoreboard_runtime;

REVOKE CREATE ON SCHEMA scoreboard FROM scoreboard_phase04_owner;
COMMIT;
