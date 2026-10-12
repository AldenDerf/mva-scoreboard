-- REVIEW ONLY. Apply only after the separately approved Phase 04 schema file.
-- The application calls only this SECURITY DEFINER function, never base tables.
BEGIN;
DO $guard$
BEGIN
  IF current_database() <> 'mva_dev'
     OR inet_server_addr() <> inet '::1'
     OR inet_server_port() <> 5432
     OR (SELECT system_identifier FROM pg_control_system()) <> '7629597861964584196'
     OR to_regprocedure('scoreboard.phase04_snapshot(uuid,uuid)') IS NULL
     OR to_regprocedure('scoreboard.phase04_apply(uuid,uuid,uuid,bigint,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'Phase 04 command target or prerequisite guard failed';
  END IF;
END $guard$;
GRANT CREATE ON SCHEMA scoreboard TO scoreboard_phase04_owner;
GRANT DELETE ON scoreboard.match_sets TO scoreboard_phase04_owner;

CREATE FUNCTION scoreboard.phase04_winner(p_a integer, p_b integer, p_set integer, p_best integer)
RETURNS char(1) LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog AS $fn$
  SELECT CASE WHEN greatest(p_a,p_b) >= CASE WHEN p_set=p_best THEN 15 ELSE 25 END
                    AND abs(p_a-p_b) >= 2
              THEN CASE WHEN p_a>p_b THEN 'A' ELSE 'B' END
              ELSE NULL END::char(1)
$fn$;
ALTER FUNCTION scoreboard.phase04_winner(integer,integer,integer,integer)
  OWNER TO scoreboard_phase04_owner;

CREATE FUNCTION scoreboard.phase04_valid_final(p_a integer, p_b integer, p_set integer, p_best integer)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog AS $fn$
  SELECT CASE WHEN scoreboard.phase04_winner(p_a,p_b,p_set,p_best) IS NULL THEN false
              WHEN least(p_a,p_b) < CASE WHEN p_set=p_best THEN 14 ELSE 24 END
                THEN greatest(p_a,p_b) = CASE WHEN p_set=p_best THEN 15 ELSE 25 END
              ELSE greatest(p_a,p_b) = least(p_a,p_b)+2 END
$fn$;
ALTER FUNCTION scoreboard.phase04_valid_final(integer,integer,integer,integer)
  OWNER TO scoreboard_phase04_owner;

CREATE FUNCTION scoreboard.phase04_apply(
  p_actor uuid, p_match uuid, p_key uuid, p_expected bigint, p_action jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE
  v_match scoreboard.matches%ROWTYPE;
  v_set scoreboard.match_sets%ROWTYPE;
  v_target scoreboard.match_sets%ROWTYPE;
  v_config scoreboard.match_configurations%ROWTYPE;
  v_prior scoreboard.score_events%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
  v_type text;
  v_team char(1);
  v_winner char(1);
  v_a integer;
  v_b integer;
  v_set_number integer;
  v_needed integer;
  v_wins_a integer := 0;
  v_wins_b integer := 0;
  v_final_number integer;
  v_row record;
BEGIN
  IF p_actor IS NULL OR p_match IS NULL OR p_key IS NULL OR p_expected IS NULL
     OR p_expected < 0 OR jsonb_typeof(p_action) <> 'object' THEN
    RAISE EXCEPTION 'invalid command' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_match FROM scoreboard.matches WHERE id=p_match FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match unavailable' USING ERRCODE='P0002'; END IF;
  IF scoreboard.phase04_role(p_actor,p_match) IS NULL THEN
    RAISE EXCEPTION 'scoreboard access denied' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_prior FROM scoreboard.score_events
   WHERE match_id=p_match AND actor_user_id=p_actor AND idempotency_key=p_key;
  IF FOUND THEN
    IF v_prior.requested_action <> p_action THEN
      RAISE EXCEPTION 'idempotency key reused with different action' USING ERRCODE='22023';
    END IF;
    RETURN jsonb_build_object('state',scoreboard.phase04_snapshot(p_actor,p_match),'replayed',true);
  END IF;
  IF v_match.revision <> p_expected THEN
    RAISE EXCEPTION 'stale revision' USING ERRCODE='40001';
  END IF;
  v_type := p_action->>'type';
  IF v_type IS NULL OR v_type NOT IN ('AWARD','SUBTRACT','CORRECT_POINTS','CORRECT_SERVE',
                    'CONFIRM_SET','CORRECT_SET','CORRECT_CURRENT_SET') THEN
    RAISE EXCEPTION 'unknown scoring action' USING ERRCODE='22023';
  END IF;
  IF v_match.status <> 'LIVE' AND NOT (v_match.status='COMPLETED' AND v_type='CORRECT_SET') THEN
    RAISE EXCEPTION 'match is locked' USING ERRCODE='55000';
  END IF;
  SELECT * INTO v_config FROM scoreboard.match_configurations WHERE match_id=p_match;
  SELECT * INTO v_set FROM scoreboard.match_sets
    WHERE match_id=p_match AND set_number=v_match.current_set FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'current set missing' USING ERRCODE='23514'; END IF;
  v_needed := (v_config.best_of+1)/2;
  v_before := scoreboard.phase04_snapshot(p_actor,p_match);
  v_team := NULL;

  IF v_type IN ('AWARD','SUBTRACT') THEN
    v_team := p_action->>'team';
    IF v_team IS NULL OR v_team NOT IN ('A','B') THEN
      RAISE EXCEPTION 'invalid team' USING ERRCODE='22023';
    END IF;
    IF v_type='AWARD' THEN
      IF scoreboard.phase04_winner(v_set.team_a_points,v_set.team_b_points,
                                   v_set.set_number,v_config.best_of) IS NOT NULL THEN
        RAISE EXCEPTION 'set awaits confirmation' USING ERRCODE='55000';
      END IF;
      IF (v_team='A' AND v_set.team_a_points=2147483647)
        OR (v_team='B' AND v_set.team_b_points=2147483647) THEN
        RAISE EXCEPTION 'point overflow' USING ERRCODE='22003';
      END IF;
      UPDATE scoreboard.match_sets SET
        team_a_points=team_a_points+CASE WHEN v_team='A' THEN 1 ELSE 0 END,
        team_b_points=team_b_points+CASE WHEN v_team='B' THEN 1 ELSE 0 END
        WHERE id=v_set.id;
      UPDATE scoreboard.matches SET serving_team=v_team WHERE id=p_match;
    ELSE
      IF (v_team='A' AND v_set.team_a_points=0)
        OR (v_team='B' AND v_set.team_b_points=0) THEN
        RAISE EXCEPTION 'point cannot be negative' USING ERRCODE='22023';
      END IF;
      UPDATE scoreboard.match_sets SET
        team_a_points=team_a_points-CASE WHEN v_team='A' THEN 1 ELSE 0 END,
        team_b_points=team_b_points-CASE WHEN v_team='B' THEN 1 ELSE 0 END
        WHERE id=v_set.id;
    END IF;
  ELSIF v_type='CORRECT_POINTS' THEN
    IF (p_action->>'teamA') !~ '^(0|[1-9][0-9]*)$'
       OR (p_action->>'teamB') !~ '^(0|[1-9][0-9]*)$'
       OR length(p_action->>'teamA') > 10 OR length(p_action->>'teamB') > 10 THEN
      RAISE EXCEPTION 'invalid point values' USING ERRCODE='22023';
    END IF;
    v_a := (p_action->>'teamA')::integer;
    v_b := (p_action->>'teamB')::integer;
    IF v_a=v_set.team_a_points AND v_b=v_set.team_b_points THEN
      RAISE EXCEPTION 'scores unchanged' USING ERRCODE='22023';
    END IF;
    UPDATE scoreboard.match_sets SET team_a_points=v_a,team_b_points=v_b
      WHERE id=v_set.id;
  ELSIF v_type='CORRECT_SERVE' THEN
    v_team := p_action->>'serving';
    IF v_team IS NULL OR v_team NOT IN ('A','B') OR v_team=v_match.serving_team THEN
      RAISE EXCEPTION 'invalid serving correction' USING ERRCODE='22023';
    END IF;
    UPDATE scoreboard.matches SET serving_team=v_team WHERE id=p_match;
  ELSIF v_type='CONFIRM_SET' THEN
    IF NOT scoreboard.phase04_valid_final(v_set.team_a_points,v_set.team_b_points,
                                            v_set.set_number,v_config.best_of) THEN
      RAISE EXCEPTION 'set has no valid final score' USING ERRCODE='22023';
    END IF;
    v_winner := scoreboard.phase04_winner(v_set.team_a_points,v_set.team_b_points,
                                          v_set.set_number,v_config.best_of);
    UPDATE scoreboard.match_sets SET winner=v_winner,completed_at=now(),
      pending_finalization=false WHERE id=v_set.id;
    SELECT count(*) INTO v_set_number FROM scoreboard.match_sets
      WHERE match_id=p_match AND winner=v_winner;
    IF v_set_number >= v_needed THEN
      UPDATE scoreboard.matches SET status='COMPLETED',completed_at=now()
        WHERE id=p_match;
    ELSE
      INSERT INTO scoreboard.match_sets(match_id,set_number)
        VALUES(p_match,v_set.set_number+1);
      UPDATE scoreboard.matches SET current_set=v_set.set_number+1,
        serving_team=CASE WHEN (v_set.set_number+1)%2=1
                           THEN v_config.initial_serving_team
                          WHEN v_config.initial_serving_team='A' THEN 'B' ELSE 'A' END
        WHERE id=p_match;
    END IF;
  ELSIF v_type='CORRECT_SET' THEN
    IF (p_action->>'setNumber') !~ '^[1-5]$'
       OR (p_action->>'teamA') !~ '^(0|[1-9][0-9]*)$'
       OR (p_action->>'teamB') !~ '^(0|[1-9][0-9]*)$'
       OR length(p_action->>'teamA') > 10 OR length(p_action->>'teamB') > 10 THEN
      RAISE EXCEPTION 'invalid set correction' USING ERRCODE='22023';
    END IF;
    v_set_number := (p_action->>'setNumber')::integer;
    v_a := (p_action->>'teamA')::integer;
    v_b := (p_action->>'teamB')::integer;
    SELECT * INTO v_target FROM scoreboard.match_sets
      WHERE match_id=p_match AND set_number=v_set_number FOR UPDATE;
    IF NOT FOUND OR v_target.winner IS NULL OR
       (v_match.status='LIVE' AND v_set_number>=v_match.current_set) OR
       (v_a=v_target.team_a_points AND v_b=v_target.team_b_points) OR
       NOT scoreboard.phase04_valid_final(v_a,v_b,v_set_number,v_config.best_of) THEN
      RAISE EXCEPTION 'invalid confirmed set correction' USING ERRCODE='22023';
    END IF;
    v_winner := scoreboard.phase04_winner(v_a,v_b,v_set_number,v_config.best_of);
    UPDATE scoreboard.match_sets SET team_a_points=v_a,team_b_points=v_b,winner=v_winner
      WHERE id=v_target.id;
    SELECT max(set_number) INTO v_final_number FROM scoreboard.match_sets
      WHERE match_id=p_match AND winner IS NOT NULL;
    FOR v_row IN SELECT set_number,winner FROM scoreboard.match_sets
      WHERE match_id=p_match AND winner IS NOT NULL ORDER BY set_number LOOP
      IF v_row.winner='A' THEN v_wins_a:=v_wins_a+1;
      ELSE v_wins_b:=v_wins_b+1; END IF;
      IF (v_wins_a>=v_needed OR v_wins_b>=v_needed)
         AND (v_row.set_number<>v_final_number OR v_match.status<>'COMPLETED') THEN
        RAISE EXCEPTION 'correction conflicts with later match history' USING ERRCODE='23514';
      END IF;
    END LOOP;
    IF v_match.status='COMPLETED' AND greatest(v_wins_a,v_wins_b)<>v_needed THEN
      RAISE EXCEPTION 'completed match requires a winning set' USING ERRCODE='23514';
    END IF;
    v_set := v_target;
  ELSE
    IF (p_action->>'setNumber') !~ '^[1-5]$'
       OR (p_action->>'setNumber')::integer<>v_set.set_number-1
       OR v_set.team_a_points<>0 OR v_set.team_b_points<>0
       OR EXISTS (SELECT 1 FROM scoreboard.score_events WHERE set_id=v_set.id) THEN
      RAISE EXCEPTION 'current set cannot be reopened' USING ERRCODE='23514';
    END IF;
    SELECT * INTO v_target FROM scoreboard.match_sets
      WHERE match_id=p_match AND set_number=v_set.set_number-1 FOR UPDATE;
    IF NOT FOUND OR v_target.winner IS NULL THEN
      RAISE EXCEPTION 'previous set is not confirmed' USING ERRCODE='23514';
    END IF;
    DELETE FROM scoreboard.match_sets WHERE id=v_set.id;
    UPDATE scoreboard.match_sets SET winner=NULL,completed_at=NULL WHERE id=v_target.id;
    UPDATE scoreboard.matches SET current_set=v_target.set_number WHERE id=p_match;
    v_set := v_target;
  END IF;

  IF v_type IN ('AWARD','SUBTRACT','CORRECT_POINTS') THEN
    UPDATE scoreboard.match_sets
       SET pending_finalization = scoreboard.phase04_winner(
         team_a_points,team_b_points,set_number,v_config.best_of) IS NOT NULL
     WHERE id=v_set.id;
  END IF;
  UPDATE scoreboard.matches SET revision=revision+1,updated_at=now() WHERE id=p_match;
  v_after := scoreboard.phase04_snapshot(p_actor,p_match);
  INSERT INTO scoreboard.score_events
    (match_id,set_id,event_type,target_team,actor_user_id,idempotency_key,
     revision,previous_state,resulting_state,requested_action)
    VALUES(p_match,v_set.id,
      CASE v_type WHEN 'AWARD' THEN 'RALLY_AWARDED'
        WHEN 'SUBTRACT' THEN 'POINT_SUBTRACTED'
        WHEN 'CORRECT_POINTS' THEN 'POINTS_CORRECTED'
        WHEN 'CORRECT_SERVE' THEN 'SET_SERVE'
        WHEN 'CONFIRM_SET' THEN 'SET_FINALIZED'
        WHEN 'CORRECT_SET' THEN 'SET_RESULT_CORRECTED'
        ELSE 'CURRENT_SET_REOPENED' END,
      v_team,p_actor,p_key,p_expected+1,v_before,v_after,p_action);
  RETURN jsonb_build_object('state',v_after,'replayed',false);
END $fn$;
ALTER FUNCTION scoreboard.phase04_apply(uuid,uuid,uuid,bigint,jsonb)
  OWNER TO scoreboard_phase04_owner;
REVOKE ALL ON FUNCTION scoreboard.phase04_winner(integer,integer,integer,integer),
  scoreboard.phase04_valid_final(integer,integer,integer,integer),
  scoreboard.phase04_apply(uuid,uuid,uuid,bigint,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION scoreboard.phase04_winner(integer,integer,integer,integer),
  scoreboard.phase04_valid_final(integer,integer,integer,integer)
  TO scoreboard_phase04_owner;
GRANT EXECUTE ON FUNCTION scoreboard.phase04_apply(uuid,uuid,uuid,bigint,jsonb)
  TO scoreboard_runtime;
REVOKE CREATE ON SCHEMA scoreboard FROM scoreboard_phase04_owner;
COMMIT;
