-- REVIEW ONLY. Do not apply without the preflight in docs/DB_RUNBOOK.md.
-- Target: isolated PostgreSQL 18 rehearsal database only; no Supabase auth schema assumed.
BEGIN;

DO $$ BEGIN
  IF current_database() <> 'mva_scoreboard_rehearsal' THEN
    RAISE EXCEPTION 'Expected isolated mva_scoreboard_rehearsal database';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'scoreboard') THEN
    RAISE EXCEPTION 'scoreboard schema already exists; stop and review drift';
  END IF;
END $$;

CREATE SCHEMA scoreboard;
REVOKE ALL ON SCHEMA scoreboard FROM PUBLIC;

-- NOLOGIN group roles carry only the explicitly granted capabilities below.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'scoreboard_overlay_reader') THEN
    CREATE ROLE scoreboard_overlay_reader NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'scoreboard_server') THEN
    CREATE ROLE scoreboard_server NOLOGIN;
  END IF;
END $$;

CREATE TABLE scoreboard.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  mva_tournament_id uuid NOT NULL,
  mva_division_id uuid NOT NULL,
  mva_team_a_id uuid NOT NULL,
  mva_team_b_id uuid NOT NULL,
  mva_registration_a_id uuid NOT NULL,
  mva_registration_b_id uuid NOT NULL,
  tournament_name text NOT NULL CHECK (length(btrim(tournament_name)) BETWEEN 1 AND 150),
  division_name text NOT NULL CHECK (length(btrim(division_name)) BETWEEN 1 AND 100),
  team_a_name text NOT NULL CHECK (length(btrim(team_a_name)) BETWEEN 1 AND 150),
  team_b_name text NOT NULL CHECK (length(btrim(team_b_name)) BETWEEN 1 AND 150),
  team_a_logo_url text,
  team_b_logo_url text,
  status text NOT NULL DEFAULT 'UPCOMING' CHECK (status IN ('UPCOMING','LIVE','PAUSED','COMPLETED','CANCELLED')),
  current_set smallint NOT NULL DEFAULT 1 CHECK (current_set BETWEEN 1 AND 5),
  serving_team char(1) CHECK (serving_team IN ('A','B')),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK (mva_team_a_id <> mva_team_b_id),
  CHECK (mva_registration_a_id <> mva_registration_b_id)
);

CREATE TABLE scoreboard.match_configurations (
  match_id uuid PRIMARY KEY REFERENCES scoreboard.matches(id) ON DELETE RESTRICT,
  best_of smallint NOT NULL CHECK (best_of IN (3,5)),
  normal_target smallint NOT NULL DEFAULT 25 CHECK (normal_target = 25),
  deciding_target smallint NOT NULL DEFAULT 15 CHECK (deciding_target = 15),
  win_by_two boolean NOT NULL DEFAULT true CHECK (win_by_two),
  point_cap smallint CHECK (point_cap IS NULL),
  initial_serving_team char(1) NOT NULL CHECK (initial_serving_team IN ('A','B')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE scoreboard.match_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES scoreboard.matches(id) ON DELETE RESTRICT,
  set_number smallint NOT NULL CHECK (set_number BETWEEN 1 AND 5),
  team_a_points integer NOT NULL DEFAULT 0 CHECK (team_a_points >= 0),
  team_b_points integer NOT NULL DEFAULT 0 CHECK (team_b_points >= 0),
  winner char(1) CHECK (winner IN ('A','B')),
  pending_finalization boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (match_id,set_number),
  CHECK ((winner IS NULL AND completed_at IS NULL) OR (winner IS NOT NULL AND completed_at IS NOT NULL)),
  CHECK (NOT (pending_finalization AND winner IS NOT NULL))
);

CREATE TABLE scoreboard.role_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('ADMIN','SCOREKEEPER')),
  granted_by_user_id uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_by_user_id uuid,
  revoked_at timestamptz,
  CHECK ((revoked_by_user_id IS NULL) = (revoked_at IS NULL))
);
CREATE UNIQUE INDEX role_grants_one_active ON scoreboard.role_grants(user_id,role) WHERE revoked_at IS NULL;

CREATE TABLE scoreboard.scorekeeper_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES scoreboard.matches(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  assigned_by_user_id uuid NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  revoked_by_user_id uuid,
  revoked_at timestamptz,
  CHECK ((revoked_by_user_id IS NULL) = (revoked_at IS NULL))
);
CREATE UNIQUE INDEX assignments_one_active ON scoreboard.scorekeeper_assignments(match_id,user_id) WHERE revoked_at IS NULL;
CREATE INDEX assignments_user_active ON scoreboard.scorekeeper_assignments(user_id,match_id) WHERE revoked_at IS NULL;

CREATE TABLE scoreboard.score_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES scoreboard.matches(id) ON DELETE RESTRICT,
  set_id uuid REFERENCES scoreboard.match_sets(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('RALLY_AWARDED','SET_SERVE','UNDO','SET_FINALIZED','MATCH_REOPENED','MATCH_STATUS_CHANGED')),
  target_team char(1) CHECK (target_team IN ('A','B')),
  actor_user_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  correction_of_event_id uuid REFERENCES scoreboard.score_events(id) ON DELETE RESTRICT,
  reason text,
  previous_state jsonb NOT NULL,
  resulting_state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id,revision),
  UNIQUE (match_id,actor_user_id,idempotency_key),
  CHECK (correction_of_event_id IS NULL OR correction_of_event_id <> id)
);
CREATE INDEX score_events_match_time ON scoreboard.score_events(match_id,created_at,id);
CREATE UNIQUE INDEX score_events_one_undo ON scoreboard.score_events(correction_of_event_id) WHERE event_type = 'UNDO';

CREATE TABLE scoreboard.admin_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  action text NOT NULL CHECK (length(btrim(action)) BETWEEN 1 AND 100),
  target_type text NOT NULL CHECK (length(btrim(target_type)) BETWEEN 1 AND 50),
  target_id uuid,
  before_state jsonb,
  after_state jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_target_time ON scoreboard.admin_audit_events(target_type,target_id,created_at DESC);

-- History is append-only even for the privileged application path. A superuser
-- can still bypass database protections; migration credentials never enter app code.
CREATE FUNCTION scoreboard.reject_history_change() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN RAISE EXCEPTION 'scoreboard history is append-only'; END $$;
CREATE TRIGGER score_events_append_only BEFORE UPDATE OR DELETE ON scoreboard.score_events
FOR EACH ROW EXECUTE FUNCTION scoreboard.reject_history_change();
CREATE TRIGGER admin_audit_append_only BEFORE UPDATE OR DELETE ON scoreboard.admin_audit_events
FOR EACH ROW EXECUTE FUNCTION scoreboard.reject_history_change();

CREATE INDEX matches_status_updated ON scoreboard.matches(status,updated_at DESC);
CREATE INDEX matches_tournament_division ON scoreboard.matches(mva_tournament_id,mva_division_id);

-- No direct table access for anon, authenticated, or the NOLOGIN group roles.
REVOKE ALL ON ALL TABLES IN SCHEMA scoreboard FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA scoreboard FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA scoreboard FROM PUBLIC;

ALTER TABLE scoreboard.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoreboard.matches FORCE ROW LEVEL SECURITY;
ALTER TABLE scoreboard.match_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoreboard.match_configurations FORCE ROW LEVEL SECURITY;
ALTER TABLE scoreboard.match_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoreboard.match_sets FORCE ROW LEVEL SECURITY;
ALTER TABLE scoreboard.role_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoreboard.role_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE scoreboard.scorekeeper_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoreboard.scorekeeper_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE scoreboard.score_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoreboard.score_events FORCE ROW LEVEL SECURITY;
ALTER TABLE scoreboard.admin_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoreboard.admin_audit_events FORCE ROW LEVEL SECURITY;
-- No RLS policies yet: default deny. Server mutation functions come later.

-- View is the only planned public read surface. It exposes no actor or grant data.
-- Not granted to a LOGIN role until its server route and threat model are reviewed.
CREATE VIEW scoreboard.overlay_matches WITH (security_barrier = true) AS
SELECT m.public_id, m.tournament_name, m.division_name,
       m.team_a_name, m.team_b_name, m.team_a_logo_url, m.team_b_logo_url,
       m.status, m.current_set, m.serving_team, m.revision,
       COALESCE((SELECT jsonb_agg(jsonb_build_object(
         'setNumber',s.set_number,'teamAPoints',s.team_a_points,
         'teamBPoints',s.team_b_points,'winner',s.winner) ORDER BY s.set_number)
         FROM scoreboard.match_sets s WHERE s.match_id = m.id), '[]'::jsonb) AS sets
FROM scoreboard.matches m;
REVOKE ALL ON scoreboard.overlay_matches FROM PUBLIC;
GRANT USAGE ON SCHEMA scoreboard TO scoreboard_overlay_reader;
GRANT SELECT ON scoreboard.overlay_matches TO scoreboard_overlay_reader;
GRANT USAGE ON SCHEMA scoreboard TO scoreboard_server;

COMMIT;
