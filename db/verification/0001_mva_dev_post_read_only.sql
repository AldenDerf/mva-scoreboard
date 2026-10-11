-- Phase 01H: run only after a separately approved foundation migration on local mva_dev.
-- Reports pass/fail rows; a single false or null result is a failed post-check.
-- Pure catalog reads in a read-only transaction. It does not create roles or data.
BEGIN READ ONLY;

WITH
expected_tables(name) AS (
  VALUES ('matches'), ('match_configurations'), ('match_sets'),
         ('role_grants'), ('scorekeeper_assignments'),
         ('score_events'), ('admin_audit_events')
),
actual_tables AS (
  SELECT c.oid, c.relname, c.relowner, c.relacl,
         c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'scoreboard' AND c.relkind = 'r'
),
expected_indexes(name) AS (
  VALUES ('role_grants_one_active'), ('assignments_one_active'),
         ('assignments_user_active'), ('score_events_match_time'),
         ('score_events_one_undo'), ('admin_audit_target_time'),
         ('matches_status_updated'), ('matches_tournament_division')
),
actual_indexes AS (
  SELECT indexname FROM pg_indexes WHERE schemaname = 'scoreboard'
),
checks(check_name, passed) AS (
  VALUES
  ('target database and local cluster',
    current_database() = 'mva_dev'
    AND inet_server_addr() = inet '::1'
    AND inet_server_port() = 5432
    AND (SELECT system_identifier FROM pg_control_system()) = '7629597861964584196'),
  ('scoreboard schema and seven exact tables',
    to_regnamespace('scoreboard') IS NOT NULL
    AND (SELECT count(*) FROM actual_tables) = 7
    AND NOT EXISTS (SELECT name FROM expected_tables EXCEPT SELECT relname FROM actual_tables)
    AND NOT EXISTS (SELECT relname FROM actual_tables EXCEPT SELECT name FROM expected_tables)),
  ('expected constraints',
    (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
     WHERE n.nspname = 'scoreboard') = 103
    AND (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
         WHERE n.nspname = 'scoreboard' AND c.contype = 'p') = 7
    AND (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
         WHERE n.nspname = 'scoreboard' AND c.contype = 'f') = 6),
  ('19 indexes and all explicit indexes',
    (SELECT count(*) FROM actual_indexes) = 19
    AND NOT EXISTS (SELECT name FROM expected_indexes EXCEPT SELECT indexname FROM actual_indexes)),
  ('forced RLS on every base table',
    (SELECT count(*) FROM actual_tables WHERE relrowsecurity AND relforcerowsecurity) = 7),
  ('no scoreboard RLS policies',
    NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'scoreboard')),
  ('two NOLOGIN capability roles without bypass',
    (SELECT count(*) FROM pg_roles WHERE rolname IN ('scoreboard_server','scoreboard_overlay_reader')
       AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
       AND NOT rolcreatedb AND NOT rolcreaterole) = 2),
  ('no application runtime login provisioned',
    NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'scoreboard_runtime')),
  ('schema grants limited to owner and two USAGE roles',
    EXISTS (SELECT 1 FROM pg_namespace n, LATERAL aclexplode(n.nspacl) a
            JOIN pg_roles r ON r.oid = a.grantee
            WHERE n.nspname = 'scoreboard' AND r.rolname = 'scoreboard_server'
              AND a.privilege_type = 'USAGE')
    AND EXISTS (SELECT 1 FROM pg_namespace n, LATERAL aclexplode(n.nspacl) a
                JOIN pg_roles r ON r.oid = a.grantee
                WHERE n.nspname = 'scoreboard' AND r.rolname = 'scoreboard_overlay_reader'
                  AND a.privilege_type = 'USAGE')
    AND NOT EXISTS (SELECT 1 FROM pg_namespace n, LATERAL aclexplode(n.nspacl) a
                    LEFT JOIN pg_roles r ON r.oid = a.grantee
                    WHERE n.nspname = 'scoreboard' AND a.grantee <> n.nspowner
                      AND (r.rolname IS NULL OR r.rolname NOT IN
                           ('scoreboard_server','scoreboard_overlay_reader')
                           OR a.privilege_type <> 'USAGE'))),
  ('base tables grant no non-owner access or anonymous writes',
    NOT EXISTS (SELECT 1 FROM actual_tables t,
               LATERAL aclexplode(coalesce(t.relacl, acldefault('r', t.relowner))) a
               WHERE a.grantee <> t.relowner)),
  ('overlay view is security barrier with exact columns',
    EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'scoreboard' AND c.relname = 'overlay_matches'
              AND c.relkind = 'v' AND 'security_barrier=true' = ANY(c.reloptions))
    AND (SELECT array_agg(a.attname::text ORDER BY a.attnum)
         FROM pg_attribute a WHERE a.attrelid = to_regclass('scoreboard.overlay_matches')
         AND a.attnum > 0 AND NOT a.attisdropped) = ARRAY[
           'public_id','tournament_name','division_name','team_a_name','team_b_name',
           'team_a_logo_url','team_b_logo_url','status','current_set',
           'serving_team','revision','sets']),
  ('overlay SELECT only for its capability role',
    EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace,
             LATERAL aclexplode(c.relacl) a JOIN pg_roles r ON r.oid = a.grantee
            WHERE n.nspname = 'scoreboard' AND c.relname = 'overlay_matches'
              AND r.rolname = 'scoreboard_overlay_reader' AND a.privilege_type = 'SELECT')
    AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace,
                    LATERAL aclexplode(c.relacl) a LEFT JOIN pg_roles r ON r.oid = a.grantee
                    WHERE n.nspname = 'scoreboard' AND c.relname = 'overlay_matches'
                      AND a.grantee <> c.relowner
                      AND (r.rolname IS NULL OR r.rolname <> 'scoreboard_overlay_reader'
                           OR a.privilege_type <> 'SELECT'))),
  ('append-only triggers and no public function execute',
    (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'scoreboard' AND NOT t.tgisinternal
       AND t.tgname IN ('score_events_append_only','admin_audit_append_only')) = 2
    AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
                    LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                    WHERE n.nspname = 'scoreboard' AND a.grantee <> p.proowner)),
  ('MVA table inventory remains at Phase 01G baseline',
    (SELECT count(*) FROM pg_tables WHERE schemaname = 'public') = 11
    AND (SELECT count(*) FROM pg_tables WHERE schemaname = 'private_app') = 2
    AND NOT EXISTS (SELECT name FROM (VALUES
      ('private_app._prisma_migrations'), ('private_app.invite_access'),
      ('public.admin_access'), ('public.admin_audit_logs'),
      ('public.league_categories'), ('public.leagues'),
      ('public.payment_allocations'), ('public.payments'),
      ('public.players'), ('public.profiles'),
      ('public.registration_players'), ('public.registrations'),
      ('public.teams')) expected(name)
      EXCEPT SELECT schemaname || '.' || tablename FROM pg_tables
      WHERE schemaname IN ('public','private_app'))
    AND (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
         WHERE n.nspname = 'public') = 112
    AND (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public') = 49)
)
SELECT check_name, passed, bool_and(passed) OVER () AS all_checks_pass
FROM checks ORDER BY check_name;

-- Compare this definition fingerprint with the same query captured immediately
-- before migration. Counts and names alone cannot prove MVA definitions unchanged.
WITH definitions AS (
  SELECT 'table|' || c.oid::regclass::text || '|' || c.relrowsecurity::text || '|'
         || c.relforcerowsecurity::text || '|' || coalesce(c.relacl::text, '') AS definition
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  UNION ALL
  SELECT 'column|' || c.oid::regclass::text || '|' || a.attnum::text || '|'
         || a.attname || '|' || format_type(a.atttypid, a.atttypmod) || '|'
         || a.attnotnull::text || '|' || coalesce(pg_get_expr(d.adbin, d.adrelid), '')
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
       LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  UNION ALL
  SELECT 'constraint|' || c.conrelid::regclass::text || '|' || c.conname || '|'
         || pg_get_constraintdef(c.oid)
  FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
  WHERE n.nspname = 'public'
  UNION ALL
  SELECT 'index|' || i.schemaname || '.' || i.indexname || '|' || i.indexdef
  FROM pg_indexes i WHERE i.schemaname = 'public'
  UNION ALL
  SELECT 'trigger|' || t.tgrelid::regclass::text || '|' || t.tgname || '|'
         || pg_get_triggerdef(t.oid)
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND NOT t.tgisinternal
  UNION ALL
  SELECT 'policy|' || p.polrelid::regclass::text || '|' || p.polname || '|'
         || coalesce(pg_get_expr(p.polqual, p.polrelid), '') || '|'
         || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
)
SELECT count(*) AS public_definition_entries,
       md5(string_agg(definition, E'\n' ORDER BY definition)) AS public_definition_sha
FROM definitions;

ROLLBACK;
