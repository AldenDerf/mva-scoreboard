-- Run only against a disposable PostgreSQL 18 cluster after adapted proposals.
-- Synthetic identities and a transaction that is rolled back at completion.
BEGIN;
INSERT INTO scoreboard.role_grants(user_id,role,granted_by_user_id)
  VALUES('11111111-1111-4111-8111-111111111111','ADMIN',
         '11111111-1111-4111-8111-111111111111');
SET ROLE scoreboard_runtime;
DO $test$
DECLARE
  v_actor uuid := '11111111-1111-4111-8111-111111111111';
  v_other uuid := '22222222-2222-4222-8222-222222222222';
  v_id uuid;
  v_public uuid;
  v_result jsonb;
  v_state jsonb;
  v_key uuid := '33333333-3333-4333-8333-333333333333';
BEGIN
  v_id := scoreboard.phase04_create_test_match(v_actor,'North','South',3::smallint,'A'::char(1));
  v_state := scoreboard.phase04_snapshot(v_actor,v_id);
  IF v_state->>'status'<>'LIVE' OR (v_state->>'revision')::int<>0
     OR jsonb_array_length(v_state->'sets')<>1 THEN
    RAISE EXCEPTION 'creation snapshot failed';
  END IF;
  v_public := (v_state->>'publicId')::uuid;
  IF scoreboard.phase04_overlay(v_public)->>'teamA'<>'North' THEN
    RAISE EXCEPTION 'overlay snapshot failed';
  END IF;
  BEGIN
    PERFORM scoreboard.phase04_snapshot(v_other,v_id);
    RAISE EXCEPTION 'unauthorized snapshot unexpectedly worked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM scoreboard.phase04_create_test_match(v_other,'No','Grant',3::smallint,'A'::char(1));
    RAISE EXCEPTION 'unauthorized creation unexpectedly worked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM scoreboard.matches;
    RAISE EXCEPTION 'base-table read unexpectedly worked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  v_result := scoreboard.phase04_apply(v_actor,v_id,v_key,0,
    '{"type":"AWARD","team":"A"}'::jsonb);
  IF (v_result->'state'->>'revision')::int<>1
     OR (v_result->'state'->'sets'->0->>'teamA')::int<>1 THEN
    RAISE EXCEPTION 'award failed';
  END IF;
  v_result := scoreboard.phase04_apply(v_actor,v_id,v_key,0,
    '{"type":"AWARD","team":"A"}'::jsonb);
  IF v_result->>'replayed'<>'true'
     OR (v_result->'state'->'sets'->0->>'teamA')::int<>1 THEN
    RAISE EXCEPTION 'idempotent replay failed';
  END IF;
  BEGIN
    PERFORM scoreboard.phase04_apply(v_actor,v_id,v_key,1,
      '{"type":"AWARD","team":"B"}'::jsonb);
    RAISE EXCEPTION 'mismatched replay unexpectedly worked';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM scoreboard.phase04_apply(v_actor,v_id,gen_random_uuid(),0,
      '{"type":"AWARD","team":"B"}'::jsonb);
    RAISE EXCEPTION 'stale revision unexpectedly worked';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;
  BEGIN
    PERFORM scoreboard.phase04_apply(v_actor,v_id,gen_random_uuid(),1,
      '{"setNumber":1}'::jsonb);
    RAISE EXCEPTION 'missing action type unexpectedly worked';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  v_result := scoreboard.phase04_apply(v_actor,v_id,gen_random_uuid(),1,
    '{"type":"SUBTRACT","team":"A"}'::jsonb);
  IF (v_result->'state'->'sets'->0->>'teamA')::int<>0 THEN
    RAISE EXCEPTION 'subtraction failed';
  END IF;
  BEGIN
    PERFORM scoreboard.phase04_apply(v_actor,v_id,gen_random_uuid(),2,
      '{"type":"SUBTRACT","team":"A"}'::jsonb);
    RAISE EXCEPTION 'negative point unexpectedly worked';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  v_result := scoreboard.phase04_apply(v_actor,v_id,gen_random_uuid(),2,
    '{"type":"CORRECT_POINTS","teamA":25,"teamB":23}'::jsonb);
  IF (v_result->'state'->'sets'->0->>'winner')<>'null' AND
     v_result->'state'->'sets'->0->>'winner' IS NOT NULL THEN
    RAISE EXCEPTION 'set finalized prematurely';
  END IF;
  v_result := scoreboard.phase04_apply(v_actor,v_id,gen_random_uuid(),3,
    '{"type":"CONFIRM_SET"}'::jsonb);
  IF jsonb_array_length(v_result->'state'->'sets')<>2
     OR (v_result->'state'->>'currentSet')::int<>2 THEN
    RAISE EXCEPTION 'set confirmation failed';
  END IF;
  v_result := scoreboard.phase04_apply(v_actor,v_id,gen_random_uuid(),4,
    '{"type":"CORRECT_CURRENT_SET","setNumber":1}'::jsonb);
  IF jsonb_array_length(v_result->'state'->'sets')<>1
     OR v_result->'state'->'sets'->0->>'winner' IS NOT NULL THEN
    RAISE EXCEPTION 'previous set reopening failed';
  END IF;
END $test$;
RESET ROLE;
ROLLBACK;
