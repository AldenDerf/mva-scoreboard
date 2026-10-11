-- Run only after a separately approved nonproduction migration. Read-only queries.
BEGIN READ ONLY;
SELECT current_database() AS database_name, current_user AS connected_role,
       current_setting('server_version_num') AS postgres_version_num;
SELECT nspname AS schema_name FROM pg_namespace WHERE nspname IN ('public','auth','scoreboard') ORDER BY 1;
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'scoreboard' AND c.relkind = 'r' ORDER BY relname;
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'scoreboard' ORDER BY grantee, table_name, privilege_type;
SELECT to_regclass('public.leagues') IS NOT NULL AS mva_leagues_intact,
       to_regclass('public.registrations') IS NOT NULL AS mva_registrations_intact,
       to_regclass('public.teams') IS NOT NULL AS mva_teams_intact;
ROLLBACK;
