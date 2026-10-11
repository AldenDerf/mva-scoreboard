-- Run only after an approved isolated rehearsal migration. Read-only queries.
BEGIN READ ONLY;
SELECT current_database() AS database_name, current_user AS connected_role,
       current_setting('server_version_num') AS postgres_version_num;
SELECT current_database() = 'mva_scoreboard_rehearsal' AS expected_rehearsal_database,
       inet_server_port() = 55432 AS expected_rehearsal_port;
SELECT nspname AS schema_name FROM pg_namespace WHERE nspname IN ('public','auth','scoreboard') ORDER BY 1;
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'scoreboard' AND c.relkind = 'r' ORDER BY relname;
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'scoreboard' ORDER BY grantee, table_name, privilege_type;
SELECT to_regclass('public.leagues') IS NULL AS no_mva_leagues_in_isolated_cluster,
       to_regclass('public.registrations') IS NULL AS no_mva_registrations_in_isolated_cluster,
       to_regclass('public.teams') IS NULL AS no_mva_teams_in_isolated_cluster;
ROLLBACK;
