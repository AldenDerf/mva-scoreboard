-- REVIEW ONLY. Requires a separately approved mva_dev change, current backup,
-- verified target identity, and rollback plan. Never apply to production.
-- Depends on the seven-table foundation and the separately approved 03G
-- runtime lookup proposal. No application LOGIN is activated here.
BEGIN;
DO $guard$
BEGIN
  IF current_database() <> 'mva_dev'
     OR inet_server_addr() <> inet '::1'
     OR inet_server_port() <> 5432
     OR (SELECT system_identifier FROM pg_control_system()) <> '7629597861964584196'
     OR to_regclass('scoreboard.matches') IS NULL
     OR to_regprocedure('scoreboard.active_role_for_user(uuid)') IS NULL
     OR to_regrole('scoreboard_runtime') IS NULL
     OR to_regrole('scoreboard_phase04_owner') IS NOT NULL
     OR EXISTS (SELECT 1 FROM scoreboard.matches) THEN
    RAISE EXCEPTION 'Phase 04 target, prerequisite, or empty-match guard failed';
  END IF;
END $guard$;

-- Test matches have no MVA catalog identity. Official creation is intentionally
-- absent until the restricted MVA eligibility contract is approved.
ALTER TABLE scoreboard.matches
  ALTER COLUMN mva_tournament_id DROP NOT NULL,
  ALTER COLUMN mva_division_id DROP NOT NULL,
  ALTER COLUMN mva_team_a_id DROP NOT NULL,
  ALTER COLUMN mva_team_b_id DROP NOT NULL,
  ALTER COLUMN mva_registration_a_id DROP NOT NULL,
  ALTER COLUMN mva_registration_b_id DROP NOT NULL,
  ADD COLUMN is_test boolean NOT NULL DEFAULT false,
  ADD COLUMN is_published boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT test_match_identity CHECK (
    (is_test AND mva_tournament_id IS NULL AND mva_division_id IS NULL
      AND mva_team_a_id IS NULL AND mva_team_b_id IS NULL
      AND mva_registration_a_id IS NULL AND mva_registration_b_id IS NULL)
    OR (NOT is_test AND mva_tournament_id IS NOT NULL AND mva_division_id IS NOT NULL
      AND mva_team_a_id IS NOT NULL AND mva_team_b_id IS NOT NULL
      AND mva_registration_a_id IS NOT NULL AND mva_registration_b_id IS NOT NULL));
ALTER TABLE scoreboard.score_events
  ADD COLUMN requested_action jsonb NOT NULL DEFAULT '{}'::jsonb,
  DROP CONSTRAINT score_events_event_type_check,
  ADD CONSTRAINT score_events_event_type_check CHECK (event_type IN
    ('RALLY_AWARDED','POINT_SUBTRACTED','POINTS_CORRECTED','SET_SERVE',
     'UNDO','SET_FINALIZED','SET_RESULT_CORRECTED','CURRENT_SET_REOPENED',
     'MATCH_REOPENED','MATCH_STATUS_CHANGED'));

CREATE ROLE scoreboard_phase04_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT USAGE, CREATE ON SCHEMA scoreboard TO scoreboard_phase04_owner;
GRANT SELECT, INSERT, UPDATE ON scoreboard.matches, scoreboard.match_configurations,
  scoreboard.match_sets TO scoreboard_phase04_owner;
GRANT SELECT ON scoreboard.role_grants, scoreboard.scorekeeper_assignments
  TO scoreboard_phase04_owner;
GRANT SELECT, INSERT ON scoreboard.score_events, scoreboard.admin_audit_events
  TO scoreboard_phase04_owner;
CREATE POLICY phase04_owner_all_matches ON scoreboard.matches
  FOR ALL TO scoreboard_phase04_owner USING (true) WITH CHECK (true);
CREATE POLICY phase04_owner_all_configs ON scoreboard.match_configurations
  FOR ALL TO scoreboard_phase04_owner USING (true) WITH CHECK (true);
CREATE POLICY phase04_owner_all_sets ON scoreboard.match_sets
  FOR ALL TO scoreboard_phase04_owner USING (true) WITH CHECK (true);
CREATE POLICY phase04_owner_read_grants ON scoreboard.role_grants
  FOR SELECT TO scoreboard_phase04_owner USING (true);
CREATE POLICY phase04_owner_read_assignments ON scoreboard.scorekeeper_assignments
  FOR SELECT TO scoreboard_phase04_owner USING (true);
CREATE POLICY phase04_owner_events ON scoreboard.score_events
  FOR ALL TO scoreboard_phase04_owner USING (true) WITH CHECK (true);
CREATE POLICY phase04_owner_audit ON scoreboard.admin_audit_events
  FOR ALL TO scoreboard_phase04_owner USING (true) WITH CHECK (true);

CREATE FUNCTION scoreboard.phase04_role(p_actor uuid, p_match uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE v_role text;
BEGIN
  IF p_actor IS NULL THEN RETURN NULL; END IF;
  SELECT CASE WHEN bool_or(role = 'ADMIN') THEN 'ADMIN'
              WHEN bool_or(role = 'SCOREKEEPER') THEN 'SCOREKEEPER' END
    INTO v_role FROM scoreboard.role_grants
   WHERE user_id = p_actor AND revoked_at IS NULL;
  IF v_role = 'SCOREKEEPER' AND p_match IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM scoreboard.scorekeeper_assignments
     WHERE user_id = p_actor AND match_id = p_match AND revoked_at IS NULL) THEN
    RETURN NULL;
  END IF;
  RETURN v_role;
END $fn$;
ALTER FUNCTION scoreboard.phase04_role(uuid,uuid) OWNER TO scoreboard_phase04_owner;

CREATE FUNCTION scoreboard.phase04_snapshot(p_actor uuid, p_match uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE v_result jsonb;
BEGIN
  IF scoreboard.phase04_role(p_actor,p_match) IS NULL THEN
    RAISE EXCEPTION 'scoreboard access denied' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object('id',m.id,'publicId',m.public_id,'teamA',m.team_a_name,
      'teamB',m.team_b_name,'bestOf',c.best_of,'status',m.status,
      'currentSet',m.current_set,'serving',m.serving_team,'revision',m.revision,
      'isTest',m.is_test,'isPublished',m.is_published,
      'sets',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'number',s.set_number,'teamA',s.team_a_points,'teamB',s.team_b_points,
        'winner',s.winner,'pendingFinalization',s.pending_finalization,'startingServe',
        CASE WHEN s.set_number % 2 = 1 THEN c.initial_serving_team
             WHEN c.initial_serving_team = 'A' THEN 'B' ELSE 'A' END)
        ORDER BY s.set_number)
        FROM scoreboard.match_sets s WHERE s.match_id=m.id),'[]'::jsonb))
    INTO v_result FROM scoreboard.matches m
    JOIN scoreboard.match_configurations c ON c.match_id=m.id WHERE m.id=p_match;
  RETURN v_result;
END $fn$;
ALTER FUNCTION scoreboard.phase04_snapshot(uuid,uuid) OWNER TO scoreboard_phase04_owner;

CREATE FUNCTION scoreboard.phase04_create_test_match(
  p_actor uuid, p_team_a text, p_team_b text, p_best_of smallint, p_serve char(1))
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE v_id uuid;
BEGIN
  IF scoreboard.phase04_role(p_actor,NULL) IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'ADMIN required' USING ERRCODE='42501';
  END IF;
  IF length(btrim(coalesce(p_team_a,''))) NOT BETWEEN 1 AND 80
     OR length(btrim(coalesce(p_team_b,''))) NOT BETWEEN 1 AND 80
     OR lower(btrim(p_team_a)) = lower(btrim(p_team_b))
     OR p_best_of NOT IN (3,5) OR p_serve NOT IN ('A','B') THEN
    RAISE EXCEPTION 'invalid test match' USING ERRCODE='22023';
  END IF;
  INSERT INTO scoreboard.matches
    (tournament_name,division_name,team_a_name,team_b_name,status,serving_team,
     created_by_user_id,is_test,is_published)
    VALUES ('Practice orientation','Test match',btrim(p_team_a),btrim(p_team_b),
      'LIVE',p_serve,p_actor,true,true) RETURNING id INTO v_id;
  INSERT INTO scoreboard.match_configurations(match_id,best_of,initial_serving_team)
    VALUES(v_id,p_best_of,p_serve);
  INSERT INTO scoreboard.match_sets(match_id,set_number) VALUES(v_id,1);
  INSERT INTO scoreboard.admin_audit_events
    (actor_user_id,action,target_type,target_id,after_state)
    VALUES(p_actor,'TEST_MATCH_CREATED','match',v_id,
      jsonb_build_object('teamA',p_team_a,'teamB',p_team_b,'bestOf',p_best_of));
  RETURN v_id;
END $fn$;
ALTER FUNCTION scoreboard.phase04_create_test_match(uuid,text,text,smallint,character)
  OWNER TO scoreboard_phase04_owner;

CREATE FUNCTION scoreboard.phase04_list_matches(p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE v_result jsonb;
BEGIN
  IF scoreboard.phase04_role(p_actor,NULL) IS NULL THEN
    RAISE EXCEPTION 'scoreboard access denied' USING ERRCODE='42501';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',m.id,'publicId',m.public_id,
    'teamA',m.team_a_name,'teamB',m.team_b_name,'status',m.status,
    'revision',m.revision,'isTest',m.is_test) ORDER BY m.updated_at DESC),'[]'::jsonb)
    INTO v_result FROM scoreboard.matches m
   WHERE scoreboard.phase04_role(p_actor,m.id) IS NOT NULL;
  RETURN v_result;
END $fn$;
ALTER FUNCTION scoreboard.phase04_list_matches(uuid) OWNER TO scoreboard_phase04_owner;

CREATE FUNCTION scoreboard.phase04_overlay(p_public_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE v_result jsonb;
BEGIN
  SELECT jsonb_build_object('publicId',m.public_id,
    'tournament',m.tournament_name,'division',m.division_name,
    'teamA',m.team_a_name,'teamB',m.team_b_name,
    'teamALogoUrl',m.team_a_logo_url,'teamBLogoUrl',m.team_b_logo_url,
    'status',m.status,'currentSet',m.current_set,'serving',m.serving_team,
    'revision',m.revision,'bestOf',c.best_of,'isTest',m.is_test,
    'sets',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'number',s.set_number,'teamA',s.team_a_points,'teamB',s.team_b_points,
      'winner',s.winner,'pendingFinalization',s.pending_finalization) ORDER BY s.set_number)
      FROM scoreboard.match_sets s WHERE s.match_id=m.id),'[]'::jsonb))
    INTO v_result FROM scoreboard.matches m
    JOIN scoreboard.match_configurations c ON c.match_id=m.id
   WHERE m.public_id=p_public_id AND m.is_published
     AND m.status IN ('LIVE','PAUSED','COMPLETED');
  RETURN v_result;
END $fn$;
ALTER FUNCTION scoreboard.phase04_overlay(uuid) OWNER TO scoreboard_phase04_owner;

-- Scoring mutations are implemented in the next reviewed function file.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA scoreboard FROM PUBLIC;
GRANT EXECUTE ON FUNCTION scoreboard.phase04_snapshot(uuid,uuid),
  scoreboard.phase04_create_test_match(uuid,text,text,smallint,character),
  scoreboard.phase04_list_matches(uuid),
  scoreboard.phase04_overlay(uuid) TO scoreboard_runtime;
REVOKE CREATE ON SCHEMA scoreboard FROM scoreboard_phase04_owner;
COMMIT;
