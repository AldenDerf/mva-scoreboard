-- Read-only local preflight. Report object names and aggregate counts only.
BEGIN READ ONLY;
SELECT current_database() AS database_name, inet_server_addr() AS server_address,
  inet_server_port() AS server_port,
  (SELECT system_identifier FROM pg_control_system()) AS cluster_id,
  current_setting('server_version_num') AS server_version;
SELECT c.relname AS scoreboard_table, c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='scoreboard' AND c.relkind='r' ORDER BY c.relname;
SELECT p.proname AS scoreboard_function, p.prosecdef AS security_definer
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='scoreboard' ORDER BY p.proname;
SELECT rolname,rolcanlogin,rolsuper,rolbypassrls
  FROM pg_roles WHERE rolname LIKE 'scoreboard_%' ORDER BY rolname;
SELECT (SELECT count(*) FROM scoreboard.matches) AS match_count,
  (SELECT count(*) FROM scoreboard.score_events) AS event_count,
  (SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='scoreboard') AS policy_count;
COMMIT;
